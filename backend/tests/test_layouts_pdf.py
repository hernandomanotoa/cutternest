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
