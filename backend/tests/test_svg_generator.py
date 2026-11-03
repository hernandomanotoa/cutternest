"""Etiquetas adaptativas y leyenda en los layouts de corte (SVG/PNG)."""

from app import svg_generator


def _board():
    return {
        "ancho": 2100,
        "alto": 2440,
        "placements": [
            # Grande: etiqueta completa.
            {"id": "m1-lateral-izq", "nombre": "Lateral izquierdo M1",
             "x": 10, "y": 10, "w": 2400, "h": 600, "color": "#C19A6B"},
            # Baja: solo nombre/id truncado.
            {"id": "m1zapatera1-fondo", "nombre": "Fondo zapatera extraible 1 M1",
             "x": 10, "y": 620, "w": 590, "h": 60, "color": "#F2F2F2"},
            # Angosta y alta (15 mm): etiqueta rotada.
            {"id": "m1-gola-ala", "nombre": "Ala inferior Gola C 3",
             "x": 610, "y": 620, "w": 15, "h": 646, "color": "#c19a6b"},
            # Diminuta: sin etiqueta interna; su descripción va en la leyenda.
            {"id": "m1zapatera1-division", "nombre": "Division zapatera extraible 1 M1",
             "x": 700, "y": 620, "w": 590, "h": 60, "color": "#D9C2A3"},
        ],
    }


def test_svg_tiene_leyenda_con_descripcion_completa():
    svg = svg_generator.generate_svg(_board())
    assert "LEYENDA" in svg
    for pid in ("m1-lateral-izq", "m1zapatera1-fondo", "m1-gola-ala", "m1zapatera1-division"):
        assert pid in svg, f"la leyenda debe incluir {pid}"
    assert "Division zapatera extraible 1 M1" in svg
    # El ancho del dibujo crece para el panel de leyenda.
    assert 'width="2100mm"' not in svg


def test_svg_etiqueta_angosta_rotada():
    svg = svg_generator.generate_svg(_board())
    assert "rotate(90" in svg, "la pieza angosta y alta debe llevar etiqueta rotada"


def test_etiqueta_adaptativa_niveles():
    medir = svg_generator._ancho_texto_estimado
    texto, rotada = svg_generator._etiqueta_adaptativa(
        "Fondo zapatera extraible 1 M1", "m1zapatera1-fondo", 590, 60, medir,
    )
    assert texto is not None and not rotada
    # Pieza diminuta (alto insuficiente para la fuente): sin etiqueta interna.
    texto, _ = svg_generator._etiqueta_adaptativa(
        "Division zapatera extraible 1 M1", "m1zapatera1-division", 590, 2, medir,
    )
    assert texto is None
    # Angosta y alta: rotada (a 15 mm ni el id cabe horizontal a font 2).
    texto, rotada = svg_generator._etiqueta_adaptativa(
        "Ala inferior Gola C 3", "m1-gola-ala", 15, 646, medir,
    )
    assert texto is not None and rotada


def test_png_tiene_panel_leyenda_y_etiquetas():
    img = svg_generator.render_board_png(_board(), width=900)
    ancho_tablero = 900
    assert img.width > ancho_tablero + 100, "el PNG debe crecer con el panel de leyenda"
