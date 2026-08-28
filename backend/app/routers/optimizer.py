from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app import optimizer as optimizer_service
from app.database import get_db
from app.limiter import limiter
from app.schemas import OptimizeRequest, OptimizeResponse

router = APIRouter()


@router.post("/optimize", response_model=OptimizeResponse)
@limiter.limit("10/minute")
def optimize(request: Request, payload: OptimizeRequest, db: Session = Depends(get_db)):
    """Optimizacion rapida sin guardar proyecto."""
    offcuts = []
    if payload.use_offcuts:
        from app import inventory as inventory_service
        offcuts_db = inventory_service.list_offcuts(db)
        offcuts = []
        for o in offcuts_db:
            for _ in range(o.cantidad):
                offcuts.append(
                    {"id": o.id, "ancho": o.ancho_mm, "alto": o.alto_mm, "espesor": o.espesor_mm}
                )

    pieces = [p.model_dump() for p in payload.piezas]
    result = optimizer_service.optimize_cuts(
        board_width_mm=payload.tablero.ancho,
        board_height_mm=payload.tablero.alto,
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
