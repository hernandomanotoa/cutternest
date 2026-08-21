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
