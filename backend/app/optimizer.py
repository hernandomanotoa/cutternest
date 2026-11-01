from typing import Any, Dict, List, Tuple

from fastapi import HTTPException, status
from rectpack import newPacker

from app.config import get_settings

settings = get_settings()


def _packer_with_best_algorithm(rotation: bool = True):
    """Crea un packer de rectpack con el mejor algoritmo disponible.

    Usa ordenamiento global (PackerGlobal) + best-bin-fit para aprovechar
    sobrantes y tableros nuevos de forma híbrida. El algoritmo de empaque
    por defecto es MaxRectsBssf, uno de los mejores equilibrios entre
    calidad y velocidad para nesting 2D guillotinable/no guillotinable.
    """
    try:
        from rectpack import (
            PackerBBF,
            PackerGlobal,
            SORT_AREA,
            MaxRectsBssf,
        )

        return newPacker(
            mode=PackerGlobal,
            bin_algo=PackerBBF,
            pack_algo=MaxRectsBssf,
            sort_algo=SORT_AREA,
            rotation=rotation,
        )
    except Exception:
        # Fallback robusto si alguna constante no estuviera disponible
        return newPacker(rotation=rotation)


def _expanded_rects(
    pieces: List[Dict[str, Any]],
    eje_veta: str = "ancho",
) -> List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]]:
    """Expande cantidades y devuelve tuplas con la huella de corte orientada.

    Cada tupla es (w, h, ow, oh, rid, rot, original):
      - ow/oh: dimensiones reales de la pieza (ancho/alto del CSV).
      - w/h: huella sobre el tablero. Las piezas con rotate=False (veta
        bloqueada) se pre-orientan para que su lado de veta —la primera
        medida, convención del taller— quede paralelo al eje de veta del
        tablero: con eje_veta='ancho' van como vienen; con 'alto' se
        invierten. rotate=True va siempre con la huella original (el
        optimizador decide, la veta es libre).
    """
    rects = []
    for p in pieces:
        ow = float(p["ancho"])
        oh = float(p["alto"])
        rot = bool(p.get("rotate", True))
        w, h = (ow, oh) if rot or eje_veta == "ancho" else (oh, ow)
        qty = int(p.get("cantidad", 1))
        for i in range(qty):
            rects.append((w, h, ow, oh, f"{p['id']}__{i}", rot, p))
    return rects


def _validate_pieces_fit(
    board_width_mm: float,
    board_height_mm: float,
    margin_mm: float,
    kerf_mm: float,
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
) -> None:
    """Rechaza piezas que no caben en el tablero utilizable con su huella.

    La pieza se considera con su tamaño de corte más el kerf (ancho de la
    sierra). Las piezas bloqueadas (rotate=False) ya vienen orientadas a
    su eje de veta: no pueden girar, así que la única orientación posible
    es la de su huella.
    """
    usable_w = board_width_mm - 2 * margin_mm
    usable_h = board_height_mm - 2 * margin_mm
    if usable_w <= 0 or usable_h <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dimensiones de tablero inválidas",
        )

    for w, h, ow, oh, rid, rot, original in rects:
        # Las bloqueadas solo pueden ir con su huella (ya orientada al eje de
        # veta); las libres pueden presentarse en cualquiera de las dos.
        fits = (
            (w + kerf_mm <= usable_w and h + kerf_mm <= usable_h)
            or (rot and h + kerf_mm <= usable_w and w + kerf_mm <= usable_h)
        )
        if not fits:
            name = original.get("nombre", rid.rsplit("__", 1)[0])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PIECE_TOO_LARGE: La pieza '{name}' ({ow:.2f} x {oh:.2f} mm) excede las dimensiones útiles del tablero",
            )


def _pack_phase(
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
    offcut_boards: List[Dict[str, Any]],
    usable_w: float,
    usable_h: float,
    kerf_mm: float,
    margin_mm: float,
    rotation: bool,
    phase: str,
) -> Dict[str, Dict[str, Any]]:
    """Empaqueta un subconjunto de piezas en sobrantes + tableros nuevos.

    Devuelve bins {bid: {width, height, placements}} con los placements
    ya convertidos (coordenadas con margen, dimensiones sin kerf). Los bids
    llevan prefijo de fase para no colisionar entre fases.
    """
    packer = _packer_with_best_algorithm(rotation=rotation)
    bid_to_offcut_id = {off["bid"]: off.get("id") for off in offcut_boards}
    for w, h, ow, oh, rid, rot, original in rects:
        packer.add_rect(w + kerf_mm, h + kerf_mm, rid)

    for off in offcut_boards:
        packer.add_bin(off["width"], off["height"], bid=f"{phase}__{off['bid']}")
    for i in range(50):
        packer.add_bin(usable_w, usable_h, bid=f"{phase}__nuevo_{i}")

    packer.pack()

    bins: Dict[str, Dict[str, Any]] = {}
    for abin in packer:
        bid = abin.bid
        is_new_board = bid.startswith(f"{phase}__nuevo_")
        if bid not in bins:
            bins[bid] = {
                "width": abin.width + (2 * margin_mm if is_new_board else 0),
                "height": abin.height + (2 * margin_mm if is_new_board else 0),
                "placements": [],
            }
        for rect in abin:
            rid = rect.rid
            base_id, _idx = rid.rsplit("__", 1)
            original = next((r[6] for r in rects if r[4] == rid), None)
            ow, oh = next(((r[2], r[3]) for r in rects if r[4] == rid), (rect.width, rect.height))
            bins[bid]["placements"].append({
                "id": base_id,
                "nombre": original["nombre"] if original else base_id,
                "x": rect.x + (margin_mm if is_new_board else 0),
                "y": rect.y + (margin_mm if is_new_board else 0),
                "w": rect.width - kerf_mm,
                "h": rect.height - kerf_mm,
                "color": original.get("color", "#3B82F6") if original else "#3B82F6",
                "espesor": original.get("espesor", 18.0) if original else 18.0,
                "rotado": abs(rect.width - (ow + kerf_mm)) > 1e-6,
                "en_sobrante": not is_new_board,
                "offcut_id": bid_to_offcut_id.get(bid.split("__", 1)[1]) if not is_new_board else None,
                "veta": original.get("__veta__", "libre") if original else "libre",
            })
    return bins


def optimize_cuts(
    board_width_mm: float,
    board_height_mm: float,
    pieces: List[Dict[str, Any]],
    offcuts: List[Dict[str, Any]] = None,
    kerf_mm: float = None,
    margin_mm: float = None,
    eje_veta: str = "ancho",
) -> Dict[str, Any]:
    """
    Optimiza el corte de piezas en tableros usando rectpack.
    Las dimensiones están en mm. Retorna lista de tableros con placements,
    métricas y la lista de IDs de sobrantes consumidos.

    Sentido de veta: las piezas con rotate=False tienen la veta bloqueada a
    lo largo de su primera medida (convención del taller); se pre-orientan
    paralelas al `eje_veta` del tablero ('ancho' = a lo largo del lado
    ancho, 'alto' = a lo largo del lado alto) y se empacan en una fase sin
    rotación, de modo que el packer jamás las gira. Las piezas rotate=True
    se empacan en otra fase con rotación libre (su veta no es exigible).
    Cada unidad de sobrante se asigna a una sola fase (no se puede compartir
    el espacio parcial entre fases), repartiéndose de forma alterna.
    """
    offcuts = offcuts or []
    kerf_mm = kerf_mm if kerf_mm is not None else settings.kerf_mm
    margin_mm = margin_mm if margin_mm is not None else settings.margen_mm
    eje_veta = "alto" if eje_veta == "alto" else "ancho"

    rects = _expanded_rects(pieces, eje_veta)
    _validate_pieces_fit(board_width_mm, board_height_mm, margin_mm, kerf_mm, rects)

    # Etiqueta de veta por pieza para los placements: las bloqueadas quedan
    # paralelas al eje de veta del tablero; las libres, 'libre'.
    veta_bloqueada = "vertical" if eje_veta == "alto" else "horizontal"
    for _w, _h, _ow, _oh, _rid, rot, original in rects:
        original["__veta__"] = "libre" if rot else veta_bloqueada

    free_rects = [r for r in rects if r[5]]
    locked_rects = [r for r in rects if not r[5]]

    # Normalizar sobrantes: claves width/height/bid (los callers usan
    # ancho/alto y el bid puede faltar). Cada unidad es un bin independiente.
    offcut_boards = []
    for off in offcuts:
        bid = str(off.get("bid") or off.get("id") or f"sobrante_{len(offcut_boards)}")
        offcut_boards.append({
            "id": off.get("id"),
            "bid": bid,
            "width": float(off["ancho"]),
            "height": float(off["alto"]),
        })

    # Sobrantes: cada unidad a una sola fase (reparto alterno determinista).
    offcuts_free = [o for i, o in enumerate(offcut_boards) if i % 2 == 0]
    offcuts_locked = [o for i, o in enumerate(offcut_boards) if i % 2 == 1]

    usable_w = board_width_mm - 2 * margin_mm
    usable_h = board_height_mm - 2 * margin_mm

    bins: Dict[str, Dict[str, Any]] = {}
    if free_rects:
        bins.update(_pack_phase(
            free_rects, offcuts_free, usable_w, usable_h, kerf_mm, margin_mm,
            rotation=True, phase="libre",
        ))
    if locked_rects:
        bins.update(_pack_phase(
            locked_rects, offcuts_locked, usable_w, usable_h, kerf_mm, margin_mm,
            rotation=False, phase="fija",
        ))

    # Filtrar bins vacíos, reindexar y calcular métricas.
    used_boards = []
    total_area = 0.0
    used_area = 0.0
    offcut_ids_used: List[str] = []
    for idx, (bid, data) in enumerate(bins.items()):
        if not data["placements"]:
            continue
        board_area = data["width"] * data["height"]
        used = sum(p["w"] * p["h"] for p in data["placements"])
        utilization = used / board_area if board_area > 0 else 0
        used_boards.append({
            "board_index": idx,
            "ancho": data["width"],
            "alto": data["height"],
            "utilizacion": round(utilization * 100, 2),
            "placements": data["placements"],
        })
        total_area += board_area
        used_area += used
        if "__nuevo_" not in bid:
            # bid: "{fase}__{offcut_bid}" → consumo por offcut_id real.
            offcut_ids_used.append(bid.split("__", 1)[1])

    # Calcular área de todas las piezas para comparar.
    pieces_area = sum(float(p["ancho"]) * float(p["alto"]) * int(p.get("cantidad", 1)) for p in pieces)

    return {
        "tableros": used_boards,
        "total_tableros": len(used_boards),
        "area_total_m2": round(total_area / 1_000_000, 4),
        "area_usada_m2": round(used_area / 1_000_000, 4),
        "area_piezas_m2": round(pieces_area / 1_000_000, 4),
        "offcut_ids_used": offcut_ids_used,
    }
