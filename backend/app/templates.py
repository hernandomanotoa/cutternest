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
    rotate: bool = True,
    modulo: str = "1",
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
        "rotate": rotate,
        "modulo": modulo,
    }


# Espesor estándar de tablero en las plantillas
ESP = 18
# Espesor de fondo de cajón y frente de cajón (contrato ADR-0021)
ESP_CAJON = 15


def generate_estanteria(
    ancho: float, alto: float, profundidad: float, n_estantes: int = 4
) -> List[Dict[str, Any]]:
    pieces = []
    # Laterales
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#45B7D1", ESP, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#45B7D1", ESP, "T,B,R", False))
    # Base y tapa
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#FF6B6B", ESP, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#4ECDC4", ESP, "T,B,L,R", True))
    # Estantes: encajados entre laterales y contra el fondo (interior real)
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho - 2 * ESP, profundidad - 3 - ESP, 1, "#96CEB4", ESP, "T,B,L,R", True))
    # Fondo interno (encolado, decorativo)
    pieces.append(_piece("fondo", "Fondo", ancho - 2 * ESP, alto - 2 * ESP, 1, "#DDA0DD", 3, "", False))
    return pieces


def generate_closet(ancho: float, alto: float, profundidad: float, n_estantes: int = 3) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#8E44AD", ESP, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#8E44AD", ESP, "T,B,R", False))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#3498DB", ESP, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#3498DB", ESP, "T,B,L,R", True))
    pieces.append(_piece("fondo", "Fondo", ancho - 2 * ESP, alto - 2 * ESP, 1, "#F2F2F2", ESP_CAJON, "", False))
    pieces.append(_piece("puerta-izq", "Puerta Izquierda", ancho / 2 - 2, alto - 20, 1, "#F1C40F", ESP, "T,B,L,R", True))
    pieces.append(_piece("puerta-der", "Puerta Derecha", ancho / 2 - 2, alto - 20, 1, "#F1C40F", ESP, "T,B,L,R", True))
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho - 2 * ESP, profundidad - ESP_CAJON - ESP, 1, "#2ECC71", ESP, "T,B,L,R", True))
    return pieces


def generate_mesa(ancho: float, alto: float, profundidad: float) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#E67E22", ESP, "T,B,L,R", True))
    for i in range(4):
        # La pata queda bajo la tapa: alto total = (alto − ESP) + ESP = alto
        pieces.append(_piece(f"pata-{i+1}", f"Pata {i+1}", 70, alto - ESP, 1, "#95A5A6", ESP, "T,B,L,R", True))
    return pieces


def generate_cajonera(ancho: float, alto: float, profundidad: float, n_cajones: int = 3) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#1ABC9C", ESP, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#1ABC9C", ESP, "T,B,R", False))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#1ABC9C", ESP, "T,B,L,R", True))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#1ABC9C", ESP, "T,B,L,R", True))
    pieces.append(_piece("fondo", "Fondo", ancho - 2 * ESP, alto - 2 * ESP, 1, "#F2F2F2", ESP_CAJON, "", False))
    # Cajones completos como submódulos (contrato ADR-0021)
    interior_ancho = ancho - 2 * ESP
    interior_prof = profundidad - ESP_CAJON - ESP
    frente_ancho = interior_ancho - 2
    vano_alto = (alto - 2 * ESP) / n_cajones
    frente_alto = vano_alto - 3
    prof_cajon = interior_prof - 25
    caja_alto = frente_alto - 2 * ESP_CAJON
    caja_ancho = frente_ancho - 2 * ESP_CAJON
    for i in range(n_cajones):
        sm = f"1.{i+1}"
        frente = "superior" if i == 0 else "inferior" if i == n_cajones - 1 else f"nivel {i+1}"
        pieces.append(_piece(f"cajon-{i+1}-frente", f"Frente cajon {frente}", frente_ancho, frente_alto, 1, "#E74C3C", ESP_CAJON, "T,B,L,R", True, sm))
        pieces.append(_piece(f"cajon-{i+1}-lateral-izq", f"Lateral cajon {i+1} izq", prof_cajon, caja_alto, 1, "#1ABC9C", ESP_CAJON, "T,B,L", False, sm))
        pieces.append(_piece(f"cajon-{i+1}-lateral-der", f"Lateral cajon {i+1} der", prof_cajon, caja_alto, 1, "#1ABC9C", ESP_CAJON, "T,B,R", False, sm))
        pieces.append(_piece(f"cajon-{i+1}-fondo", f"Fondo cajon {i+1}", caja_ancho, caja_alto, 1, "#F2F2F2", ESP_CAJON, "", False, sm))
        pieces.append(_piece(f"cajon-{i+1}-base", f"Base cajon {i+1}", caja_ancho, prof_cajon, 1, "#1ABC9C", ESP_CAJON, "T,B,L,R", True, sm))
        pieces.append(_piece(f"cajon-{i+1}-tirador", f"Tirador cajon {i+1}", 2, 20, 1, "#A0A0A0", 5, "", False, sm))
    return pieces


def generate_mueble_tv(ancho: float, alto: float, profundidad: float, n_estantes: int = 2) -> List[Dict[str, Any]]:
    pieces = []
    pieces.append(_piece("lateral-izq", "Lateral Izquierdo", profundidad, alto, 1, "#34495E", ESP, "T,B,L", False))
    pieces.append(_piece("lateral-der", "Lateral Derecho", profundidad, alto, 1, "#34495E", ESP, "T,B,R", False))
    pieces.append(_piece("base", "Base", ancho, profundidad, 1, "#34495E", ESP, "T,B,L,R", True))
    pieces.append(_piece("tapa", "Tapa", ancho, profundidad, 1, "#34495E", ESP, "T,B,L,R", True))
    pieces.append(_piece("fondo", "Fondo", ancho - 2 * ESP, alto - 2 * ESP, 1, "#F2F2F2", ESP_CAJON, "", False))
    for i in range(n_estantes):
        pieces.append(_piece(f"estante-{i+1}", f"Estante {i+1}", ancho - 2 * ESP, profundidad - ESP_CAJON - ESP, 1, "#7F8C8D", ESP, "T,B,L,R", True))
    return pieces


TEMPLATES = {
    "estanteria": {
        "id": "estanteria",
        "nombre": "Estanteria Modular",
        "descripcion": "Estanteria vertical con estantes ajustables.",
        "parametros": {
            "ancho": {"min": 600, "max": 2400, "default": 1200, "step": 1},
            "alto": {"min": 1000, "max": 2400, "default": 1800, "step": 1},
            "profundidad": {"min": 200, "max": 800, "default": 500, "step": 1},
            "n_estantes": {"min": 1, "max": 8, "default": 4, "step": 1},
        },
        "generate": generate_estanteria,
    },
    "closet": {
        "id": "closet",
        "nombre": "Closet Basico",
        "descripcion": "Closet con puertas y estantes.",
        "parametros": {
            "ancho": {"min": 1000, "max": 2400, "default": 1200, "step": 1},
            "alto": {"min": 1800, "max": 2400, "default": 2000, "step": 1},
            "profundidad": {"min": 400, "max": 800, "default": 600, "step": 1},
            "n_estantes": {"min": 1, "max": 6, "default": 3, "step": 1},
        },
        "generate": generate_closet,
    },
    "mesa": {
        "id": "mesa",
        "nombre": "Mesa",
        "descripcion": "Mesa con tapa y 4 patas.",
        "parametros": {
            "ancho": {"min": 600, "max": 2000, "default": 1200, "step": 1},
            "alto": {"min": 600, "max": 1100, "default": 750, "step": 1},
            "profundidad": {"min": 600, "max": 1000, "default": 800, "step": 1},
        },
        "generate": generate_mesa,
    },
    "cajonera": {
        "id": "cajonera",
        "nombre": "Cajonera",
        "descripcion": "Cajonera con varios cajones.",
        "parametros": {
            "ancho": {"min": 400, "max": 1200, "default": 800, "step": 1},
            "alto": {"min": 600, "max": 1600, "default": 1000, "step": 1},
            "profundidad": {"min": 400, "max": 800, "default": 500, "step": 1},
            "n_cajones": {"min": 1, "max": 6, "default": 3, "step": 1},
        },
        "generate": generate_cajonera,
    },
    "mueble-tv": {
        "id": "mueble-tv",
        "nombre": "Mueble para TV",
        "descripcion": "Mueble bajo con estantes.",
        "parametros": {
            "ancho": {"min": 800, "max": 2400, "default": 1600, "step": 1},
            "alto": {"min": 400, "max": 1000, "default": 600, "step": 1},
            "profundidad": {"min": 300, "max": 800, "default": 500, "step": 1},
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
