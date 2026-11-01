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
        assert p["rotado"] is False, f"pieza bloqueada rotada: {p}"
        assert (p["w"], p["h"]) == (800, 1200)
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

    # El equivalente bloqueado (mismas dims, rotate=False) no puede girar:
    # como su huella no cabe, se rechaza con PIECE_TOO_LARGE.
    from fastapi import HTTPException
    try:
        optimizer_service.optimize_cuts(
            board_width_mm=2440, board_height_mm=1220,
            pieces=[{"id": "fija", "nombre": "Pieza Fija", "ancho": 1100, "alto": 1300,
                     "cantidad": 1, "rotate": False, "color": "#123456", "espesor": 18}],
            kerf_mm=0, margin_mm=5,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "PIECE_TOO_LARGE" in exc.detail
    else:
        raise AssertionError("la pieza bloqueada 1100x1300 no debe caber sin rotar")


def test_eje_veta_alto_preorienta_piezas_bloqueadas():
    """Con eje_veta='alto' la veta bloqueada corre a lo largo del lado alto
    del tablero: la huella de corte se invierte y el placement lo reporta."""
    # Pieza con veta en su primera medida (1250x1200): con eje 'ancho' cabe
    # tal cual; con eje 'alto' su huella es 1200x1250 y 1250 > 1210 útiles.
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

    # La misma pieza ingresada con la veta en 1200 (1200x1250) sí cabe con
    # eje 'alto': huella 1250x1200, veta reportada 'vertical'.
    pieza_v = [dict(pieza[0], ancho=1200, alto=1250)]
    result_v = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieza_v, kerf_mm=0, margin_mm=5, eje_veta="alto",
    )
    pv = _placements_of(result_v)[0]
    assert (pv["w"], pv["h"]) == (1250, 1200)
    assert pv["veta"] == "vertical"
    assert pv["rotado"] is True  # girada respecto a sus dims de entrada
