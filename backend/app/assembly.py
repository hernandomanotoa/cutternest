from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Piece, Project


def _piece_type(piece: Piece) -> str:
    pid = piece.external_id.lower()
    if pid.startswith("base"):
        return "base"
    if pid.startswith("tapa"):
        return "tapa"
    if pid.startswith("lateral"):
        if "izq" in pid or "left" in pid or "i" in pid:
            return "lateral_izq"
        if "der" in pid or "right" in pid or "d" in pid:
            return "lateral_der"
        return "lateral"
    if pid.startswith("fondo"):
        return "fondo"
    if pid.startswith("estante"):
        return "estante"
    if pid.startswith("puerta"):
        return "puerta"
    if pid.startswith("pata"):
        return "pata"
    if pid.startswith("cajon"):
        return "cajon"
    return "other"


def _thickness_cm(piece: Piece) -> float:
    return piece.thickness_mm / 10.0


def _box_dimensions(piece: Piece, kind: str) -> Tuple[float, float, float]:
    """Return (ancho, alto, profundidad) in cm for the piece in 3D space."""
    w = float(piece.width_cm)
    h = float(piece.height_cm)
    t = _thickness_cm(piece)

    if kind in ("base", "tapa", "estante"):
        # Horizontal panel: width=X, thickness=Y, height=Z
        return (w, t, h)
    if kind in ("lateral_izq", "lateral_der", "lateral"):
        # Vertical side panel: thickness=X, height=Y, width=Z
        return (t, h, w)
    if kind == "fondo":
        # Back panel: width=X, height=Y, thickness=Z
        return (w, h, t)
    if kind == "puerta":
        # Front panel: width=X, height=Y, thickness=Z
        return (w, h, t)
    if kind == "pata":
        # Leg: thickness=X, height=Y, thickness=Z (simplified square leg)
        return (t, h, t)
    if kind == "cajon":
        return (w, t, h)
    return (w, h, t)


def _build_piece_3d(
    piece: Piece,
    kind: str,
    position: Tuple[float, float, float],
    rotation: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    suffix: str = "",
) -> Dict[str, Any]:
    ancho, alto, profundidad = _box_dimensions(piece, kind)
    x, y, z = position
    rx, ry, rz = rotation
    return {
        "id": f"{piece.external_id}{suffix}",
        "nombre": piece.name,
        "ancho": ancho,
        "alto": alto,
        "profundidad": profundidad,
        "color": piece.color,
        "posicion": {"x": x, "y": y, "z": z},
        "rotacion": {"x": rx, "y": ry, "z": rz},
    }


def _find_piece(pieces: List[Piece], kind: str) -> Optional[Piece]:
    for p in pieces:
        if _piece_type(p) == kind:
            return p
    return None


def _find_all(pieces: List[Piece], kind: str) -> List[Piece]:
    return [p for p in pieces if _piece_type(p) == kind]


def _furniture_dimensions(pieces: List[Piece]) -> Dict[str, float]:
    base = _find_piece(pieces, "base")
    tapa = _find_piece(pieces, "tapa")
    fondo = _find_piece(pieces, "fondo")
    laterales = [_find_piece(pieces, "lateral_izq"), _find_piece(pieces, "lateral_der")]
    laterales = [p for p in laterales if p is not None]

    base_w = base.width_cm if base else 0.0
    tapa_w = tapa.width_cm if tapa else 0.0
    fondo_w = fondo.width_cm if fondo else 0.0
    ancho_total = max(base_w, tapa_w, fondo_w, *[p.width_cm for p in pieces])

    base_t = _thickness_cm(base) if base else 0.0
    tapa_t = _thickness_cm(tapa) if tapa else 0.0
    lateral_h = max((p.height_cm for p in laterales), default=0.0)
    alto_total = lateral_h + base_t + tapa_t

    base_h = base.height_cm if base else 0.0
    tapa_h = tapa.height_cm if tapa else 0.0
    lateral_w = max((p.width_cm for p in laterales), default=0.0)
    fondo_h = fondo.height_cm if fondo else 0.0
    profundidad_total = max(base_h, tapa_h, lateral_w, fondo_h)

    return {
        "ancho": ancho_total,
        "alto": max(alto_total, 0.0),
        "profundidad": max(profundidad_total, 0.0),
        "base_thickness": base_t,
        "tapa_thickness": tapa_t,
    }


def _position_pieces(
    pieces: List[Piece],
    dims: Dict[str, float],
) -> Dict[str, List[Dict[str, Any]]]:
    """Position each classified piece in 3D space and return a mapping step_kind -> pieces_3d."""
    ancho_total = dims["ancho"]
    alto_total = dims["alto"]
    profundidad_total = dims["profundidad"]
    base_t = dims["base_thickness"]
    tapa_t = dims["tapa_thickness"]

    result: Dict[str, List[Dict[str, Any]]] = {
        "base_patas": [],
        "laterales": [],
        "estantes": [],
        "tapa": [],
        "fondo": [],
        "acabados": [],
    }

    base = _find_piece(pieces, "base")
    tapa = _find_piece(pieces, "tapa")
    lateral_izq = _find_piece(pieces, "lateral_izq")
    lateral_der = _find_piece(pieces, "lateral_der")
    lateral_gen = _find_piece(pieces, "lateral")
    fondo = _find_piece(pieces, "fondo")
    estantes = _find_all(pieces, "estante")
    puertas = _find_all(pieces, "puerta")
    patas = _find_all(pieces, "pata")
    cajones = _find_all(pieces, "cajon")

    # Base and legs
    if base:
        result["base_patas"].append(_build_piece_3d(base, "base", (0.0, 0.0, 0.0)))
    for i, p in enumerate(patas):
        x = 0.0 if i % 2 == 0 else ancho_total - _thickness_cm(p)
        z = 0.0
        result["base_patas"].append(_build_piece_3d(p, "pata", (x, -p.height_cm, z), suffix=f"-{i}"))

    # Laterals
    if lateral_izq:
        result["laterales"].append(_build_piece_3d(lateral_izq, "lateral_izq", (0.0, base_t, 0.0)))
    if lateral_der:
        der_t = _thickness_cm(lateral_der)
        result["laterales"].append(_build_piece_3d(lateral_der, "lateral_der", (ancho_total - der_t, base_t, 0.0)))
    if lateral_gen and not (lateral_izq or lateral_der):
        # Only one generic lateral: place it at the left and clone a right one if possible
        result["laterales"].append(_build_piece_3d(lateral_gen, "lateral", (0.0, base_t, 0.0)))
        gen_t = _thickness_cm(lateral_gen)
        result["laterales"].append(_build_piece_3d(lateral_gen, "lateral", (ancho_total - gen_t, base_t, 0.0), suffix="-der"))

    # Shelves distributed between base and top
    if estantes and alto_total > base_t + tapa_t:
        usable_height = alto_total - base_t - tapa_t
        count = len(estantes)
        if count == 1:
            y_positions = [base_t + usable_height / 2]
        else:
            step = usable_height / (count + 1)
            y_positions = [base_t + step * (i + 1) for i in range(count)]
        for p, y in zip(estantes, y_positions):
            result["estantes"].append(_build_piece_3d(p, "estante", (0.0, y, 0.0)))

    # Top
    if tapa:
        result["tapa"].append(_build_piece_3d(tapa, "tapa", (0.0, alto_total - tapa_t, 0.0)))

    # Back panel
    if fondo:
        result["fondo"].append(_build_piece_3d(fondo, "fondo", (0.0, base_t, 0.0)))

    # Doors / drawers
    for i, p in enumerate(puertas):
        z = profundidad_total - _thickness_cm(p)
        x = 0.0 if i == 0 else ancho_total / 2
        result["acabados"].append(_build_piece_3d(p, "puerta", (x, base_t, z), suffix=f"-{i}"))
    for i, p in enumerate(cajones):
        result["acabados"].append(_build_piece_3d(p, "cajon", (0.0, base_t, 0.0), suffix=f"-{i}"))

    return result


def _connector(
    tipo: str,
    pos: Tuple[float, float, float],
    direccion: Tuple[float, float, float],
    piezas: List[str],
) -> Dict[str, Any]:
    return {
        "tipo": tipo,
        "posicion": {"x": pos[0], "y": pos[1], "z": pos[2]},
        "direccion": {"x": direccion[0], "y": direccion[1], "z": direccion[2]},
        "piezas": piezas,
    }


def _connectors_for_pieces(
    positioned: Dict[str, List[Dict[str, Any]]],
    dims: Dict[str, float],
) -> Dict[str, List[Dict[str, Any]]]:
    """Generate 3D connectors grouped by the same step keys as positioned pieces."""
    ancho_total = dims["ancho"]
    alto_total = dims["alto"]
    profundidad_total = dims["profundidad"]
    base_t = dims["base_thickness"]
    tapa_t = dims["tapa_thickness"]

    connectors: Dict[str, List[Dict[str, Any]]] = {
        "base_patas": [],
        "laterales": [],
        "estantes": [],
        "tapa": [],
        "fondo": [],
        "acabados": [],
    }

    laterales = positioned.get("laterales", [])
    base_pieces = positioned.get("base_patas", [])
    tapa_pieces = positioned.get("tapa", [])
    estantes = positioned.get("estantes", [])
    fondo = positioned.get("fondo", [])
    puertas = [p for p in positioned.get("acabados", []) if "puerta" in p["id"]]
    patas = [p for p in base_pieces if "pata" in p["id"]]
    base = next((p for p in base_pieces if "base" in p["id"]), None)

    def lateral_thickness(l: Dict[str, Any]) -> float:
        return l["ancho"]

    # Base -> lateral confirmats
    for lat in laterales:
        lat_t = lateral_thickness(lat)
        lat_x = lat["posicion"]["x"]
        side = "izq" if lat_x < ancho_total / 2 else "der"
        dir_x = 1.0 if side == "izq" else -1.0
        for z_offset in (5.0, max(5.0, profundidad_total - 5.0)):
            connectors["laterales"].append(
                _connector(
                    "confirmat",
                    (lat_x + dir_x * lat_t / 2, base_t + 5.0, z_offset),
                    (dir_x, 0.0, 0.0),
                    [base["id"] if base else "base", lat["id"]],
                )
            )
            if alto_total > 30.0:
                connectors["laterales"].append(
                    _connector(
                        "confirmat",
                        (lat_x + dir_x * lat_t / 2, base_t + 15.0, z_offset),
                        (dir_x, 0.0, 0.0),
                        [base["id"] if base else "base", lat["id"]],
                    )
                )

    # Top -> lateral confirmats
    for lat in laterales:
        lat_t = lateral_thickness(lat)
        lat_x = lat["posicion"]["x"]
        side = "izq" if lat_x < ancho_total / 2 else "der"
        dir_x = 1.0 if side == "izq" else -1.0
        for z_offset in (5.0, max(5.0, profundidad_total - 5.0)):
            connectors["tapa"].append(
                _connector(
                    "confirmat",
                    (lat_x + dir_x * lat_t / 2, alto_total - tapa_t - 5.0, z_offset),
                    (dir_x, 0.0, 0.0),
                    [lat["id"], tapa_pieces[0]["id"] if tapa_pieces else "tapa"],
                )
            )

    # Shelves -> lateral confirmats + shelf pegs
    for est in estantes:
        est_y = est["posicion"]["y"] + est["alto"] / 2
        for lat in laterales:
            lat_t = lateral_thickness(lat)
            lat_x = lat["posicion"]["x"]
            side = "izq" if lat_x < ancho_total / 2 else "der"
            dir_x = 1.0 if side == "izq" else -1.0
            for z_offset in (5.0, max(5.0, profundidad_total - 5.0)):
                connectors["estantes"].append(
                    _connector(
                        "taco",
                        (lat_x + dir_x * lat_t / 2, est_y, z_offset),
                        (dir_x, 0.0, 0.0),
                        [lat["id"], est["id"]],
                    )
                )

    # Back panel screws
    if fondo:
        f = fondo[0]
        f_t = f["profundidad"]
        corners = [
            (2.0, base_t + 2.0, f_t / 2),
            (max(2.0, ancho_total - 2.0), base_t + 2.0, f_t / 2),
            (2.0, max(base_t + 2.0, alto_total - tapa_t - 2.0), f_t / 2),
            (max(2.0, ancho_total - 2.0), max(base_t + 2.0, alto_total - tapa_t - 2.0), f_t / 2),
        ]
        for cx, cy, cz in corners:
            connectors["fondo"].append(
                _connector(
                    "tornillo",
                    (cx, cy, cz),
                    (0.0, 0.0, 1.0),
                    [f["id"], "lateral"],
                )
            )

    # Leg screws
    for pata in patas:
        px = pata["posicion"]["x"] + pata["ancho"] / 2
        py = pata["posicion"]["y"]
        pz = pata["posicion"]["z"] + pata["profundidad"] / 2
        connectors["base_patas"].append(
            _connector(
                "pata",
                (px, py, pz),
                (0.0, 1.0, 0.0),
                [pata["id"], base["id"] if base else "base"],
            )
        )

    # Door hinges + handles
    for i, pta in enumerate(puertas):
        pta_ancho = pta["ancho"]
        pta_alto = pta["alto"]
        pta_prof = pta["profundidad"]
        pta_x = pta["posicion"]["x"]
        pta_y = pta["posicion"]["y"]
        pta_z = pta["posicion"]["z"]
        hinge_x = pta_x + (0.5 if i == 0 else pta_ancho - 0.5)
        for y_rel in (0.2, 0.8):
            hy = pta_y + pta_alto * y_rel
            connectors["acabados"].append(
                _connector(
                    "bisagra",
                    (hinge_x, hy, pta_z + pta_prof / 2),
                    (0.0, 1.0, 0.0),
                    [pta["id"], "lateral"],
                )
            )
        connectors["acabados"].append(
            _connector(
                "tirador",
                (pta_x + pta_ancho / 2, pta_y + pta_alto / 2, pta_z + pta_prof + 0.5),
                (0.0, 0.0, 1.0),
                [pta["id"]],
            )
        )

    return connectors


def _step(
    numero: int,
    titulo: str,
    descripcion: str,
    piezas_3d: List[Dict[str, Any]],
    conectores: List[Dict[str, Any]],
    herramientas: List[str],
    tiempo: int,
) -> Dict[str, Any]:
    return {
        "numero": numero,
        "titulo": titulo,
        "descripcion": descripcion,
        "piezas": [p["id"] for p in piezas_3d],
        "piezas_3d": piezas_3d,
        "conectores": conectores,
        "herramientas": herramientas,
        "tiempo_estimado_min": tiempo,
    }


def build_assembly_steps(project: Project, pieces: List[Piece]) -> Dict[str, Any]:
    if not pieces:
        return {"pasos": [], "vista_completa": [], "conectores_completos": []}

    dims = _furniture_dimensions(pieces)
    positioned = _position_pieces(pieces, dims)
    connectors = _connectors_for_pieces(positioned, dims)

    # Pieces with edge banding are listed in the preparation step
    cantos_pieces = [p for p in pieces if p.edge_banding]

    pasos: List[Dict[str, Any]] = []
    n = 1

    if cantos_pieces:
        pasos.append(
            _step(
                n,
                "Pegar cantos",
                "Aplicar la plancha de canto pre-encolada a los bordes indicados en cada pieza.",
                [],
                [],
                ["plancha canto", "cutter", "lijadora"],
                15,
            )
        )
        n += 1

    base_patas = positioned.get("base_patas", [])
    if base_patas:
        pasos.append(
            _step(
                n,
                "Colocar base",
                "Posicionar la base del mueble sobre una superficie plana (y las patas si las hubiera).",
                base_patas,
                connectors.get("base_patas", []),
                ["escuadra", "nivel"],
                10,
            )
        )
        n += 1

    laterales = positioned.get("laterales", [])
    if laterales:
        pasos.append(
            _step(
                n,
                "Atornillar laterales",
                "Fijar los laterales izquierdo y derecho a la base, formando el cuerpo principal.",
                laterales,
                connectors.get("laterales", []),
                ["taladro", "escuadra", "tornillos confirmat"],
                20,
            )
        )
        n += 1

    estantes = positioned.get("estantes", [])
    if estantes:
        pasos.append(
            _step(
                n,
                "Colocar estantes",
                "Insertar los estantes intermedios a la altura indicada por los taladros.",
                estantes,
                connectors.get("estantes", []),
                ["taladro", "nivel", "tacos de madera"],
                25,
            )
        )
        n += 1

    tapa = positioned.get("tapa", [])
    if tapa:
        pasos.append(
            _step(
                n,
                "Colocar tapa",
                "Atornillar la tapa superior cerrando el cuerpo del mueble.",
                tapa,
                connectors.get("tapa", []),
                ["taladro", "escuadra"],
                15,
            )
        )
        n += 1

    fondo = positioned.get("fondo", [])
    if fondo:
        pasos.append(
            _step(
                n,
                "Fijar fondo",
                "Clavar o atornillar el fondo en la parte trasera del mueble.",
                fondo,
                connectors.get("fondo", []),
                ["clavadora", "tornillos"],
                15,
            )
        )
        n += 1

    acabados = positioned.get("acabados", [])
    if acabados:
        pasos.append(
            _step(
                n,
                "Colocar puertas y acabados",
                "Instalar las bisagras, puertas, cajones y herrajes restantes.",
                acabados,
                connectors.get("acabados", []),
                ["destornillador", "bisagras", "tiradores"],
                30,
            )
        )
        n += 1

    if not pasos:
        # Fallback: show all pieces in one step if no recognized structure
        all_pieces = []
        for group in positioned.values():
            all_pieces.extend(group)
        pasos.append(
            _step(
                1,
                "Ensamblaje general",
                "No se detectó una estructura clara. Revisa las piezas y ensambla según el plano.",
                all_pieces,
                [],
                ["taladro", "escuadra"],
                30,
            )
        )

    # Build full view by accumulating all positioned pieces and all connectors
    vista_completa: List[Dict[str, Any]] = []
    conectores_completos: List[Dict[str, Any]] = []
    for group in positioned.values():
        vista_completa.extend(group)
    for group in connectors.values():
        conectores_completos.extend(group)

    return {"pasos": pasos, "vista_completa": vista_completa, "conectores_completos": conectores_completos}


def get_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
    return build_assembly_steps(project, pieces)
