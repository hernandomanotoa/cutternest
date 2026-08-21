"""
Router para administrar ejemplos del Assembly Planner.
Permite guardar un CSV editado como ejemplo y exponerlo en el selector.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pathlib import Path
import re

router = APIRouter(tags=['assembly-planner'])


class SaveExampleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    csv: str = Field(..., min_length=1, max_length=900_000)


def _assembly_planner_dir() -> Path:
    """Ruta al directorio del assembly-planner (funciona en Docker y en dev local)."""
    backend_app = Path(__file__).resolve().parents[1]
    project_root = backend_app.parents[1]
    return project_root / 'frontend' / 'public' / 'assembly-planner'


def _slugify(name: str) -> str:
    """Convierte un nombre legible a slug seguro para archivo."""
    base = name.lower().strip()
    base = re.sub(r'[^a-z0-9\s-]', '', base)
    base = re.sub(r'[\s-]+', '-', base)
    return base.strip('-')[:50] or 'ejemplo'


def _update_selector(index_html: Path, slug: str, name: str) -> None:
    """Añade la opción al selector si no existe."""
    text = index_html.read_text(encoding='utf-8')
    option = f'<option value="./data/ejemplo-{slug}.csv">{name}</option>'
    if option in text:
        return

    marker = '<select id="example-selector" class="w-full">'
    if marker not in text:
        raise HTTPException(status_code=500, detail='No se encontró el selector de ejemplos en index.html')

    # Insertar la nueva opción justo después del placeholder
    placeholder = '<option value="" disabled selected>Seleccionar mueble...</option>'
    if placeholder in text:
        text = text.replace(placeholder, placeholder + '\n            ' + option, 1)
    else:
        # Fallback: insertar después del marker
        text = text.replace(marker, marker + '\n            ' + option, 1)

    index_html.write_text(text, encoding='utf-8')


@router.post('/examples')
async def save_example(payload: SaveExampleRequest):
    ap_dir = _assembly_planner_dir()
    if not ap_dir.exists():
        raise HTTPException(status_code=500, detail='No se encontró el directorio del Assembly Planner')

    slug = _slugify(payload.name)
    file_name = f'ejemplo-{slug}.csv'
    csv_path = ap_dir / 'data' / file_name
    index_html = ap_dir / 'index.html'

    try:
        csv_path.write_text(payload.csv, encoding='utf-8')
        _update_selector(index_html, slug, payload.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Error guardando ejemplo: {exc}')

    return {
        'ok': True,
        'path': f'./data/{file_name}',
        'name': payload.name,
        'slug': slug,
    }
