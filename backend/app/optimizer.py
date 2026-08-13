from typing import Any, Dict, List, Tuple

from rectpack import newPacker

from app.config import get_settings

settings = get_settings()


def optimize_cuts(
    board_width_cm: float,
    board_height_cm: float,
    pieces: List[Dict[str, Any]],
    offcuts: List[Dict[str, Any]] = None,
    kerf_mm: float = None,
    margin_mm: float = None,
) -> Dict[str, Any]:
    """
    Optimiza el corte de piezas en tableros usando rectpack.
    Las dimensiones estan en cm. rectpack usa las mismas unidades.
    Retorna lista de tableros con placements y metricas.
    """
    offcuts = offcuts or []
    kerf_mm = kerf_mm if kerf_mm is not None else settings.kerf_mm
    margin_mm = margin_mm if margin_mm is not None else settings.margen_mm

    # Convertir margen a cm
    margin_cm = margin_mm / 10.0

    available_boards = []
    for idx, off in enumerate(offcuts):
        available_boards.append(
            (float(off["ancho"]), float(off["alto"]), f"sobrante_{idx}")
        )

    # Si no hay sobrantes, usamos tableros estandar ilimitados (se van agregando segun se necesiten)
    if not available_boards:
        available_boards = [(board_width_cm, board_height_cm, "nuevo")]

    # Preparar piezas. rectpack espera (w, h, id).
    # Expandemos cantidad.
    rects = []
    for p in pieces:
        w = float(p["ancho"])
        h = float(p["alto"])
        rot = bool(p.get("rotar", True))
        qty = int(p.get("cantidad", 1))
        for i in range(qty):
            rects.append((w, h, f"{p['id']}__{i}", rot, p))

    packer = newPacker(rotation= True)

    # Agregar piezas. newPacker(rotation=True) habilita rotacion global.
    for r in rects:
        w, h, rid, rot, _ = r
        packer.add_rect(w, h, rid)

    # Agregar tableros iniciales. Si son sobrantes, finitos. Si es nuevo, pondremos muchos.
    if available_boards and available_boards[0][2] == "nuevo":
        # Tableros nuevos ilimitados: reservamos un numero razonable
        for i in range(50):
            packer.add_bin(board_width_cm, board_height_cm, bid=f"nuevo_{i}")
    else:
        for off in available_boards:
            packer.add_bin(off[0], off[1], bid=off[2])

    packer.pack()

    # Agrupar resultados por bin
    bins = {}
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
            base_id, idx = rid.rsplit("__", 1)
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

    # Filtrar bins vacios y reindexar
    used_boards = []
    total_area = 0.0
    used_area = 0.0
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

    # Calcular area de todas las piezas para comparar
    pieces_area = sum(float(p["ancho"]) * float(p["alto"]) * int(p.get("cantidad", 1)) for p in pieces)

    return {
        "tableros": used_boards,
        "total_tableros": len(used_boards),
        "area_total_m2": round(total_area / 10000, 4),
        "area_usada_m2": round(used_area / 10000, 4),
        "area_piezas_m2": round(pieces_area / 10000, 4),
    }
