"""Servicios puros de geometría de corte: secuencia guillotina y sobrantes.

Sin acceso a BD ni DOM: reciben las dimensiones del tablero y los placements
(diccionarios con x, y, w, h, id) y devuelven estructuras deterministas.
"""

from typing import Any, Dict, List, Optional

_EPS = 1e-6


def _norm_placements(placements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "id": str(p.get("id", "")),
            "x": float(p["x"]),
            "y": float(p["y"]),
            "w": float(p["w"]),
            "h": float(p["h"]),
        }
        for p in placements
    ]


def _dedup_lineas(lineas: List[float], kerf_mm: float) -> List[float]:
    """Agrupa líneas de corte separadas por el ancho de sierra (kerf): dos
    aristas a menos de kerf representan la MISMA pasada (la sierra corta en
    el borde de la pieza y consume el kerf hacia el retazo). Devuelve la
    primera línea de cada grupo (ascendente)."""
    out: List[float] = []
    for v in sorted(lineas):
        if out and v - out[-1] <= kerf_mm + _EPS:
            continue
        out.append(v)
    return out


def calcular_secuencia_corte(
    ancho: float,
    alto: float,
    kerf_mm: float,
    placements: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Secuencia de cortes guillotina para reproducir el layout.

    Cada línea candidata sale de las aristas de las piezas (x / x+w y
    y / y+h, sin contar los bordes del tablero). Una línea es un corte solo si
    separa al menos una pieza ya colocada de otra (hay material a ambos
    lados). Orden: primero cortes verticales (en x ascendente) y luego
    horizontales (en y ascendente). Las pasadas son completas: `de`/`a` miden
    el recorrido de la pasada sobre lo que queda del tablero.
    """
    piezas = _norm_placements(placements)
    cortes: List[Dict[str, Any]] = []
    n = 1

    lineas_v = _dedup_lineas(
        [v for p in piezas for v in (p["x"], p["x"] + p["w"]) if _EPS < v < ancho - _EPS],
        kerf_mm,
    )
    for v in lineas_v:
        izquierda = [p for p in piezas if p["x"] + p["w"] <= v + _EPS]
        derecha = [p for p in piezas if p["x"] >= v - _EPS]
        if not izquierda or not derecha:
            continue
        cortes.append({
            "n": n,
            "tipo": "vertical",
            "medida_mm": round(v, 2),
            "de": 0.0,
            "a": round(alto, 2),
            "piezas_separadas": [p["id"] for p in sorted(izquierda, key=lambda p: (p["y"], p["x"]))],
        })
        n += 1

    lineas_h = _dedup_lineas(
        [v for p in piezas for v in (p["y"], p["y"] + p["h"]) if _EPS < v < alto - _EPS],
        kerf_mm,
    )
    for v in lineas_h:
        arriba = [p for p in piezas if p["y"] + p["h"] <= v + _EPS]
        abajo = [p for p in piezas if p["y"] >= v - _EPS]
        if not arriba or not abajo:
            continue
        cortes.append({
            "n": n,
            "tipo": "horizontal",
            "medida_mm": round(v, 2),
            "de": 0.0,
            "a": round(ancho, 2),
            "piezas_separadas": [p["id"] for p in sorted(arriba, key=lambda p: (p["x"], p["y"]))],
        })
        n += 1

    return {
        "tablero": {"ancho": round(ancho, 2), "alto": round(alto, 2)},
        "kerf_mm": kerf_mm,
        "cortes": cortes,
    }


def calcular_sobrantes_layout(
    ancho: float,
    alto: float,
    placements: List[Dict[str, Any]],
    threshold_mm: float,
    limite: int = 3,
) -> List[Dict[str, Any]]:
    """Rectángulos libres maximales (restas guillotina-compatibles) del layout.

    Los candidatos anclan su esquina en (0 o arista derecha de una pieza) ×
    (0 o arista inferior de una pieza) y se expanden hasta chocar con otra
    pieza o con el borde del tablero — cualquier rectángulo maximal puede
    expresarse así. Se filtran por el umbral mínimo de ancho y alto y se
    devuelven los `limite` más grandes por área (determinista). Un layout sin
    placements no genera sobrantes: el tablero entero no es un retazo.
    """
    piezas = _norm_placements(placements)
    if not piezas:
        return []

    anchors_x = sorted({0.0} | {p["x"] + p["w"] for p in piezas})
    anchors_y = sorted({0.0} | {p["y"] + p["h"] for p in piezas})

    vistos = set()
    candidatos: List[Dict[str, Any]] = []
    for x0 in anchors_x:
        for y0 in anchors_y:
            h = alto - y0
            for p in piezas:
                if p["x"] + p["w"] <= x0 + _EPS:
                    continue
                if p["y"] < y0 + h - _EPS and p["y"] + p["h"] > y0 + _EPS:
                    if p["y"] >= y0 - _EPS:
                        h = min(h, p["y"] - y0)
            if h <= _EPS:
                continue
            w = ancho - x0
            for p in piezas:
                if p["y"] + p["h"] <= y0 + _EPS or p["y"] >= y0 + h - _EPS:
                    continue
                if p["x"] >= x0 - _EPS:
                    w = min(w, p["x"] - x0)
            if w <= _EPS:
                continue
            clave = (round(x0, 2), round(y0, 2), round(w, 2), round(h, 2))
            if clave in vistos:
                continue
            vistos.add(clave)
            candidatos.append({"x": x0, "y": y0, "ancho": w, "alto": h})

    validos = [
        r for r in candidatos
        if r["ancho"] >= threshold_mm - _EPS and r["alto"] >= threshold_mm - _EPS
    ]
    validos.sort(key=lambda r: (-(r["ancho"] * r["alto"]), round(r["y"], 2), round(r["x"], 2)))
    return [
        {
            "x": round(r["x"], 2),
            "y": round(r["y"], 2),
            "ancho": round(r["ancho"], 2),
            "alto": round(r["alto"], 2),
            "area_m2": round(r["ancho"] * r["alto"] / 1_000_000.0, 4),
        }
        for r in validos[:limite]
    ]
