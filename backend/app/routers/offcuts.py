from typing import List

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app import inventory as inventory_service
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import OffcutCreate, OffcutRead

router = APIRouter()


@router.get("/registry", response_model=List[OffcutRead])
def list_offcut_registry(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista los retazos reutilizables registrados (tabla offcuts)."""
    return inventory_service.list_offcut_records(db)


@router.post("", response_model=OffcutRead, status_code=status.HTTP_201_CREATED)
def create_offcut(
    payload: OffcutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return inventory_service.create_offcut(db, payload)


@router.delete("/{offcut_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offcut(
    offcut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inventory_service.delete_offcut(db, offcut_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
