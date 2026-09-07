# test_templates.py — contrato de coherencia de las plantillas precargadas

import pytest

from app.templates import TEMPLATES, generate_template


def _defaults(tid):
    return {k: v["default"] for k, v in TEMPLATES[tid]["parametros"].items()}


@pytest.mark.parametrize("tid", list(TEMPLATES.keys()))
def test_template_defaults_produce_valid_pieces(tid):
    pieces = generate_template(tid, _defaults(tid))
    assert len(pieces) > 0
    ids = [p["id"] for p in pieces]
    assert len(ids) == len(set(ids)), f"{tid}: ids duplicados"
    for p in pieces:
        assert p["ancho"] > 0 and p["alto"] > 0 and p["espesor"] > 0, f"{tid}: {p['id']} dims inválidas"
        assert p["cantidad"] >= 1
        assert p["modulo"], f"{tid}: {p['id']} sin módulo"


@pytest.mark.parametrize("tid", list(TEMPLATES.keys()))
def test_template_extremes_produce_valid_pieces(tid):
    for bound in ("min", "max"):
        params = {k: v[bound] for k, v in TEMPLATES[tid]["parametros"].items()}
        pieces = generate_template(tid, params)
        assert len(pieces) > 0
        for p in pieces:
            assert p["ancho"] > 0 and p["alto"] > 0 and p["espesor"] > 0, f"{tid}({bound}): {p['id']}"


def test_cajonera_genera_cajones_completos_en_submodulos():
    pieces = generate_template("cajonera", _defaults("cajonera"))
    ancho = TEMPLATES["cajonera"]["parametros"]["ancho"]["default"]
    n = TEMPLATES["cajonera"]["parametros"]["n_cajones"]["default"]
    interior = ancho - 36
    cajon_pieces = [p for p in pieces if "cajon" in p["nombre"].lower()]
    # 6 piezas por cajón: frente, 2 laterales, fondo, base, tirador
    assert len(cajon_pieces) == n * 6
    frentes = [p for p in cajon_pieces if "frente" in p["nombre"].lower()]
    assert len(frentes) == n
    for f in frentes:
        assert f["ancho"] <= interior - 2 + 1, "frente no cabe en el interior"
        assert f["modulo"].startswith("1."), "cajón debe ser submódulo"
    laterales = [p for p in cajon_pieces if "lateral" in p["nombre"].lower()]
    assert len(laterales) == n * 2
    tiradores = [p for p in cajon_pieces if "tirador" in p["nombre"].lower()]
    assert len(tiradores) == n
    assert all(t["espesor"] == 5 for t in tiradores)


def test_modulos_con_estantes_ajustan_al_interior():
    for tid in ("estanteria", "closet", "mueble-tv"):
        pieces = generate_template(tid, _defaults(tid))
        ancho = TEMPLATES[tid]["parametros"]["ancho"]["default"]
        estantes = [p for p in pieces if p["nombre"].lower().startswith("estante")]
        assert estantes, f"{tid}: sin estantes"
        for e in estantes:
            assert e["ancho"] <= ancho - 36 + 1, f"{tid}: {e['id']} excede ancho interior"
        assert any("fondo" in p["nombre"].lower() for p in pieces), f"{tid}: falta fondo"


def test_mesa_altura_total_coherente():
    pieces = generate_template("mesa", _defaults("mesa"))
    alto = TEMPLATES["mesa"]["parametros"]["alto"]["default"]
    tapa = next(p for p in pieces if p["id"] == "tapa")
    pata = next(p for p in pieces if p["id"] == "pata-1")
    assert pata["alto"] + tapa["espesor"] == pytest.approx(alto)
