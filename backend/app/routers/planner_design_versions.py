"""
Router de versiones de diseno del Assembly Planner (nube).

Persiste en la tabla planner_design_versions el mismo payload que
projectVersionsService guarda en localStorage: nombre + CSV del mueble.
Requiere sesion de usuario principal (misma dependencia que projects).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models import PlannerDesignVersion, User

router = APIRouter(tags=['planner-design-versions'])

MAX_VERSIONS_PER_USER = 50
MAX_CSV_CHARS = 900_000


class SaveDesignVersionRequest(BaseModel):
    model_config = {'populate_by_name': True}

    name: str = Field(..., min_length=1, max_length=80)
    csv: str = Field(..., min_length=1, max_length=MAX_CSV_CHARS)
    piece_count: int = Field(0, ge=0, alias='pieceCount')


def _to_summary(v: PlannerDesignVersion) -> dict:
    return {
        'id': v.id,
        'name': v.name,
        'pieceCount': v.piece_count,
        'savedAt': v.saved_at.isoformat() if v.saved_at else None,
    }


@router.get('/')
@limiter.limit('30/minute')
def list_design_versions(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    versions = (
        db.query(PlannerDesignVersion)
        .filter(PlannerDesignVersion.user_id == user.id)
        .order_by(PlannerDesignVersion.saved_at.desc())
        .all()
    )
    return {'versions': [_to_summary(v) for v in versions]}


@router.post('/', status_code=201)
@limiter.limit('12/minute')
def save_design_version(
    request: Request,
    payload: SaveDesignVersionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    version = PlannerDesignVersion(
        user_id=user.id,
        name=payload.name.strip()[:80],
        csv=payload.csv,
        piece_count=payload.piece_count,
    )
    db.add(version)
    db.flush()

    # Capacidad maxima: expulsa las mas viejas.
    versions = (
        db.query(PlannerDesignVersion)
        .filter(PlannerDesignVersion.user_id == user.id)
        .order_by(PlannerDesignVersion.saved_at.desc())
        .all()
    )
    evicted = []
    while len(versions) > MAX_VERSIONS_PER_USER:
        old = versions.pop()
        evicted.append(old.id)
        db.delete(old)
    db.commit()
    return {'ok': True, 'version': _to_summary(version), 'evicted': evicted}


@router.get('/{version_id}')
@limiter.limit('30/minute')
def get_design_version(version_id: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    version = db.query(PlannerDesignVersion).filter(
        PlannerDesignVersion.id == version_id,
        PlannerDesignVersion.user_id == user.id,
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail='Version no encontrada')
    return {
        'id': version.id,
        'name': version.name,
        'csv': version.csv,
        'pieceCount': version.piece_count,
        'savedAt': version.saved_at.isoformat() if version.saved_at else None,
    }


@router.delete('/{version_id}')
@limiter.limit('30/minute')
def delete_design_version(version_id: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    version = db.query(PlannerDesignVersion).filter(
        PlannerDesignVersion.id == version_id,
        PlannerDesignVersion.user_id == user.id,
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail='Version no encontrada')
    db.delete(version)
    db.commit()
    return {'ok': True}


@router.delete('/')
@limiter.limit('6/minute')
def delete_all_design_versions(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(PlannerDesignVersion).filter(PlannerDesignVersion.user_id == user.id).delete()
    db.commit()
    return {'ok': True}
