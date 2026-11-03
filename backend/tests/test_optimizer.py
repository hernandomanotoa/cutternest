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


def _assert_cortes_completos(rects, tol=0.5):
    """Verifica recursivamente que el layout sea cortable con CORTES
    COMPLETOS: en cada paso debe existir una línea (vertical u horizontal)
    que separe las piezas en dos grupos sin cortar ninguna (la sierra hace
    pasadas completas, sin interrupciones ni cortes en T)."""
    rects = [tuple(r) for r in rects]
    if len(rects) <= 1:
        return
    corte = None
    xs = sorted({round(r[0], 3) for r in rects} | {round(r[0] + r[2], 3) for r in rects})
    for cx in xs:
        izq = [r for r in rects if r[0] + r[2] <= cx + tol]
        der = [r for r in rects if r[0] >= cx - tol]
        if len(izq) + len(der) == len(rects) and izq and der:
            corte = (izq, der)
            break
    if corte is None:
        ys = sorted({round(r[1], 3) for r in rects} | {round(r[1] + r[3], 3) for r in rects})
        for cy in ys:
            abajo = [r for r in rects if r[1] + r[3] <= cy + tol]
            arriba = [r for r in rects if r[1] >= cy - tol]
            if len(abajo) + len(arriba) == len(rects) and abajo and arriba:
                corte = (abajo, arriba)
                break
    assert corte, f"layout con cortes en T (no guillotinable): {rects}"
    _assert_cortes_completos(corte[0], tol)
    _assert_cortes_completos(corte[1], tol)


def _rects(board):
    return [(p["x"], p["y"], p["w"], p["h"]) for p in board["placements"]]


def test_guillotina_default_sin_solapes():
    """El modo por defecto es guillotina (cortes lineales a lo largo): las
    piezas quedan dentro del tablero, sin solaparse y en layout de tiras."""
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
        _assert_cortes_completos(_rects(board))


def test_guillotina_ordena_por_area():
    """Las piezas se empaquetan en orden de área descendente: el primer
    placement del primer tablero es la pieza de mayor área."""
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
    areas = {p["id"]: p["ancho"] * p["alto"] for p in pieces}
    primer = result["tableros"][0]["placements"][0]
    assert primer["id"] == max(areas, key=areas.get), "la de mayor área va primero"
    for board in result["tableros"]:
        _assert_no_overlaps(board)
        _assert_cortes_completos(_rects(board))


def test_guillotina_rellena_tableros_anteriores():
    """Una pieza que cabe en el sobrante de un tablero ANTERIOR va ahí,
    aunque ya existan tableros más nuevos (nada de tableros medios vacíos)."""
    pieces = [
        # 3 paneles 800x1100 (veta → huella 1100 de ancho × 1100 de alto):
        # dos caben en el tablero (2200 ≤ 2440) y el tercero abre el
        # tablero 2. Arriba de cada panel queda una franja de 120 de alto.
        {"id": f"a{i}", "nombre": f"Panel {i}", "ancho": 800, "alto": 1100,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18}
        for i in range(3)
    ] + [
        # 100x1100: huella (1100, 100) — cabe en la franja de 120 del
        # tablero 1 → debe volver ahí, no al tablero 2.
        {"id": "b", "nombre": "Panel bajo", "ancho": 100, "alto": 1100,
         "cantidad": 1, "rotate": False, "color": "#96CEB4", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=0, margin_mm=0,
    )
    assert result["total_tableros"] == 2
    tablero_de_b = next(
        idx for idx, b in enumerate(result["tableros"])
        if any(p["id"] == "b" for p in b["placements"])
    )
    assert tablero_de_b == 0, "la pieza pequeña debe rellenar el tablero 1"
    for board in result["tableros"]:
        _assert_no_overlaps(board)
        _assert_cortes_completos(_rects(board))


def test_guillotina_pieza_mas_baja_no_interrumpe():
    """Una pieza más baja que su vecina no interrumpe el corte completo: la
    franja que queda sobre ella es un nuevo rectángulo que recibe sus propios
    cortes completos (regla del taller)."""
    pieces = [
        # A 1000x1200 junto a B 1000x800: sobre B queda una franja de 400 en
        # la que cabe C 1000x200 con cortes completos (nada de tiras rígidas).
        {"id": "a", "nombre": "Panel alto", "ancho": 1000, "alto": 1200,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18},
        {"id": "b", "nombre": "Panel medio", "ancho": 1000, "alto": 800,
         "cantidad": 1, "rotate": False, "color": "#96CEB4", "espesor": 18},
        {"id": "c", "nombre": "Panel chico", "ancho": 1000, "alto": 200,
         "cantidad": 1, "rotate": False, "color": "#FFEAA7", "espesor": 18},
    ]
    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=0, margin_mm=0,
    )
    assert result["total_tableros"] == 1, "las tres piezas caben en un tablero"
    placements = result["tableros"][0]["placements"]
    c = next(p for p in placements if p["id"] == "c")
    assert c["x"] == 1200 and c["y"] == 800, "C aprovecha la franja sobre B"
    _assert_no_overlaps(result["tableros"][0])
    _assert_cortes_completos(_rects(result["tableros"][0]))


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


def _cargar_csv(ruta):
    """Parsea un CSV del planner (CutterNest Piezas v1): ignora comentarios
    (#) y la cabecera; convierte rotate si/no → bool (el backend no acepta
    strings: bool('no') sería True)."""
    import csv

    pieces = []
    with open(ruta, encoding="utf-8") as f:
        for row in csv.reader(line for line in f if not line.startswith("#")):
            if not row or row[0] == "id":
                continue
            pieces.append({
                "id": row[0],
                "nombre": row[1],
                "ancho": float(row[2]),
                "alto": float(row[3]),
                "cantidad": int(row[4]),
                "rotate": str(row[5]).strip().lower() in ("si", "sí", "yes", "true", "1"),
                "color": row[6],
                "espesor": float(row[7]),
            })
    return pieces


def test_lote_real_closet_5_modulos_guillotina():
    """Regresión con un lote real: closet de 5 módulos con zapateras, cajones
    con gola y zócalo estructural (164 piezas, 42.0 m²). El piso teórico son
    15 tableros (42.0 / 2.98 m²); la guillotina produce 16 con ~88% global y
    CADA tablero verifica la regla de cortes completos (sin cortes en T)."""
    import os
    ruta = os.path.join(os.path.dirname(__file__), "fixtures", "closet-5-modulos.csv")
    pieces = _cargar_csv(ruta)
    assert len(pieces) == 164

    result = optimizer_service.optimize_cuts(
        board_width_mm=2440, board_height_mm=1220,
        pieces=pieces, kerf_mm=3, margin_mm=5,
    )
    total_unidades = sum(p["cantidad"] for p in pieces)
    colocadas = sum(len(b["placements"]) for b in result["tableros"])
    assert colocadas == total_unidades, "toda pieza debe quedar colocada"

    for board in result["tableros"]:
        _assert_no_overlaps(board)
        _assert_cortes_completos(_rects(board))

    # Regresión de aprovechamiento: piso 15 tableros; alertar si empeora.
    assert result["total_tableros"] <= 16, (
        f"se abrieron {result['total_tableros']} tableros (piso teórico 15): regresión de aprovechamiento"
    )
    promedio = sum(b["utilizacion"] for b in result["tableros"]) / result["total_tableros"]
    assert promedio >= 85, f"utilización promedio {promedio:.2f}% por debajo del 85%"
    # Las piezas de veta bloqueada (rotate=False: laterales, fondos, frentes)
    # jamás rotan sobre el tablero.
    for board in result["tableros"]:
        for p in board["placements"]:
            original = next(pz for pz in pieces if pz["id"] == p["id"])
            if not original["rotate"]:
                assert p["veta"] in ("horizontal", "vertical")


def test_lote_real_closet_5_modulos_tablero_2100x2440():
    """Misma regresión con la configuración real del taller: tablero
    2100×2440 (veta a lo largo del alto), kerf 4 mm, margen 10 mm. Baseline
    medido en la UI: 10 tableros (79.84% / 9.07% en los dos últimos), piso
    teórico 9 (42.0 m² de piezas / 5.12 m² por tablero)."""
    import os
    ruta = os.path.join(os.path.dirname(__file__), "fixtures", "closet-5-modulos.csv")
    pieces = _cargar_csv(ruta)

    result = optimizer_service.optimize_cuts(
        board_width_mm=2100, board_height_mm=2440,
        pieces=pieces, kerf_mm=4, margin_mm=10, eje_veta="alto",
    )
    total_unidades = sum(p["cantidad"] for p in pieces)
    assert sum(len(b["placements"]) for b in result["tableros"]) == total_unidades
    for board in result["tableros"]:
        _assert_no_overlaps(board)
        _assert_cortes_completos(_rects(board))

    assert result["total_tableros"] <= 10, (
        f"se abrieron {result['total_tableros']} tableros (piso teórico 9): regresión"
    )
    promedio = sum(b["utilizacion"] for b in result["tableros"]) / result["total_tableros"]
    assert promedio >= 81, f"utilización promedio {promedio:.2f}% por debajo del 81%"


def test_max_aprovechamiento_menos_tableros():
    """Máximo aprovechamiento (guillotina): prueba varios órdenes de
    empaquetado y devuelve el de menos tableros. En el lote real (2100×2440,
    kerf 4, margen 10, veta alto) el orden por área da 10 tableros y el mejor
    orden da 9 (piso teórico): ahorra un tablero entero con todos los cortes
    completos."""
    import os
    ruta = os.path.join(os.path.dirname(__file__), "fixtures", "closet-5-modulos.csv")
    pieces = _cargar_csv(ruta)

    base = optimizer_service.optimize_cuts(
        board_width_mm=2100, board_height_mm=2440, pieces=pieces,
        kerf_mm=4, margin_mm=10, eje_veta="alto",
    )
    mejor = optimizer_service.optimize_cuts(
        board_width_mm=2100, board_height_mm=2440, pieces=pieces,
        kerf_mm=4, margin_mm=10, eje_veta="alto",
        max_aprovechamiento=True,
    )
    assert mejor["total_tableros"] <= base["total_tableros"], (
        "max_aprovechamiento nunca debe dar más tableros que el orden por área"
    )
    assert mejor["total_tableros"] == 9, (
        f"se esperaban 9 tableros (piso teórico), salieron {mejor['total_tableros']}"
    )
    total_unidades = sum(p["cantidad"] for p in pieces)
    assert sum(len(b["placements"]) for b in mejor["tableros"]) == total_unidades
    for board in mejor["tableros"]:
        _assert_no_overlaps(board)
        _assert_cortes_completos(_rects(board))


def test_guillotina_prioridad_corte_alto_columnas():
    """prioridad_corte='alto' rellena el tablero por COLUMNAS (segunda pieza
    apilada sobre la primera, mismo X), mientras que 'ancho' rellena por
    FILAS (mismo Y, distinto X). Ambos layouts siguen siendo de cortes
    completos: la prioridad solo cambia qué corte completo va primero."""
    pieces = [
        {"id": f"p{i}", "nombre": f"Panel {i}", "ancho": 800, "alto": 500,
         "cantidad": 1, "rotate": False, "color": "#45B7D1", "espesor": 18}
        for i in range(2)
    ]

    def posiciones(prioridad):
        r = optimizer_service.optimize_cuts(
            board_width_mm=2440, board_height_mm=1220, pieces=pieces,
            kerf_mm=0, margin_mm=0, prioridad_corte=prioridad,
        )
        pl = r["tableros"][0]["placements"]
        assert len(pl) == 2
        return pl[0], pl[1]

    a0, a1 = posiciones("ancho")
    assert abs(a0["y"] - a1["y"]) < 1e-6 and abs(a0["x"] - a1["x"]) > 1, \
        "'ancho': las piezas van en fila (mismo Y)"

    b0, b1 = posiciones("alto")
    assert abs(b0["x"] - b1["x"]) < 1e-6 and abs(b0["y"] - b1["y"]) > 1, \
        "'alto': las piezas van en columna (mismo X)"

    for prioridad in ("ancho", "alto"):
        r = optimizer_service.optimize_cuts(
            board_width_mm=2440, board_height_mm=1220, pieces=pieces,
            kerf_mm=0, margin_mm=0, prioridad_corte=prioridad,
        )
        _assert_no_overlaps(r["tableros"][0])
        _assert_cortes_completos(_rects(r["tableros"][0]))
