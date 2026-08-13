from fastapi import HTTPException, status
from typing import Any, Dict, List


def _piece(
    pid: str,
    nombre: str,
    ancho: float,
    alto: float,
    cantidad: int = 1,
    color: str = "#3B82F6",
    espesor: float = 18.0,
    cantos: str = "",
    rotar: bool = True,
) -> Dict[str, Any]:
    return {
        "id": pid,
        "nombre": nombre,
        "ancho": ancho,
        "alto": alto,
        "cantidad": cantidad,
        "color": color,
        "espesor": espesor,
        "cantos": cantos,
        "rotar": rotar,
    }


def generate_estanteria(
    ancho: float, alto: float, profundidad: float, n_estantes: int = 4
) -> List[Dict[str, Any]]:
    pieces = []
    # Laterales
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#45B7D1", 18, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#45B7D1", 18, "T,B,R", False))
    # Base y tapa
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#FF6B6B", 18, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#4ECDC4", 18, "T,B,L,R", True))
    # Estantes
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho, profundidad, 1, "#96CEB4", 18, "T,B,L,R", True))
    # Fondo
    pieces.append(_piece("fondo", "Fondo", ancho - 2, alto - 2, 1, "#DDA0DD", 3, "", False))
    return pieces


def generate_closet(ancho: float, alto: float, profundidad: float, n_estantes: int = 3) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#8E44AD", 18, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#8E44AD", 18, "T,B,R", False))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#3498DB", 18, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#3498DB", 18, "T,B,L,R", True))
    pieces.append(_piece("puerta-izq", "Puerta Izquierda", ancho / 2 - 0.2, alto - 2, 1, "#F1C40F", 18, "T,B,L,R", True))
    pieces.append(_piece("puerta-der", "Puerta Derecha", ancho / 2 - 0.2, alto - 2, 1, "#F1C40F", 18, "T,B,L,R", True))
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho - 1, profundidad - 1, 1, "#2ECC71", 18, "T,B,L,R", True))
    return pieces


def generate_mesa(ancho: float, alto: float, profundidad: float) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#E67E22", 18, "T,B,L,R", True))
    for i in range(4):
        pieces.append(_piece(f"pata-{i+1}", f"Pata {i+1}", 7, alto - 3, 1, "#95A5A6", 18, "T,B,L,R", True))
    return pieces


def generate_cajonera(ancho: float, alto: float, profundidad: float, n_cajones: int = 3) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#1ABC9C", 18, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#1ABC9C", 18, "T,B,R", False))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#1ABC9C", 18, "T,B,L,R", True))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#1ABC9C", 18, "T,B,L,R", True))
    for i in range(n_cajones):
        pieces.append(_piece(f"frente-{i+1}", f"Frente Cajon {i+1}", ancho - 2, alto / n_cajones - 2, 1, "#E74C3C", 18, "T,B,L,R", True))
    return pieces


def generate_mueble_tv(ancho: float, alto: float, profundidad: float, n_estantes: int = 2) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#34495E", 18, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#34495E", 18, "T,B,R", False))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#34495E", 18, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#34495E", 18, "T,B,L,R", True))
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho, profundidad, 1, "#7F8C8D", 18, "T,B,L,R", True))
    return pieces


TEMPLATES = {
    "estanteria": {
        "id": "estanteria",
        "nombre": "Estanteria Modular",
        "descripcion": "Estanteria vertical con estantes ajustables.",
        "parametros": {
            "ancho": {"min": 60, "max": 240, "default": 120, "step": 1},
            "alto": {"min": 100, "max": 240, "default": 180, "step": 1},
            "profundidad": {"min": 20, "max": 80, "default": 50, "step": 1},
            "n_estantes": {"min": 1, "max": 8, "default": 4, "step": 1},
        },
        "generate": generate_estanteria,
    },
    "closet": {
        "id": "closet",
        "nombre": "Closet Basico",
        "descripcion": "Closet con puertas y estantes.",
        "parametros": {
            "ancho": {"min": 100, "max": 240, "default": 120, "step": 1},
            "alto": {"min": 180, "max": 240, "default": 200, "step": 1},
            "profundidad": {"min": 40, "max": 80, "default": 60, "step": 1},
            "n_estantes": {"min": 1, "max": 6, "default": 3, "step": 1},
        },
        "generate": generate_closet,
    },
    "mesa": {
        "id": "mesa",
        "nombre": "Mesa",
        "descripcion": "Mesa con tapa y 4 patas.",
        "parametros": {
            "ancho": {"min": 60, "max": 200, "default": 120, "step": 1},
            "alto": {"min": 60, "max": 110, "default": 75, "step": 1},
            "profundidad": {"min": 60, "max": 100, "default": 80, "step": 1},
        },
        "generate": generate_mesa,
    },
    "cajonera": {
        "id": "cajonera",
        "nombre": "Cajonera",
        "descripcion": "Cajonera con varios cajones.",
        "parametros": {
            "ancho": {"min": 40, "max": 120, "default": 80, "step": 1},
            "alto": {"min": 60, "max": 160, "default": 100, "step": 1},
            "profundidad": {"min": 40, "max": 80, "default": 50, "step": 1},
            "n_cajones": {"min": 1, "max": 6, "default": 3, "step": 1},
        },
        "generate": generate_cajonera,
    },
    "mueble-tv": {
        "id": "mueble-tv",
        "nombre": "Mueble para TV",
        "descripcion": "Mueble bajo con estantes.",
        "parametros": {
            "ancho": {"min": 80, "max": 240, "default": 160, "step": 1},
            "alto": {"min": 40, "max": 100, "default": 60, "step": 1},
            "profundidad": {"min": 30, "max": 80, "default": 50, "step": 1},
            "n_estantes": {"min": 1, "max": 4, "default": 2, "step": 1},
        },
        "generate": generate_mueble_tv,
    },
}


def list_templates() -> List[Dict[str, Any]]:
    return [
        {
            "id": t["id"],
            "nombre": t["nombre"],
            "descripcion": t["descripcion"],
            "parametros": t["parametros"],
        }
        for t in TEMPLATES.values()
    ]


def generate_template(template_id: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if template_id not in TEMPLATES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")
    t = TEMPLATES[template_id]
    args = {k: v["default"] for k, v in t["parametros"].items()}
    # Solo sobrescribir parametros que la plantilla espera
    valid_keys = set(t["parametros"].keys())
    for k, v in params.items():
        if k in valid_keys and v is not None:
            args[k] = v
    return t["generate"](**args)
