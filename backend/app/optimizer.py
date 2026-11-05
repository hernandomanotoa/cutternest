from typing import Any, Dict, List, Tuple

from fastapi import HTTPException, status
from rectpack import newPacker

from app.config import get_settings

settings = get_settings()


def _clave_orden(criterio: str):
    """Clave de ordenamiento del lote según el criterio. Todas descendentes
    (grandes primero) con desempates deterministas por rid."""
    if criterio == "lado_largo":
        return lambda r: (-max(r[0], r[1]), -(r[0] * r[1]), r[4])
    if criterio == "alto":
        return lambda r: (-r[1], -r[0], r[4])
    if criterio == "perimetro":
        return lambda r: (-(r[0] + r[1]), -(r[0] * r[1]), r[4])
    # 'area' (default)
    return lambda r: (-(r[0] * r[1]), -max(r[0], r[1]), r[4])


# Criterios que prueba el modo 'máximo aprovechamiento': cada orden produce
# un layout distinto (el orden de entrada decide la estructura guillotina) y
# el mejor resultado (menos tableros, empate → más área usada) gana.
_CRITERIOS_ORDEN = ("area", "lado_largo", "alto", "perimetro")


def _sorted_rects(rects, criterio: str = "area"):
    """Orden de empaquetado según el criterio ('area' default: área
    descendente — las piezas grandes primero, 'lo más que se pueda')."""
    return sorted(rects, key=_clave_orden(criterio))


def _packer_with_best_algorithm(rotation: bool = True):
    """Crea un packer de rectpack con el mejor algoritmo disponible.

    Usa ordenamiento global (PackerGlobal) + best-bin-fit para aprovechar
    sobrantes y tableros nuevos de forma híbrida. El algoritmo de empaque
    por defecto es MaxRectsBssf, uno de los mejores equilibrios entre
    calidad y velocidad para nesting 2D guillotinable/no guillotinable.
    """
    try:
        from rectpack import (
            PackerBBF,
            PackerGlobal,
            SORT_AREA,
            MaxRectsBssf,
        )

        return newPacker(
            mode=PackerGlobal,
            bin_algo=PackerBBF,
            pack_algo=MaxRectsBssf,
            sort_algo=SORT_AREA,
            rotation=rotation,
        )
    except Exception:
        # Fallback robusto si alguna constante no estuviera disponible
        return newPacker(rotation=rotation)


def _expanded_rects(
    pieces: List[Dict[str, Any]],
    eje_veta: str = "ancho",
) -> List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]]:
    """Expande cantidades y devuelve tuplas con la huella de corte orientada.

    Cada tupla es (w, h, ow, oh, rid, rot, original):
      - ow/oh: dimensiones de la pieza en orientación de mueble (ancho/alto
        del CSV).
      - w/h: huella sobre el tablero. Las piezas con rotate=False (veta
        bloqueada) siguen la regla del taller "la veta corre por el lado
        más largo": su lado largo queda PARALELO al eje de veta del
        tablero — con eje_veta='ancho' la huella es (largo, corto); con
        'alto' es (corto, largo). rotate=True va siempre con la huella
        original (el optimizador decide, la veta es libre).
      - original["__mapa__"]: convención documentada de colocación en
        plano — a cada letra de canto de la pieza (T,B,L,R, leídas mirando
        su cara visible en el mueble) le asigna el lado de la HUELLA donde
        cae esa arista. Convención: la pieza se tumba "hacia el frente" —
        con eje_veta='alto' (el largo sigue el alto del tablero) la cabeza
        T queda arriba y el frente L a la izquierda (mapeo identidad); con
        eje_veta='ancho' (el largo sigue el ancho del tablero) la pieza
        giró 90° CCW: T va a la izquierda y el frente L abajo.
    """
    MAPA_IDENTIDAD = {"T": "T", "B": "B", "L": "L", "R": "R"}
    MAPA_CCW = {"T": "L", "B": "R", "L": "B", "R": "T"}
    rects = []
    for p in pieces:
        ow = float(p["ancho"])
        oh = float(p["alto"])
        rot = bool(p.get("rotate", True))
        if rot:
            w, h = ow, oh
            p["__mapa__"] = MAPA_IDENTIDAD
        else:
            # Regla del taller: la veta sigue el lado más largo; ese lado
            # queda paralelo al eje de veta del tablero.
            largo, corto = (ow, oh) if ow >= oh else (oh, ow)
            if eje_veta == "ancho":
                w, h = largo, corto
                p["__mapa__"] = MAPA_CCW
            else:
                w, h = corto, largo
                p["__mapa__"] = MAPA_IDENTIDAD
        qty = int(p.get("cantidad", 1))
        for i in range(qty):
            rects.append((w, h, ow, oh, f"{p['id']}__{i}", rot, p))
    return rects


_ROTACION_CCW = {"T": "L", "B": "R", "L": "B", "R": "T"}


def _cantos_en_plano(cantos: str, mapa_pieza: Dict[str, str], rotada_tablero: bool) -> str:
    """Resuelve las letras de canto de la pieza a lados del rectángulo
    COLOCADO en el tablero (T,B,L,R del plano), componiendo la convención
    de colocación de la huella (__mapa__) con la rotación que le dio el
    empaquetador (90° CCW, misma convención documentada)."""
    letras = {l.strip().upper() for l in str(cantos or "").split(",") if l.strip()}
    letras &= {"T", "B", "L", "R"}
    lados = set()
    for letra in letras:
        lado = mapa_pieza.get(letra, letra)
        lados.add(_ROTACION_CCW[lado] if rotada_tablero else lado)
    return ",".join(sorted(lados))
    return rects


def _validate_pieces_fit(
    board_width_mm: float,
    board_height_mm: float,
    margin_mm: float,
    kerf_mm: float,
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
) -> None:
    """Rechaza piezas que no caben en el tablero utilizable con su huella.

    La pieza se considera con su tamaño de corte más el kerf (ancho de la
    sierra). Las piezas bloqueadas (rotate=False) ya vienen orientadas a
    su eje de veta: no pueden girar, así que la única orientación posible
    es la de su huella.
    """
    usable_w = board_width_mm - 2 * margin_mm
    usable_h = board_height_mm - 2 * margin_mm
    if usable_w <= 0 or usable_h <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dimensiones de tablero inválidas",
        )

    for w, h, ow, oh, rid, rot, original in rects:
        # Las bloqueadas solo pueden ir con su huella (ya orientada al eje de
        # veta); las libres pueden presentarse en cualquiera de las dos.
        fits = (
            (w + kerf_mm <= usable_w and h + kerf_mm <= usable_h)
            or (rot and h + kerf_mm <= usable_w and w + kerf_mm <= usable_h)
        )
        if not fits:
            name = original.get("nombre", rid.rsplit("__", 1)[0])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PIECE_TOO_LARGE: La pieza '{name}' ({ow:.2f} x {oh:.2f} mm) excede las dimensiones útiles del tablero",
            )


def _pack_phase(
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
    offcut_boards: List[Dict[str, Any]],
    usable_w: float,
    usable_h: float,
    kerf_mm: float,
    margin_mm: float,
    rotation: bool,
    phase: str,
) -> Dict[str, Dict[str, Any]]:
    """Empaqueta un subconjunto de piezas en sobrantes + tableros nuevos.

    Devuelve bins {bid: {width, height, placements}} con los placements
    ya convertidos (coordenadas con margen, dimensiones sin kerf). Los bids
    llevan prefijo de fase para no colisionar entre fases.
    """
    packer = _packer_with_best_algorithm(rotation=rotation)
    bid_to_offcut_id = {off["bid"]: off.get("id") for off in offcut_boards}
    for w, h, ow, oh, rid, rot, original in rects:
        packer.add_rect(w + kerf_mm, h + kerf_mm, rid)

    for off in offcut_boards:
        packer.add_bin(off["width"], off["height"], bid=f"{phase}__{off['bid']}")
    for i in range(50):
        packer.add_bin(usable_w, usable_h, bid=f"{phase}__nuevo_{i}")

    packer.pack()

    bins: Dict[str, Dict[str, Any]] = {}
    for abin in packer:
        bid = abin.bid
        is_new_board = bid.startswith(f"{phase}__nuevo_")
        if bid not in bins:
            bins[bid] = {
                "width": abin.width + (2 * margin_mm if is_new_board else 0),
                "height": abin.height + (2 * margin_mm if is_new_board else 0),
                "placements": [],
            }
        for rect in abin:
            rid = rect.rid
            base_id, _idx = rid.rsplit("__", 1)
            original = next((r[6] for r in rects if r[4] == rid), None)
            ow, oh = next(((r[2], r[3]) for r in rects if r[4] == rid), (rect.width, rect.height))
            huella_w = next((r[0] for r in rects if r[4] == rid), rect.width - kerf_mm)
            # Rotación RESPECTO A LA HUELLA (la del empaquetador); el flag
            # 'rotado' publicado sigue midiendo respecto a las dims del CSV.
            rotada_tablero = abs(rect.width - (huella_w + kerf_mm)) > 1e-6
            bins[bid]["placements"].append({
                "id": base_id,
                "nombre": original["nombre"] if original else base_id,
                "x": rect.x + (margin_mm if is_new_board else 0),
                "y": rect.y + (margin_mm if is_new_board else 0),
                "w": rect.width - kerf_mm,
                "h": rect.height - kerf_mm,
                "color": original.get("color", "#3B82F6") if original else "#3B82F6",
                "espesor": original.get("espesor", 18.0) if original else 18.0,
                "rotado": abs(rect.width - (ow + kerf_mm)) > 1e-6,
                "en_sobrante": not is_new_board,
                "offcut_id": bid_to_offcut_id.get(bid.split("__", 1)[1]) if not is_new_board else None,
                "cantos": original.get("cantos", "") if original else "",
                "cantos_plano": _cantos_en_plano(
                    original.get("cantos", "") if original else "",
                    original.get("__mapa__", {}) if original else {},
                    rotada_tablero,
                ),
                "veta": original.get("__veta__", "libre") if original else "libre",
            })
    return bins


class _FreeRect:
    """Rectángulo libre dentro de un tablero en fase de empaquetado."""

    __slots__ = ("x", "y", "w", "h")

    def __init__(self, x: float, y: float, w: float, h: float):
        self.x, self.y, self.w, self.h = x, y, w, h

    def __repr__(self):  # pragma: no cover - ayuda de depuración
        return f"_FreeRect({self.x}, {self.y}, {self.w}, {self.h})"


def _split_guillotina(
    free: _FreeRect,
    pw: float,
    ph: float,
    kerf: float,
    prioridad: str = "ancho",
) -> List[_FreeRect]:
    """Divide el rectángulo libre tras colocar una pieza (pw, ph) en su
    esquina inferior izquierda, con dos cortes COMPLETOS.

    prioridad='ancho' (default): la pieza deja una franja a su DERECHA de su
    mismo alto y otra ARRIBA a lo ancho del rectángulo → el tablero se
    rellena por FILAS (los cortes longitudinales separan filas).
    prioridad='alto': la pieza deja una franja ENCIMA de su mismo ancho
    (columna) y otra a la DERECHA a lo alto del rectángulo → el tablero se
    rellena por COLUMNAS (los cortes transversales separan columnas). Ambos
    layouts son cortables con pasadas completas; la elección depende de cómo
    se posiciona el tablero en la guillotina del taller."""
    out = []
    derecha = free.w - pw - kerf
    arriba = free.h - ph - kerf
    if prioridad == "alto":
        # Columna sobre la pieza (mismo ancho) + franja derecha a lo alto.
        if arriba > 0:
            out.append(_FreeRect(free.x, free.y + ph + kerf, pw, arriba))
        if derecha > 0:
            out.append(_FreeRect(free.x + pw + kerf, free.y, derecha, free.h))
    else:
        # Fila a la derecha de la pieza (mismo alto) + franja superior a lo
        # ancho (comportamiento histórico).
        if derecha > 0:
            out.append(_FreeRect(free.x + pw + kerf, free.y, derecha, ph))
        if arriba > 0:
            out.append(_FreeRect(free.x, free.y + ph + kerf, free.w, arriba))
    return out


def _contiene(a: _FreeRect, b: _FreeRect) -> bool:
    """¿a contiene a b (con tolerancia)?"""
    eps = 1e-6
    return (b.x >= a.x - eps and b.y >= a.y - eps
            and b.x + b.w <= a.x + a.w + eps
            and b.y + b.h <= a.y + a.h + eps)


def _unir_adyacentes(a: _FreeRect, b: _FreeRect) -> _FreeRect | None:
    """Une dos rectángulos libres adyacentes con igual alto (en x) o igual
    ancho (en y); None si no son unibles. Reduce la fragmentación que deja
    tableros medios vacíos."""
    eps = 1e-6
    if abs(a.y - b.y) < eps and abs(a.h - b.h) < eps:
        if abs(a.x + a.w - b.x) < eps:  # a a la izquierda de b
            return _FreeRect(a.x, a.y, a.w + b.w, a.h)
        if abs(b.x + b.w - a.x) < eps:
            return _FreeRect(b.x, b.y, a.w + b.w, a.h)
    if abs(a.x - b.x) < eps and abs(a.w - b.w) < eps:
        if abs(a.y + a.h - b.y) < eps:  # a debajo de b
            return _FreeRect(a.x, a.y, a.w, a.h + b.h)
        if abs(b.y + b.h - a.y) < eps:
            return _FreeRect(a.x, b.y, a.w, a.h + b.h)
    return None


def _normalizar_free(rects: List[_FreeRect]) -> List[_FreeRect]:
    """Podar rectángulos contenidos en otros y unir adyacentes iguales."""
    rects = [r for r in rects if r.w > 1e-6 and r.h > 1e-6]
    cambio = True
    while cambio:
        cambio = False
        for i in range(len(rects)):
            contenido = False
            for j in range(len(rects)):
                if i != j and _contiene(rects[j], rects[i]):
                    contenido = True
                    break
            if contenido:
                del rects[i]
                cambio = True
                break
        if cambio:
            continue
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                u = _unir_adyacentes(rects[i], rects[j])
                if u is not None:
                    rects[i] = u
                    del rects[j]
                    cambio = True
                    break
            if cambio:
                break
    return rects


def _pack_guillotine_phase(
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
    offcut_boards: List[Dict[str, Any]],
    usable_w: float,
    usable_h: float,
    kerf_mm: float,
    margin_mm: float,
    phase: str,
    criterio: str = "area",
    prioridad: str = "ancho",
) -> Dict[str, Dict[str, Any]]:
    """Empaqueta con cortes COMPLETOS recursivos (guillotina de máquina).

    Regla del taller: cada corte es una pasada de sierra COMPLETA sobre lo que
    queda del tablero, en la dirección del alto O del ancho (la máquina hace
    cortes lineales completos, sin interrupciones). Lo que sobrevive al corte
    sigue siendo un rectángulo cortable con cortes completos, y las piezas más
    bajas que una vecina no interrumpen nada: la franja que queda sobre ellas
    es un nuevo rectángulo que recibe sus propios cortes completos. Nada de
    cortes en T.

    Heurística de aprovechamiento:
    - Piezas ordenadas por ÁREA descendente (grandes primero).
    - Cada pieza elige el tablero MÁS ANTIGUO con cabida (así se
      rellenan los tableros anteriores antes de tocar los nuevos: nada de
      tableros medios vacíos); dentro del tablero, el rectángulo libre de
      menor sobrante de lado corto (best short-side fit). Si ningún tablero
      abierto la recibe, tablero nuevo.
    - Tras cada colocación el sobrante se divide con dos cortes completos
      (derecha + arriba) y los rectángulos libres se podan/unden
      (contención + adyacencia) para no fragmentar el espacio.
    - Las piezas libres (rotate=True) prueban ambas orientaciones y eligen la
      del mejor encaje; las bloqueadas (veta) van con su huella fija.
    """
    items = []
    for w, h, ow, oh, rid, rot, original in _sorted_rects(rects, criterio):
        items.append({
            "w": w + kerf_mm, "h": h + kerf_mm,  # huella de corte (con sierra)
            "ow": ow, "oh": oh, "rid": rid, "rot": rot, "original": original,
        })

    bid_to_offcut_id = {off["bid"]: off.get("id") for off in offcut_boards}
    boards: List[Dict[str, Any]] = []
    for off in offcut_boards:
        boards.append({
            "bid": f"{phase}__{off['bid']}",
            "width": float(off["width"]),
            "height": float(off["height"]),
            "is_new": False,
            "free": [_FreeRect(0.0, 0.0, float(off["width"]), float(off["height"]))],
            "placements": [],
        })

    def new_board() -> Dict[str, Any]:
        idx = sum(1 for b in boards if b["is_new"])
        b = {
            "bid": f"{phase}__nuevo_{idx}",
            "width": usable_w,
            "height": usable_h,
            "is_new": True,
            "free": [_FreeRect(0.0, 0.0, usable_w, usable_h)],
            "placements": [],
        }
        boards.append(b)
        return b

    for item in items:
        # Orientaciones a probar: la natural primero (empate la favorece).
        orientations = [(item["w"], item["h"])]
        if item["rot"] and abs(item["w"] - item["h"]) > 1e-9:
            orientations.append((item["h"], item["w"]))

        # Mejor encaje: PRIORIDAD al tablero más antiguo con cabida (así se
        # rellenan los tableros anteriores antes de tocar los nuevos: nada de
        # tableros medios vacíos); dentro del tablero, best short-side fit
        # (menor sobrante en el lado corto); empate → rectángulo más antiguo
        # y orientación no rotada (se prueba primero).
        best = None
        for bi, board in enumerate(boards):
            for ri, free in enumerate(board["free"]):
                for pw, ph in orientations:
                    if pw <= free.w + 1e-9 and ph <= free.h + 1e-9:
                        sobrante = min(free.w - pw, free.h - ph)
                        coste = (bi, round(sobrante, 6), ri)
                        if best is None or coste < best[0]:
                            best = (coste, bi, ri, pw, ph)

        if best is None:
            # Tablero nuevo: primera orientación que quepa sola (la natural
            # tiene prioridad; _validate_pieces_fit garantiza que existe).
            board = new_board()
            elegida = None
            for pw, ph in orientations:
                if pw <= board["width"] + 1e-9 and ph <= board["height"] + 1e-9:
                    elegida = (pw, ph)
                    break
            pw, ph = elegida
            bi, ri = len(boards) - 1, 0
        else:
            _coste, bi, ri, pw, ph = best
            board = boards[bi]

        free = board["free"].pop(ri)
        x, y = free.x, free.y
        board["free"] = _normalizar_free(
            board["free"] + _split_guillotina(free, pw, ph, kerf_mm, prioridad)
        )
        board["placements"].append({
            "rid": item["rid"],
            "x": x + (margin_mm if board["is_new"] else 0),
            "y": y + (margin_mm if board["is_new"] else 0),
            "w": pw - kerf_mm,
            "h": ph - kerf_mm,
        })
        item["_placed"] = (pw, ph)

    return _render_tableros(boards, bid_to_offcut_id, items, margin_mm, kerf_mm)


def _render_tableros(boards, bid_to_offcut_id, items, margin_mm, kerf_mm):
    """Formatea los tableros empaquetados (placements por bin) tal como
    espera optimize_cuts. Compartido por las fases guillotina y mixta."""
    out: Dict[str, Dict[str, Any]] = {}
    by_rid = {it["rid"]: it for it in items}
    for board in boards:
        if not board["placements"]:
            continue
        bid = board["bid"]
        is_new = board["is_new"]
        placements = []
        for pl in board["placements"]:
            item = by_rid[pl["rid"]]
            original = item["original"]
            pw, ph = item["_placed"]
            placements.append({
                "id": pl["rid"].rsplit("__", 1)[0],
                "nombre": original["nombre"],
                "x": pl["x"],
                "y": pl["y"],
                "w": pl["w"],
                "h": pl["h"],
                "color": original.get("color", "#3B82F6"),
                "espesor": original.get("espesor", 18.0),
                "rotado": abs(pw - (item["ow"] + kerf_mm)) > 1e-6,
                "en_sobrante": not is_new,
                "offcut_id": bid_to_offcut_id.get(bid.split("__", 1)[1]) if not is_new else None,
                "cantos": original.get("cantos", ""),
                "cantos_plano": _cantos_en_plano(
                    original.get("cantos", ""),
                    original.get("__mapa__", {}),
                    abs(pw - item["w"]) > 1e-6,
                ),
                "veta": original.get("__veta__", "libre"),
            })
        out[bid] = {
            "width": board["width"] + (2 * margin_mm if is_new else 0),
            "height": board["height"] + (2 * margin_mm if is_new else 0),
            "placements": placements,
        }
    return out


def _pack_mixto_phase(
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
    offcut_boards: List[Dict[str, Any]],
    usable_w: float,
    usable_h: float,
    kerf_mm: float,
    margin_mm: float,
    phase: str,
    frac_big: float = 0.5,
) -> Dict[str, Dict[str, Any]]:
    """MODO MIXTO (cortes completos): COLUMNAS de piezas GRANDES y luego
    FILAS de pequeñas hacia la derecha.

    Fase columnas: se siembra una columna con la pieza grande más alta
    restante (alto >= frac_big del tablero, en su mejor orientación); su
    ancho fija la franja y se COMPLETA la columna apilando la pieza más alta
    que quepa (grande o pequeña) hasta agotar el alto. Así cada columna es
    una franja vertical de corte completo sin desperdicio horizontal. Fase
    filas: las piezas que quedan (las pequeñas) se empacan de izquierda a
    derecha en ESTANTES dentro de la franja que sobra a la derecha de las
    columnas; cada estante es una franja horizontal de corte completo. Todo
    corte es lineal completo (guillotina), sin cortes en T. Las piezas que
    no caben en un tablero pasan al siguiente (los sobrantes se ofrecen
    primero, como en la fase guillotina)."""
    items = []
    for w, h, ow, oh, rid, rot, original in rects:
        items.append({
            "w": w + kerf_mm, "h": h + kerf_mm,  # huella de corte (con sierra)
            "ow": ow, "oh": oh, "rid": rid, "rot": rot, "original": original,
            "placed": False, "_placed": None,
        })

    def orientaciones(it):
        orient = [(it["w"], it["h"])]  # la natural primero (empate la favorece)
        if it["rot"] and abs(it["w"] - it["h"]) > 1e-9:
            orient.append((it["h"], it["w"]))
        return orient

    def alto_max(it):
        return max(ph for _pw, ph in orientaciones(it))

    def colocar(board, it, pw, ph, x, y):
        board["placements"].append({
            "rid": it["rid"],
            "x": x + (margin_mm if board["is_new"] else 0),
            "y": y + (margin_mm if board["is_new"] else 0),
            "w": pw - kerf_mm,
            "h": ph - kerf_mm,
        })
        it["placed"] = True
        it["_placed"] = (pw, ph)

    bid_to_offcut_id = {off["bid"]: off.get("id") for off in offcut_boards}
    boards: List[Dict[str, Any]] = []
    for off in offcut_boards:
        boards.append({
            "bid": f"{phase}__{off['bid']}",
            "width": float(off["width"]),
            "height": float(off["height"]),
            "is_new": False,
            "placements": [],
        })

    def new_board() -> Dict[str, Any]:
        idx = sum(1 for b in boards if b["is_new"])
        b = {
            "bid": f"{phase}__nuevo_{idx}",
            "width": usable_w,
            "height": usable_h,
            "is_new": True,
            "placements": [],
        }
        boards.append(b)
        return b

    def pack_en_tablero(board) -> int:
        """Las dos fases sobre un tablero. Devuelve cuántas piezas colocó."""
        W, H = board["width"], board["height"]
        antes = len(board["placements"])
        x0 = 0.0  # frontera derecha de las columnas (las filas van de x0 a W)

        # ── FASE COLUMNAS: piezas grandes (alto >= frac_big · H) ──
        grandes = [it for it in items
                   if not it["placed"] and alto_max(it) >= frac_big * H]
        grandes.sort(key=lambda it: (-alto_max(it), it["rid"]))
        for seed in grandes:
            if seed["placed"]:
                continue
            elegida = None
            for pw, ph in orientaciones(seed):
                if ph <= H + 1e-9 and pw <= W - x0 + 1e-9:
                    elegida = (pw, ph)
                    break
            if elegida is None:
                continue  # no cabe en este tablero → pasa al siguiente
            col_w = elegida[0]
            colocar(board, seed, *elegida, x0, 0.0)
            y = elegida[1]  # la huella (w/h) ya incluye el kerf
            # Completar la columna: la pieza MÁS ALTA que quepa (cualquiera).
            while True:
                cand = None
                for it in items:
                    if it["placed"]:
                        continue
                    for pw, ph in orientaciones(it):
                        if pw <= col_w + 1e-9 and ph <= H - y + 1e-9:
                            if cand is None or ph > cand[0]:
                                cand = (ph, it, pw, ph)
                            break
                if cand is None:
                    break
                _ph, it, pw, ph = cand
                colocar(board, it, pw, ph, x0, y)
                y += ph  # huella con kerf incluido
            x0 += col_w  # huella con kerf incluido

        # ── FASE FILAS: las pequeñas en estantes (x0..W), de izq. a der. ──
        shelf_y, shelf_h, shelf_x = 0.0, 0.0, x0
        pequenas = [it for it in items if not it["placed"]]
        pequenas.sort(key=lambda it: (-alto_max(it), it["rid"]))
        for it in pequenas:
            colocado = False
            for pw, ph in orientaciones(it):
                if shelf_h > 0 and ph <= shelf_h + 1e-9 \
                        and shelf_x + pw <= W + 1e-9:
                    colocar(board, it, pw, ph, shelf_x, shelf_y)
                    shelf_x += pw
                    colocado = True
                    break
            if colocado:
                continue
            # Abrir estante nuevo (o el primero) en la franja.
            base_y = shelf_y + shelf_h if shelf_h > 0 else 0.0  # huella con kerf
            for pw, ph in orientaciones(it):
                if ph <= H - base_y + 1e-9 and pw <= W - x0 + 1e-9:
                    shelf_y, shelf_h, shelf_x = base_y, ph, x0 + pw
                    colocar(board, it, pw, ph, x0, shelf_y)
                    colocado = True
                    break
            # Si no cabe en ninguna orientación, queda para el siguiente tablero.
        return len(board["placements"]) - antes

    # Empaquetado: sobrantes primero (en orden), tableros nuevos después.
    pendientes = [it for it in items if not it["placed"]]
    while pendientes:
        tablero = next((b for b in boards if not b["is_new"] and not b["placements"]), None)
        if tablero is None:
            tablero = new_board()
        colocadas = pack_en_tablero(tablero)
        if colocadas == 0:
            # Ninguna cabe aquí: fuerza la mayor en el origen (la validación
            # garantiza que cada pieza cabe sola en un tablero nuevo).
            it = pendientes[0]
            for pw, ph in orientaciones(it):
                if pw <= tablero["width"] + 1e-9 and ph <= tablero["height"] + 1e-9:
                    colocar(tablero, it, pw, ph, 0.0, 0.0)
                    break
            if not it["placed"]:
                it["placed"] = True  # degenerado: no debería pasar
                it["_placed"] = (it["w"], it["h"])
        pendientes = [it for it in items if not it["placed"]]
    return _render_tableros(boards, bid_to_offcut_id, items, margin_mm, kerf_mm)


def _pack_guillotine_multi(
    rects: List[Tuple[float, float, float, float, str, bool, Dict[str, Any]]],
    offcut_boards: List[Dict[str, Any]],
    usable_w: float,
    usable_h: float,
    kerf_mm: float,
    margin_mm: float,
) -> Dict[str, Dict[str, Any]]:
    """MODO MÁXIMO APROVECHAMIENTO: empaqueta el lote con varios criterios de
    orden (área / lado largo / alto / perímetro) y AMBAS prioridades de corte
    (a lo ancho y a lo alto), y devuelve el mejor resultado — menos tableros;
    a igual número, más área usada. El orden de entrada y la prioridad del
    split deciden la estructura guillotina, así que cada combinación puede
    diferir en tableros. Costo: 8 empaquetados (rápido)."""
    mejor = None  # (clave, resultado)
    for crit in _CRITERIOS_ORDEN:
        for prioridad in ("ancho", "alto"):
            r = _pack_guillotine_phase(
                rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                phase=f"g_{crit}_{prioridad}", criterio=crit, prioridad=prioridad,
            )
            tableros = len(r)
            usada = sum(p["w"] * p["h"] for b in r.values() for p in b["placements"])
            clave = (tableros, -round(usada, 3))
            if mejor is None or clave < mejor[0]:
                mejor = (clave, r)
    return mejor[1]


def optimize_cuts(
    board_width_mm: float,
    board_height_mm: float,
    pieces: List[Dict[str, Any]],
    offcuts: List[Dict[str, Any]] = None,
    kerf_mm: float = None,
    margin_mm: float = None,
    eje_veta: str = "ancho",
    modo: str = "guillotina",
    max_aprovechamiento: bool = False,
    prioridad_corte: str = "ancho",
) -> Dict[str, Any]:
    """
    Optimiza el corte de piezas en tableros. Las dimensiones están en mm.
    Retorna lista de tableros con placements, métricas y la lista de IDs de
    sobrantes consumidos.

    Sentido de veta: las piezas con rotate=False tienen la veta bloqueada a
    lo largo de su primera medida (convención del taller); se pre-orientan
    paralelas al `eje_veta` del tablero ('ancho' = a lo largo del lado
    ancho, 'alto' = a lo largo del lado alto). Las piezas rotate=True
    pueden rotar libremente.

    modo='guillotina' (default): empaquetado con CORTES COMPLETOS recursivos
    — cada corte es una pasada de sierra completa sobre lo que queda del
    tablero, en la dirección del alto o del ancho (la máquina hace cortes
    lineales completos, sin interrupciones). Lo que sobrevive al corte sigue
    siendo un rectángulo cortable con cortes completos; una pieza más baja
    que su vecina no interrumpe: la franja sobre ella recibe sus propios
    cortes completos. Piezas ordenadas por área descendente; cada una va al
    tablero más antiguo con cabida y dentro de él al rectángulo libre de
    menor sobrante (best short-side fit) para no dejar tableros medios
    vacíos. modo='nesting': nesting 2D libre (rectpack
    MaxRects), mejor aprovechamiento teórico pero con cortes en T que la
    sierra no puede hacer de una pasada. max_aprovechamiento=True (solo
    guillotina): prueba varios órdenes de empaquetado (área / lado largo /
    alto / perímetro) y AMBAS prioridades de corte, y devuelve el que usa
    menos tableros (a igual número, más área usada). prioridad_corte='ancho'
    (default) rellena el tablero por FILAS (cortes longitudinales que separan
    filas); 'alto' rellena por COLUMNAS (cortes transversales que separan
    columnas) — para cuando la guillotina no admite el tablero en vertical.
    modo='mixto': cortes completos en DOS FASES — primero COLUMNAS con las
    piezas grandes (alto >= 50% del tablero; cada columna se siembra con la
    más alta y se completa apilando lo que quepa) y luego FILAS con las
    pequeñas en el ancho que sobra a la derecha. Con max_aprovechamiento=True
    prueba los umbrales 50% y 65% del mixto Y el lote guillotina clásico, y
    se queda con el mejor de todos.
    """
    offcuts = offcuts or []
    kerf_mm = kerf_mm if kerf_mm is not None else settings.kerf_mm
    margin_mm = margin_mm if margin_mm is not None else settings.margen_mm
    eje_veta = "alto" if eje_veta == "alto" else "ancho"
    use_guillotine = modo != "nesting"

    rects = _expanded_rects(pieces, eje_veta)
    _validate_pieces_fit(board_width_mm, board_height_mm, margin_mm, kerf_mm, rects)

    # Etiqueta de veta por pieza para los placements: las bloqueadas quedan
    # paralelas al eje de veta del tablero; las libres, 'libre'.
    veta_bloqueada = "vertical" if eje_veta == "alto" else "horizontal"
    for _w, _h, _ow, _oh, _rid, rot, original in rects:
        original["__veta__"] = "libre" if rot else veta_bloqueada

    # Normalizar sobrantes: claves width/height/bid (los callers usan
    # ancho/alto y el bid puede faltar). Cada unidad es un bin independiente.
    offcut_boards = []
    for off in offcuts:
        bid = str(off.get("bid") or off.get("id") or f"sobrante_{len(offcut_boards)}")
        offcut_boards.append({
            "id": off.get("id"),
            "bid": bid,
            "width": float(off["ancho"]),
            "height": float(off["alto"]),
        })

    usable_w = board_width_mm - 2 * margin_mm
    usable_h = board_height_mm - 2 * margin_mm

    bins: Dict[str, Dict[str, Any]] = {}
    if modo == "mixto":
        # Dos fases de cortes completos: columnas de grandes + filas de
        # pequeñas. Máximo aprovechamiento: prueba los umbrales de "grande"
        # (50% y 65%) y TAMBIÉN el lote guillotina clásico, y se queda con el
        # mejor — el mixto gana con piezas grandes altas y angostas; el
        # guillotina, cuando los grandes son anchos (dejan franja estrecha).
        if rects:
            if max_aprovechamiento:
                def _clave_lote(r):
                    usada = sum(p["w"] * p["h"] for b in r.values() for p in b["placements"])
                    return (len(r), -round(usada, 3))

                candidatos = [
                    _pack_mixto_phase(
                        rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                        phase=f"mix_{int(frac*100)}", frac_big=frac,
                    )
                    for frac in (0.5, 0.65)
                ]
                candidatos.append(_pack_guillotine_multi(
                    rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                ))
                bins.update(min(candidatos, key=_clave_lote))
            else:
                bins.update(_pack_mixto_phase(
                    rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                    phase="mix",
                ))
    elif use_guillotine:
        # Una sola fase: las piezas libres rotan solo si mejora la cabida y
        # las bloqueadas van con su huella de veta; los sobrantes se ofrecen
        # a todo el lote (el mejor encaje gana), no repartidos por fases.
        if rects:
            if max_aprovechamiento:
                bins.update(_pack_guillotine_multi(
                    rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                ))
            else:
                bins.update(_pack_guillotine_phase(
                    rects, offcut_boards, usable_w, usable_h, kerf_mm, margin_mm,
                    phase="g", prioridad=prioridad_corte,
                ))
    else:
        free_rects = [r for r in rects if r[5]]
        locked_rects = [r for r in rects if not r[5]]

        # Sobrantes: cada unidad a una sola fase (reparto alterno determinista).
        offcuts_free = [o for i, o in enumerate(offcut_boards) if i % 2 == 0]
        offcuts_locked = [o for i, o in enumerate(offcut_boards) if i % 2 == 1]
        if free_rects:            bins.update(_pack_phase(
                free_rects, offcuts_free, usable_w, usable_h, kerf_mm, margin_mm,
                rotation=True, phase="libre",
            ))
        if locked_rects:
            bins.update(_pack_phase(
                locked_rects, offcuts_locked, usable_w, usable_h, kerf_mm, margin_mm,
                rotation=False, phase="fija",
            ))

    # Filtrar bins vacíos, reindexar y calcular métricas.
    used_boards = []
    total_area = 0.0
    used_area = 0.0
    offcut_ids_used: List[str] = []
    for idx, (bid, data) in enumerate(bins.items()):
        if not data["placements"]:
            continue
        board_area = data["width"] * data["height"]
        used = sum(p["w"] * p["h"] for p in data["placements"])
        utilization = used / board_area if board_area > 0 else 0
        used_boards.append({
            "board_index": idx,
            "ancho": data["width"],
            "alto": data["height"],
            "utilizacion": round(utilization * 100, 2),
            "placements": data["placements"],
        })
        total_area += board_area
        used_area += used
        if "__nuevo_" not in bid:
            # bid: "{fase}__{offcut_bid}" → consumo por offcut_id real.
            offcut_ids_used.append(bid.split("__", 1)[1])

    # Calcular área de todas las piezas para comparar.
    pieces_area = sum(float(p["ancho"]) * float(p["alto"]) * int(p.get("cantidad", 1)) for p in pieces)

    return {
        "tableros": used_boards,
        "total_tableros": len(used_boards),
        "area_total_m2": round(total_area / 1_000_000, 4),
        "area_usada_m2": round(used_area / 1_000_000, 4),
        "area_piezas_m2": round(pieces_area / 1_000_000, 4),
        "offcut_ids_used": offcut_ids_used,
    }
