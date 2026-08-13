from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Inventory, InventoryState, Project
from app.schemas import InventoryCreate

settings = get_settings()


def create_inventory(db: Session, payload: InventoryCreate) -> Inventory:
    area = (payload.ancho_cm * payload.alto_cm) / 10000.0
    item = Inventory(
        tipo=payload.tipo,
        espesor_mm=payload.espesor_mm,
        ancho_cm=payload.ancho_cm,
        alto_cm=payload.alto_cm,
        cantidad=payload.cantidad,
        estado=InventoryState.nuevo,
        area_m2=area,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_inventory(db: Session, tipo: Optional[str] = None, estado: Optional[str] = None) -> List[Inventory]:
    q = db.query(Inventory).filter(Inventory.consumed_at.is_(None))
    if tipo:
        q = q.filter(Inventory.tipo == tipo)
    if estado:
        q = q.filter(Inventory.estado == estado)
    return q.order_by(Inventory.created_at.desc()).all()


def list_offcuts(db: Session) -> List[Inventory]:
    threshold = settings.offcut_threshold_cm
    return (
        db.query(Inventory)
        .filter(
            Inventory.consumed_at.is_(None),
            Inventory.estado == InventoryState.sobrante,
            Inventory.ancho_cm >= threshold,
            Inventory.alto_cm >= threshold,
        )
        .order_by(Inventory.created_at.desc())
        .all()
    )


def consume_inventory(db: Session, item_id: str, cantidad: int = 1) -> Inventory:
    item = db.query(Inventory).filter(Inventory.id == item_id, Inventory.consumed_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material no encontrado")
    if item.cantidad < cantidad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stock insuficiente")
    item.cantidad -= cantidad
    if item.cantidad == 0:
        item.consumed_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


def add_offcut_from_project(
    db: Session,
    project: Project,
    ancho_cm: float,
    alto_cm: float,
    cantidad: int = 1,
) -> Inventory:
    area = (ancho_cm * alto_cm) / 10000.0
    offcut = Inventory(
        tipo=project.material_type or "MDF",
        espesor_mm=project.board_thickness_mm,
        ancho_cm=ancho_cm,
        alto_cm=alto_cm,
        cantidad=cantidad,
        estado=InventoryState.sobrante,
        proyecto_origen=project.id,
        area_m2=area,
    )
    db.add(offcut)
    db.commit()
    db.refresh(offcut)
    return offcut
