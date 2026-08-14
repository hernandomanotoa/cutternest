"""Catálogo de materiales, formatos, espesores y colores basado en la guía ecuatoriana.

Fuente: docs/GUIA-MELAMINICOS-ECUADOR.md
"""

from typing import Any, Dict, List, Optional

#: Formatos estándar de placa en Ecuador (cm).
BOARD_FORMATS: List[Dict[str, Any]] = [
    {"name": "Estándar Ecuador 183×244", "width_cm": 183.0, "height_cm": 244.0, "country": "Ecuador"},
    {"name": "Extendido Provemadera 185×275", "width_cm": 185.0, "height_cm": 275.0, "country": "Ecuador"},
    {"name": "Madecentro Artiko 215×244", "width_cm": 215.0, "height_cm": 244.0, "country": "Ecuador"},
    {"name": "Moldyport SuperPan 285×210", "width_cm": 285.0, "height_cm": 210.0, "country": "Ecuador"},
    {"name": "Moldyport SuperPan 366×210", "width_cm": 366.0, "height_cm": 210.0, "country": "Ecuador"},
    {"name": "Europeo 244×122", "width_cm": 244.0, "height_cm": 122.0, "country": "Europa/Importado"},
]

#: Materiales con espesores disponibles y precios aproximados por m² (USD).
# Precios referenciales para proyectos en Ecuador, 2026.
MATERIALS: Dict[str, Dict[str, Any]] = {
    "MDF Crudo": {
        "description": "MDF sin recubrir. Ideal para ebanistería, molduras o acabados personalizados.",
        "thicknesses": {
            3: {"price_per_m2": 5.37},
            6: {"price_per_m2": 7.50},
            9: {"price_per_m2": 8.40},
            12: {"price_per_m2": 10.00},
            15: {"price_per_m2": 12.00},
            18: {"price_per_m2": 14.36},
            25: {"price_per_m2": 18.50},
            31: {"price_per_m2": 22.00},
            37: {"price_per_m2": 26.00},
        },
    },
    "MDF Melamina": {
        "description": "MDF recubierto con melamina decorativa. Listo para usar, alta variedad de colores.",
        "thicknesses": {
            6: {"price_per_m2": 6.50},
            9: {"price_per_m2": 8.50},
            12: {"price_per_m2": 10.50},
            15: {"price_per_m2": 12.50},
            18: {"price_per_m2": 14.50},
            22: {"price_per_m2": 17.00},
            25: {"price_per_m2": 19.50},
            30: {"price_per_m2": 24.00},
        },
    },
    "Aglomerado / SuperPan": {
        "description": "Partículas de madera prensadas con recubrimiento melamínico. Opción económica.",
        "thicknesses": {
            3: {"price_per_m2": 6.50},
            10: {"price_per_m2": 9.00},
            16: {"price_per_m2": 13.50},
            18: {"price_per_m2": 15.00},
            22: {"price_per_m2": 17.50},
            25: {"price_per_m2": 20.50},
            30: {"price_per_m2": 24.50},
        },
    },
}

#: Catálogo de colores de melamina disponibles en Ecuador.
COLORS: List[Dict[str, str]] = [
    # Sólidos
    {"name": "Blanco", "hex": "#FFFFFF"},
    {"name": "Negro", "hex": "#000000"},
    {"name": "Gris", "hex": "#808080"},
    {"name": "Cenizo", "hex": "#9E9E9E"},
    {"name": "Chocolate", "hex": "#5D4037"},
    {"name": "Cacao", "hex": "#6D4C41"},
    {"name": "Miel", "hex": "#D4A017"},
    {"name": "Brandy", "hex": "#8B4513"},
    {"name": "Pistacho", "hex": "#93C572"},
    {"name": "Rojo", "hex": "#C62828"},
    {"name": "Azul", "hex": "#1565C0"},
    {"name": "Verde", "hex": "#2E7D32"},
    {"name": "Amarillo", "hex": "#F9A825"},
    # Texturas madera
    {"name": "Nogal", "hex": "#5D4037"},
    {"name": "Roble", "hex": "#8B6F47"},
    {"name": "Roble Americano", "hex": "#A67B5B"},
    {"name": "Cedro", "hex": "#A0522D"},
    {"name": "Caoba", "hex": "#4E342E"},
    {"name": "Wengué", "hex": "#3E2723"},
    {"name": "Zebrano", "hex": "#5D4037"},
    {"name": "Haya", "hex": "#D7CCC8"},
    {"name": "Pino", "hex": "#E6C88A"},
    {"name": "Olmo", "hex": "#8D6E63"},
    # Especiales / premium
    {"name": "Mármol Carrara", "hex": "#F5F5F5"},
    {"name": "Mármol Negro", "hex": "#1A1A1A"},
    {"name": "Cemento", "hex": "#9E9E9E"},
    {"name": "Lino Textil", "hex": "#D7CCC8"},
    {"name": "Piedra", "hex": "#757575"},
    {"name": "Cuero", "hex": "#5D4037"},
    {"name": "Metálico", "hex": "#B0BEC5"},
    {"name": "High Gloss", "hex": "#E0E0E0"},
    {"name": "Soft Touch", "hex": "#EFEBE9"},
    {"name": "Antihuella", "hex": "#424242"},
]


def list_board_formats(country: Optional[str] = None) -> List[Dict[str, Any]]:
    if country:
        return [f for f in BOARD_FORMATS if f.get("country") == country]
    return BOARD_FORMATS


def list_materials() -> List[Dict[str, Any]]:
    return [
        {
            "name": name,
            "description": data["description"],
            "thicknesses": sorted([int(t) for t in data["thicknesses"].keys()]),
            "prices": {str(int(t)): info["price_per_m2"] for t, info in data["thicknesses"].items()},
        }
        for name, data in MATERIALS.items()
    ]


def get_material(material_name: str) -> Optional[Dict[str, Any]]:
    return MATERIALS.get(material_name)


def get_thickness_options(material_name: str) -> List[int]:
    material = get_material(material_name)
    if not material:
        return []
    return sorted([int(t) for t in material["thicknesses"].keys()])


def get_price_per_m2(material_name: str, thickness_mm: float) -> Optional[float]:
    material = get_material(material_name)
    if not material:
        return None
    thickness = int(thickness_mm)
    entry = material["thicknesses"].get(thickness)
    if not entry:
        return None
    return entry["price_per_m2"]


def list_colors() -> List[Dict[str, str]]:
    return COLORS


def get_catalog() -> Dict[str, Any]:
    return {
        "board_formats": BOARD_FORMATS,
        "materials": list_materials(),
        "colors": COLORS,
    }
