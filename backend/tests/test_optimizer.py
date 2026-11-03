from app import optimizer as optimizer_service


def test_optimize_estanteria():
    pieces = [
        {"id": "base", "nombre": "Base", "ancho": 1200, "alto": 600, "cantidad": 1, "rotate": True, "color": "#FF6B6B", "espesor": 18},
        {"id": "tapa", "nombre": "Tapa", "ancho": 1200, "alto": 600, "cantidad": 1, "rotate": True, "color": "#4ECDC4", "espesor": 18},
        {"id": "lateral-izq", "nombre": "Lateral Izq", "ancho": 500, "alto": 1800, "cantidad": 1, "rotate": True, "color": "#45B7D1", "espesor": 18},
        {"id": "lateral-der", "nombre": "Lateral Der", "ancho": 500, "alto": 1800, "cantidad": 1, "rotate": True, "color": "#45B7D1", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440,
        board_height_mm=1220,
        pieces=pieces,
    )
    assert "tableros" in result
    assert result["total_tableros"] >= 1
    assert result["area_usada_m2"] > 0


def test_piece_too_large():
    pieces = [
        {"id": "grande", "nombre": "Pieza Grande", "ancho": 3000, "alto": 2000, "cantidad": 1, "rotate": True, "color": "#FF0000", "espesor": 18},
    ]
    from fastapi import HTTPException
    try:
        optimizer_service.optimize_cuts(
            board_width_mm=2440,
            board_height_mm=1220,
            pieces=pieces,
            margin_mm=5,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "PIECE_TOO_LARGE" in exc.detail
        assert "Pieza Grande" in exc.detail
    else:
        raise AssertionError("Se esperaba HTTPException PIECE_TOO_LARGE")


def test_kerf_reduces_usable_area():
    """Una pieza que cabría justa sin kerf debe rechazarse al sumar el ancho de sierra."""
    from fastapi import HTTPException

    # Tablero 2440x1220 con margen 5 -> área útil 2430x1210.
    pieces = [
        {"id": "justa", "nombre": "Pieza Justa", "ancho": 2430, "alto": 1210, "cantidad": 1, "rotate": False, "color": "#123456", "espesor": 18},
    ]
    # Sin kerf debería caber.
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440,
        board_height_mm=1220,
        pieces=pieces,
        kerf_mm=0,
        margin_mm=5,
    )
    assert result["total_tableros"] == 1

    # Con kerf de 3 mm ya no cabe en ninguna orientación.
    try:
        optimizer_service.optimize_cuts(
            board_width_mm=2440,
            board_height_mm=1220,
            pieces=pieces,
            kerf_mm=3,
            margin_mm=5,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "PIECE_TOO_LARGE" in exc.detail
    else:
        raise AssertionError("Se esperaba HTTPException PIECE_TOO_LARGE por kerf")


def _placements_of(result):
    return [p for board in result["tableros"] for p in board["placements"]]


def test_pieza_bloqueada_nunca_rota():
    """rotate=False (veta bloqueada): el packer jamás la gira, aunque el
    enunciado se resuelva peor. La misma pieza con rotate=True sí rota."""
    # 3 paneles 800x1200: sin rotar caben 2 por tablero (1600x1200 en
    # 2430x1210); rotados (1200x800) caberían 2 de otra forma. Con
    # rotate=False deben quedar todos sin girar aunque empeore el nesting.
    # Orientación de mueble: laterales 800 (prof) × 1200 (alto). La veta
    # sigue el lado largo (1200) y queda paralela al ancho del tablero.
    bloqueadas = [
        {"id": f"lat-{i}", "nombre": f"Lateral {i}", "ancho": 800, "alto": 1200,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18}
        for i in range(3)
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=bloqueadas, kerf_mm=0, margin_mm=5,
    )
    placements = _placements_of(result)
    assert len(placements) == 3
    for p in placements:
        # rotate=False = veta bloqueada: la huella es FIJA (lado largo
        # paralelo al eje de veta). Puede "rotarse" respecto a las dims de
        # entrada (orientación de mueble) para lograrlo — es lo esperado.
        assert (p["w"], p["h"]) == (1200, 800)
        assert p["rotado"] is True  # 800x1200 de mueble → 1200x800 en tabla
        assert p["veta"] == "horizontal"

    # Las mismas piezas libres se empaquetan igual (el packer rota solo si
    # mejora la cabida). Que la rotación SÍ ocurra cuando es necesaria lo
    # demuestra una pieza que solo cabe girada: 1100x1300 no entra en
    # 2430x1210 tal cual (1300 > 1210), pero girada (1300x1100) sí.
    libres = [dict(pieza, rotate=True) for pieza in bloqueadas]
    libres.append({"id": "girada", "nombre": "Pieza Girada", "ancho": 1100, "alto": 1300,
                   "cantidad": 1, "rotate": True, "color": "#FF6B6B", "espesor": 18})
    result_libre = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=libres, kerf_mm=0, margin_mm=5,
    )
    placements_libres = _placements_of(result_libre)
    girada = next(p for p in placements_libres if p["id"] == "girada")
    assert girada["rotado"] is True, "la pieza 1100x1300 solo cabe rotada"
    assert (girada["w"], girada["h"]) == (1300, 1100)
    assert all(p["veta"] == "libre" for p in placements_libres)

    # El equivalente bloqueado (mismas dims, rotate=False) con eje_veta
    # 'alto': su lado largo (1300) debe quedar paralelo al lado CORTO del
    # tablero → huella 1100x1300, que no cabe (1300 > 1210 útiles) →
    # PIECE_TOO_LARGE (no puede girar para salvarse: la veta es sagrada).
    from fastapi import HTTPException
    try:
        optimizer_service.optimize_cuts(
            board_width_mm=2440, board_height_mm=1220,
            pieces=[{"id": "fija", "nombre": "Pieza Fija", "ancho": 1100, "alto": 1300,
                     "cantidad": 1, "rotate": False, "color": "#123456", "espesor": 18}],
            kerf_mm=0, margin_mm=5, eje_veta="alto",
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "PIECE_TOO_LARGE" in exc.detail
    else:
        raise AssertionError("la pieza bloqueada 1100x1300 no debe caber sin rotar")


def test_eje_veta_alto_preorienta_piezas_bloqueadas():
    """Con eje_veta='alto' la veta bloqueada corre a lo largo del lado alto
    del tablero: el lado largo de la pieza se alinea con ese eje y el
    placement lo reporta."""
    # Pieza de mueble 1250 (ancho) × 1200 (alto): la veta sigue su lado
    # largo (1250). Con eje 'ancho' la huella es (1250, 1200) y cabe; con
    # eje 'alto' es (1200, 1250) y 1250 > 1210 útiles → rechazo.
    pieza = [{"id": "p1", "nombre": "Panel", "ancho": 1250, "alto": 1200,
              "cantidad": 1, "rotate": False, "color": "#123456", "espesor": 18}]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieza, kerf_mm=0, margin_mm=5, eje_veta="ancho",
    )
    p = _placements_of(result)[0]
    assert (p["w"], p["h"]) == (1250, 1200)
    assert p["veta"] == "horizontal"

    from fastapi import HTTPException
    try:
        optimizer_service.optimize_cuts(
            board_width_mm=2440, board_height_mm=1220,
            pieces=pieza, kerf_mm=0, margin_mm=5, eje_veta="alto",
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "PIECE_TOO_LARGE" in exc.detail
    else:
        raise AssertionError("con eje_veta='alto' la pieza 1250x1200 no debe caber")

    # Pieza de vista vertical (puerta 600 × 1100): la veta sigue el lado
    # largo (1100). Con eje 'alto' la huella es (600, 1100) → cabe (1100 ≤
    # 1210 útiles de alto), veta 'vertical', sin girar respecto a sus dims.
    pieza_v = [dict(pieza[0], id="puerta", nombre="Puerta", ancho=600, alto=1100)]
    result_v = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieza_v, kerf_mm=0, margin_mm=5, eje_veta="alto",
    )
    pv = _placements_of(result_v)[0]
    assert (pv["w"], pv["h"]) == (600, 1100)
    assert pv["veta"] == "vertical"
    assert pv["rotado"] is False  # su lado largo ya era el alto


def _assert_no_overlaps(board):
    """Las piezas de un tablero no se solapan y quedan dentro de sus límites."""
    rects = [(p["x"], p["y"], p["w"], p["h"]) for p in board["placements"]]
    for i, (x1, y1, w1, h1) in enumerate(rects):
        assert x1 >= -1e-6 and y1 >= -1e-6, f"pieza {i} fuera de origen"
        assert x1 + w1 <= board["ancho"] + 1e-6, f"pieza {i} excede ancho"
        assert y1 + h1 <= board["alto"] + 1e-6, f"pieza {i} excede alto"
        for j in range(i + 1, len(rects)):
            x2, y2, w2, h2 = rects[j]
            overlap = not (x1 + w1 <= x2 + 1e-6 or x2 + w2 <= x1 + 1e-6
                           or y1 + h1 <= y2 + 1e-6 or y2 + h2 <= y1 + 1e-6)
            assert not overlap, f"piezas {i} y {j} se solapan"


def test_guillotina_default_sin_solapes():
    """El modo por defecto es guillotina (cortes lineales a lo largo): las
    piezas quedan dentro del tablero y sin solaparse."""
    pieces = [
        {"id": f"lat-{i}", "nombre": f"Lateral {i}", "ancho": 600, "alto": 2200,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18}
        for i in range(4)
    ] + [
        {"id": f"est-{i}", "nombre": f"Estante {i}", "ancho": 800, "alto": 400,
         "cantidad": 2, "rotate": True, "color": "#96CEB4", "espesor": 18}
        for i in range(6)
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=3, margin_mm=5,
    )
    assert result["total_tableros"] >= 1
    for board in result["tableros"]:
        _assert_no_overlaps(board)


def test_guillotina_ordena_por_tipo_y_tamaño():
    """Las piezas estructurales (laterales/fondos) se colocan primero: el
    primer placement del primer tablero es el lateral más grande."""
    pieces = [
        {"id": "tir", "nombre": "Tirador", "ancho": 150, "alto": 30,
         "cantidad": 4, "rotate": True, "color": "#111111", "espesor": 18},
        {"id": "est", "nombre": "Estante", "ancho": 900, "alto": 300,
         "cantidad": 2, "rotate": True, "color": "#96CEB4", "espesor": 18},
        {"id": "lat", "nombre": "Lateral izquierdo", "ancho": 600, "alto": 2200,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=3, margin_mm=5,
    )
    first = result["tableros"][0]["placements"][0]
    assert first["id"] == "lat", "el lateral (tipo estructural, más grande) va primero"
    for board in result["tableros"]:
        _assert_no_overlaps(board)


def test_modo_nesting_sigue_disponible():
    """modo='nesting' conserva el camino rectpack (MaxRects)."""
    pieces = [
        {"id": "a", "nombre": "Pieza A", "ancho": 800, "alto": 600,
         "cantidad": 3, "rotate": True, "color": "#FF6B6B", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=3, margin_mm=5, modo="nesting",
    )
    assert sum(len(b["placements"]) for b in result["tableros"]) == 3
    for board in result["tableros"]:
        _assert_no_overlaps(board)
