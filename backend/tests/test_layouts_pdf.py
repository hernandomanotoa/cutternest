"""PDF de layouts de corte (un tablero por página, con leyenda)."""

import os

from app import pdf_generator


def _boards():
    return [
        {
            "board_index": 0,
            "ancho": 2100, "alto": 2440,
            "utilizacion": 88.5,
            "placements": [
                {"id": "m1-lateral-izq", "nombre": "Lateral izquierdo M1",
                 "x": 10, "y": 10, "w": 2400, "h": 600, "color": "#C19A6B"},
                {"id": "m1zapatera1-fondo", "nombre": "Fondo zapatera extraible 1 M1",
                 "x": 10, "y": 620, "w": 590, "h": 60, "color": "#F2F2F2"},
                {"id": "m1-gola-ala", "nombre": "Ala inferior Gola C 3",
                 "x": 610, "y": 620, "w": 15, "h": 646, "color": "#c19a6b"},
            ],
        },
        {
            "board_index": 1,
            "ancho": 2100, "alto": 2440,
            "utilizacion": 92.0,
            "placements": [
                {"id": "m2-lateral-izq", "nombre": "Lateral izquierdo M1",
                 "x": 10, "y": 10, "w": 2400, "h": 600, "color": "#C19A6B"},
            ],
        },
    ]


def test_generate_layouts_pdf_crea_un_pdf_con_una_pagina_por_tablero(tmp_path):
    path = pdf_generator.generate_layouts_pdf(
        "Closet Demo", "p1", _boards(), str(tmp_path),
    )
    assert path.endswith("layouts_p1.pdf")
    abs_path = str(tmp_path / "layouts_p1.pdf")
    assert os.path.exists(abs_path)
    with open(abs_path, "rb") as f:
        contenido = f.read()
    assert contenido.startswith(b"%PDF")
    # Una página por tablero: /Type /Page por cada board (sin /Pages).
    paginas = contenido.count(b"/Type /Page") - contenido.count(b"/Type /Pages")
    assert paginas == 2


def test_generate_cantos_pdf_clasificacion_9_categorias(tmp_path):
    """El PDF de clasificación cubre las 9 categorías con unidades y metros."""
    pieces = [
        {"ancho": 644, "alto": 227, "cantidad": 2, "cantos": "T,B,L,R"},
        {"ancho": 644, "alto": 227, "cantidad": 1, "cantos": "T,L"},
        {"ancho": 600, "alto": 2400, "cantidad": 4, "cantos": "L"},
        {"ancho": 650, "alto": 585, "cantidad": 3, "cantos": "B"},
        {"ancho": 590, "alto": 60, "cantidad": 2, "cantos": ""},
    ]
    path = pdf_generator.generate_cantos_pdf("Closet Demo", "p9", pieces, str(tmp_path))
    assert path.endswith("clasificacion_cantos_p9.pdf")
    with open(str(tmp_path / "clasificacion_cantos_p9.pdf"), "rb") as f:
        contenido = f.read()
    assert contenido.startswith(b"%PDF")

    # Lógica espejada: categorías y metros.
    c = pdf_generator._clasificar_cantos(pieces)
    by_medidas = {(f["ancho"], f["alto"], f["cantos"]): f for f in c["filas"]}
    frente = by_medidas[(644, 227, "T,B,L,R")]
    assert frente["categoria"] == 8 and frente["unidades"] == 2
    assert frente["metros"] > 0
    lateral = by_medidas[(600, 2400, "L")]
    assert lateral["categoria"] == 3, "largo vertical: L es arista larga"
    assert abs(lateral["metros"] - 4 * 2400 / 1000) < 1e-9
    assert by_medidas[(590, 60, "")]["categoria"] == 0
    assert c["total_unidades"] == 12
