from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app import inventory as inventory_service
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
        offcuts_db = inventory_service.find_offcuts_for_optimization(
            db,
            thickness_mm=payload.tablero.espesor,
            material_type=payload.material_type,
        )
        for o in offcuts_db:
            for i in range(o.quantity):
                offcuts.append(
                    {
                        "id": o.id,
                        "bid": f"{o.id}__{i}",
                        "ancho": float(o.width_mm),
                        "alto": float(o.height_mm),
                    }
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
    if payload.use_offcuts:
        for bid in result["offcut_ids_used"]:
            inventory_service.consume_offcut_unit(db, bid.rsplit("__", 1)[0])
    return OptimizeResponse(
        tableros=result["tableros"],
        total_tableros=result["total_tableros"],
        area_total_m2=result["area_total_m2"],
        area_usada_m2=result["area_usada_m2"],
    )
