from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Piece, Project


def build_assembly_steps(project: Project, pieces: List[Piece]) -> Dict[str, Any]:
    piece_ids = [p.external_id for p in pieces]
    steps = []

    # Paso 1: cantos
    steps.append({
        "numero": 1,
        "titulo": "Pegar cantos",
        "piezas": piece_ids[:4],
        "herramientas": ["plancha canto", "cutter"],
        "tiempo_estimado_min": 15,
    })

    # Paso 2: ensamblaje base
    base_like = [p.external_id for p in pieces if "base" in p.external_id or "tapa" in p.external_id][:3]
    steps.append({
        "numero": 2,
        "titulo": "Atornillar laterales a base",
        "piezas": base_like if base_like else piece_ids[:3],
        "herramientas": ["taladro", "escuadra"],
        "tiempo_estimado_min": 20,
    })

    # Paso 3: estantes / patas
    steps.append({
        "numero": 3,
        "titulo": "Colocar elementos intermedios",
        "piezas": [p.external_id for p in pieces if "estante" in p.external_id or "pata" in p.external_id][:4],
        "herramientas": ["taladro", "nivel"],
        "tiempo_estimado_min": 25,
    })

    # Paso 4: fondo / puertas
    steps.append({
        "numero": 4,
        "titulo": "Fijar fondo y acabados",
        "piezas": [p.external_id for p in pieces if "fondo" in p.external_id or "puerta" in p.external_id][:2],
        "herramientas": ["clavadora", "lijadora"],
        "tiempo_estimado_min": 20,
    })

    return {"pasos": steps}


def get_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
    return build_assembly_steps(project, pieces)
