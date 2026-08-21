"""Catálogo de materiales, formatos, espesores y colores basado en la guía ecuatoriana.

Fuente: docs/GUIA-MELAMINICOS-ECUADOR.md

El catálogo se carga desde backend/app/config/catalog.json en tiempo de importación.
Los precios pueden sobrescribirse mediante la variable de entorno CATALOG_PRICES_JSON.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


_CATALOG_PATH = Path(__file__).parent / "config" / "catalog.json"
_HARDWARE_TEMPLATES_PATH = Path(__file__).parent / "config" / "hardware_templates.json"


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_materials(data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Convierte las claves de espesor a enteros y asegura la estructura esperada."""
    materials: Dict[str, Dict[str, Any]] = {}
    for name, entry in data.items():
        thicknesses: Dict[int, Dict[str, Any]] = {}
        for tk, tv in entry.get("thicknesses", {}).items():
            thicknesses[int(tk)] = tv
        materials[name] = {
            "description": entry.get("description", ""),
            "thicknesses": thicknesses,
        }
    return materials


def _apply_price_overrides(materials: Dict[str, Dict[str, Any]]) -> None:
    """Aplica sobrescrituras de precios desde CATALOG_PRICES_JSON."""
    override_json = os.environ.get("CATALOG_PRICES_JSON")
    if not override_json:
        return
    try:
        overrides = json.loads(override_json)
    except json.JSONDecodeError:
        return

    if not isinstance(overrides, dict):
        return

    for material_name, thickness_data in overrides.items():
        if material_name not in materials:
            continue
        if not isinstance(thickness_data, dict):
            continue
        for tk, price_info in thickness_data.items():
            try:
                thickness_key = int(tk)
            except (ValueError, TypeError):
                continue
            if thickness_key not in materials[material_name]["thicknesses"]:
                continue
            if isinstance(price_info, (int, float)):
                materials[material_name]["thicknesses"][thickness_key]["price_per_m2"] = float(price_info)
            elif isinstance(price_info, dict):
                current = materials[material_name]["thicknesses"][thickness_key]
                current.update(price_info)


BOARD_FORMATS: List[Dict[str, Any]] = []
MATERIALS: Dict[str, Dict[str, Any]] = {}
COLORS: List[Dict[str, str]] = []


def _normalize_board_formats(formats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Asegura que los formatos expongan width_mm/height_mm, con fallback a *_cm."""
    normalized: List[Dict[str, Any]] = []
    for f in formats:
        entry = dict(f)
        if "width_mm" not in entry and "width_cm" in entry:
            entry["width_mm"] = float(entry["width_cm"]) * 10.0
        if "height_mm" not in entry and "height_cm" in entry:
            entry["height_mm"] = float(entry["height_cm"]) * 10.0
        normalized.append(entry)
    return normalized


def reload_catalog() -> None:
    """Recarga el catálogo desde disco y variables de entorno en runtime."""
    global BOARD_FORMATS, MATERIALS, COLORS
    data = _load_json(_CATALOG_PATH)
    BOARD_FORMATS = _normalize_board_formats(data.get("board_formats", []))
    MATERIALS = _normalize_materials(data.get("materials", {}))
    COLORS = data.get("colors", [])
    _apply_price_overrides(MATERIALS)


# Carga inicial en importación.
reload_catalog()


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


def list_hardware_templates() -> List[Dict[str, Any]]:
    data = _load_json(_HARDWARE_TEMPLATES_PATH)
    return data.get("templates", [])
