from typing import List, Optional

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app import price_list as price_list_service
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import PriceItemCreate, PriceItemRead, PriceItemUpdate

router = APIRouter()


@router.get("", response_model=List[PriceItemRead])
def list_prices(
    tipo: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista de precios del cotizador 1-clic (filtro opcional por tipo)."""
    return price_list_service.list_price_items(db, tipo=tipo)


@router.post("", response_model=PriceItemRead, status_code=status.HTTP_201_CREATED)
def create_price(
    payload: PriceItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return price_list_service.create_price_item(
        db, payload.tipo, payload.nombre, payload.precio, payload.moneda
    )


@router.patch("/{item_id}", response_model=PriceItemRead)
def update_price(
    item_id: str,
    payload: PriceItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return price_list_service.update_price_item(
        db, item_id, nombre=payload.nombre, precio=payload.precio, moneda=payload.moneda
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    price_list_service.delete_price_item(db, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
