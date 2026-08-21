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


def _expanded_rects(pieces: List[Dict[str, Any]]) -> List[Tuple[float, float, str, bool, Dict[str, Any]]]:
    """Expande cantidades y devuelve tuplas (w, h, rid, rot, original)."""
    rects = []
    for p in pieces:
        w = float(p["ancho"])
        h = float(p["alto"])
        rot = bool(p.get("rotate", True))
        qty = int(p.get("cantidad", 1))
        for i in range(qty):
            rects.append((w, h, f"{p['id']}__{i}", rot, p))
    return rects


def _validate_pieces_fit(
    board_width_mm: float,
    board_height_mm: float,
    margin_mm: float,
    rects: List[Tuple[float, float, str, bool, Dict[str, Any]]],
) -> None:
    """Rechaza piezas que no caben en el tablero utilizable ni rotando."""
    usable_w = board_width_mm - 2 * margin_mm
    usable_h = board_height_mm - 2 * margin_mm
    if usable_w <= 0 or usable_h <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dimensiones de tablero inválidas",
        )

    for w, h, rid, rot, original in rects:
        fits = (w <= usable_w and h <= usable_h) or (rot and h <= usable_w and w <= usable_h)
        if not fits:
            name = original.get("nombre", rid.rsplit("__", 1)[0])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PIECE_TOO_LARGE: La pieza '{name}' ({w:.2f} x {h:.2f} mm) excede las dimensiones útiles del tablero",
            )


def optimize_cuts(
    board_width_mm: float,
    board_height_mm: float,
    pieces: List[Dict[str, Any]],
    offcuts: List[Dict[str, Any]] = None,
    kerf_mm: float = None,
    margin_mm: float = None,
) -> Dict[str, Any]:
    """
    Optimiza el corte de piezas en tableros usando rectpack.
    Las dimensiones están en mm. Retorna lista de tableros con placements,
    métricas y la lista de IDs de sobrantes consumidos.
    """
    offcuts = offcuts or []
    kerf_mm = kerf_mm if kerf_mm is not None else settings.kerf_mm
    margin_mm = margin_mm if margin_mm is not None else settings.margen_mm

    rects = _expanded_rects(pieces)
    _validate_pieces_fit(board_width_mm, board_height_mm, margin_mm, rects)

    # Preparar bins: sobrantes primero, luego tableros nuevos de respaldo.
    offcut_boards = []
    for off in offcuts:
        offcut_boards.append(
            {
                "id": off.get("id"),
                "width": float(off["ancho"]),
                "height": float(off["alto"]),
                "bid": str(off.get("id", f"sobrante_{len(offcut_boards)}")),
            }
        )

    packer = _packer_with_best_algorithm(rotation=True)

    # rectpack 0.2.2 solo soporta rotación global; la validación previa respeta el
    # flag `rotate` de cada pieza rechazando piezas que no caben sin rotar.
    for w, h, rid, _rot, _ in rects:
        packer.add_rect(w, h, rid)

    # Sobrantes como bins finitos.
    for off in offcut_boards:
        packer.add_bin(off["width"], off["height"], bid=off["bid"])

    # Tableros nuevos de respaldo (límite razonable).
    for i in range(50):
        packer.add_bin(board_width_mm, board_height_mm, bid=f"nuevo_{i}")

    packer.pack()

    # Agrupar resultados por bin.
    bins: Dict[str, Dict[str, Any]] = {}
    for abin in packer:
        bid = abin.bid
        if bid not in bins:
            bins[bid] = {
                "width": abin.width,
                "height": abin.height,
                "placements": [],
            }
        for rect in abin:
            rid = rect.rid
            base_id, _idx = rid.rsplit("__", 1)
            original = next((r[4] for r in rects if r[2] == rid), None)
            bins[bid]["placements"].append({
                "id": base_id,
                "nombre": original["nombre"] if original else base_id,
                "x": rect.x,
                "y": rect.y,
                "w": rect.width,
                "h": rect.height,
                "color": original.get("color", "#3B82F6") if original else "#3B82F6",
                "espesor": original.get("espesor", 18.0) if original else 18.0,
                "rotado": rect.width != float(original["ancho"]) if original else False,
            })

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
        if not bid.startswith("nuevo_"):
            offcut_ids_used.append(bid)

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
