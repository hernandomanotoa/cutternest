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
            # Muy angosta y alta (10 mm): ni las medidas caben horizontal;
            # la etiqueta completa va rotada.
            {"id": "m1-gola-ala", "nombre": "Ala inferior Gola C 3",
             "x": 610, "y": 620, "w": 6, "h": 646, "color": "#c19a6b"},
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
    # Muy angosta y alta: rotada (a 10 mm ni las medidas caben horizontal).
    texto, rotada = svg_generator._etiqueta_adaptativa(
        "Ala inferior Gola C 3", "m1-gola-ala", 6, 646, medir,
    )
    assert texto is not None and rotada
    # Angosta "normal" (15 mm): las MEDIDAS caben horizontal y se muestran.
    texto, rotada = svg_generator._etiqueta_adaptativa(
        "Ala inferior Gola C 3", "m1-gola-ala", 15, 646, medir,
    )
    assert texto == "15x646" and not rotada


def test_png_tiene_panel_leyenda_y_etiquetas():
    img = svg_generator.render_board_png(_board(), width=900)
    ancho_tablero = 900
    assert img.width > ancho_tablero + 100, "el PNG debe crecer con el panel de leyenda"


def test_aristas_canteadas_mapeo_rotacion():
    from app.svg_generator import aristas_canteadas

    # Sin rotación: identidad.
    assert aristas_canteadas("T,B,L,R", False) == {"T", "B", "L", "R"}
    assert aristas_canteadas("L", False) == {"L"}
    # Rotada 90°: cabezas T/B en los lados cortos (L/R del plano) y los
    # longitudinales L/R en los largos (T/B del plano).
    assert aristas_canteadas("L", True) == {"T"}
    assert aristas_canteadas("T,B", True) == {"L", "R"}
    # Vacío / basura.
    assert aristas_canteadas("", False) == set()
    assert aristas_canteadas("X,Y", False) == set()


def test_svg_marca_aristas_canteadas():
    board = {
        "ancho": 2100, "alto": 2440,
        "placements": [
            {"id": "p1", "nombre": "Frente", "x": 10, "y": 10, "w": 644, "h": 227,
             "color": "#8B5A2B", "cantos": "T,B,L,R", "rotado": False},
        ],
    }
    svg = svg_generator.generate_svg(board)
    assert svg.count(COLOR_CANTO_ESPERADO := "#15803d") >= 4, "una línea por arista canteadas"
