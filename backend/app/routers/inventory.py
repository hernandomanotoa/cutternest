from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import inventory as inventory_service
from app.database import get_db
from app.dependencies import get_current_user_or_guest
from app.models import User
from app.schemas import InventoryConsume, InventoryCreate, InventoryRead

router = APIRouter()


@router.get("", response_model=List[InventoryRead])
def list_inventory(
    tipo: Optional[str] = None,
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    items = inventory_service.list_inventory(db, tipo=tipo, estado=estado)
    return items


@router.get("/offcuts", response_model=List[InventoryRead])
def list_offcuts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return inventory_service.list_offcuts(db)


@router.post("", response_model=InventoryRead, status_code=status.HTTP_201_CREATED)
def create_inventory(
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return inventory_service.create_inventory(db, payload)


@router.patch("/{item_id}/consume", response_model=InventoryRead)
def consume_inventory(
    item_id: str,
    payload: InventoryConsume,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return inventory_service.consume_inventory(db, item_id, payload.cantidad)
