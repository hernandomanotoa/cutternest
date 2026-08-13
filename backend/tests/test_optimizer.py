from app import optimizer as optimizer_service


def test_optimize_estanteria():
    pieces = [
        {"id": "base", "nombre": "Base", "ancho": 120, "alto": 60, "cantidad": 1, "rotar": True, "color": "#FF6B6B", "espesor": 18},
        {"id": "tapa", "nombre": "Tapa", "ancho": 120, "alto": 60, "cantidad": 1, "rotar": True, "color": "#4ECDC4", "espesor": 18},
        {"id": "lateral-izq", "nombre": "Lateral Izq", "ancho": 50, "alto": 180, "cantidad": 1, "rotar": False, "color": "#45B7D1", "espesor": 18},
        {"id": "lateral-der", "nombre": "Lateral Der", "ancho": 50, "alto": 180, "cantidad": 1, "rotar": False, "color": "#45B7D1", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_cm=244,
        board_height_cm=122,
        pieces=pieces,
    )
    assert "tableros" in result
    assert result["total_tableros"] >= 1
    assert result["area_usada_m2"] > 0
