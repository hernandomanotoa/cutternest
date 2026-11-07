"""Lista de precios editable del cotizador 1-clic (tabla price_items)."""

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import PriceItem, PriceItemType


def _normalizar_tipo(tipo: str) -> PriceItemType:
    try:
        return PriceItemType(tipo)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de precio inválido: {tipo}",
        )


def list_price_items(db: Session, tipo: Optional[str] = None) -> List[PriceItem]:
    q = db.query(PriceItem)
    if tipo:
        q = q.filter(PriceItem.tipo == _normalizar_tipo(tipo))
    return q.order_by(PriceItem.tipo.asc(), PriceItem.nombre.asc()).all()


def create_price_item(db: Session, tipo: str, nombre: str, precio: float, moneda: str) -> PriceItem:
    item = PriceItem(tipo=_normalizar_tipo(tipo), nombre=nombre.strip(), precio=precio, moneda=moneda)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_price_item(
    db: Session,
    item_id: str,
    nombre: Optional[str] = None,
    precio: Optional[float] = None,
    moneda: Optional[str] = None,
) -> PriceItem:
    item = db.query(PriceItem).filter(PriceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precio no encontrado")
    if nombre is not None:
        item.nombre = nombre.strip()
    if precio is not None:
        item.precio = precio
    if moneda is not None:
        item.moneda = moneda
    db.commit()
    db.refresh(item)
    return item


def delete_price_item(db: Session, item_id: str) -> None:
    item = db.query(PriceItem).filter(PriceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precio no encontrado")
    db.delete(item)
    db.commit()


def find_price(db: Session, tipo: PriceItemType, nombre: str) -> Optional[PriceItem]:
    """Match exacto (insensible a mayúsculas/espacios) de nombre dentro de un tipo."""
    clave = nombre.strip().lower()
    for item in db.query(PriceItem).filter(PriceItem.tipo == tipo).all():
        if item.nombre.strip().lower() == clave:
            return item
    return None


def first_price_of_type(db: Session, tipo: PriceItemType) -> Optional[PriceItem]:
    return (
        db.query(PriceItem)
        .filter(PriceItem.tipo == tipo)
        .order_by(PriceItem.nombre.asc())
        .first()
    )
