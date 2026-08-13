from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import optimizer as optimizer_service
from app import projects as projects_service
from app.database import get_db
from app.dependencies import get_current_user_or_guest
from app.models import User
from app.schemas import OptimizeRequest, OptimizeResponse

router = APIRouter()


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(payload: OptimizeRequest, db: Session = Depends(get_db)):
    """Optimizacion rapida sin guardar proyecto."""
    offcuts = []
    if payload.usar_sobrantes:
        from app import inventory as inventory_service
        offcuts_db = inventory_service.list_offcuts(db)
        offcuts = [
            {"id": o.id, "ancho": o.ancho_cm, "alto": o.alto_cm, "espesor": o.espesor_mm}
            for o in offcuts_db
        ]

    pieces = [p.model_dump() for p in payload.piezas]
    result = optimizer_service.optimize_cuts(
        board_width_cm=payload.tablero.ancho,
        board_height_cm=payload.tablero.alto,
        pieces=pieces,
        offcuts=offcuts,
        kerf_mm=payload.tablero.kerf_mm,
        margin_mm=payload.tablero.margen_mm,
    )
    return OptimizeResponse(
        tableros=result["tableros"],
        total_tableros=result["total_tableros"],
        area_total_m2=result["area_total_m2"],
        area_usada_m2=result["area_usada_m2"],
    )


@router.post("/projects/{project_id}/optimize")
def optimize_project(
    project_id: str,
    payload: OptimizeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.optimize_project(db, project_id, payload)


@router.get("/projects/{project_id}/layouts")
def list_layouts(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.get_layouts(db, project_id)
