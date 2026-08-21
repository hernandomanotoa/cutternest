from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Inventory, InventoryMovement, InventoryState, Project
from app.schemas import InventoryCreate

settings = get_settings()


def create_inventory(db: Session, payload: InventoryCreate) -> Inventory:
    area = (payload.ancho_mm * payload.alto_mm) / 1_000_000.0
    item = Inventory(
        tipo=payload.tipo,
        espesor_mm=payload.espesor_mm,
        ancho_mm=payload.ancho_mm,
        alto_mm=payload.alto_mm,
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
    threshold = settings.offcut_threshold_mm
    return (
        db.query(Inventory)
        .filter(
            Inventory.consumed_at.is_(None),
            Inventory.estado == InventoryState.sobrante,
            Inventory.ancho_mm >= threshold,
            Inventory.alto_mm >= threshold,
        )
        .order_by(Inventory.created_at.desc())
        .all()
    )


def list_matching_offcuts(
    db: Session,
    material_type: str,
    thickness_mm: float,
    exclude_consumed: bool = True,
) -> List[Inventory]:
    threshold = settings.offcut_threshold_mm
    q = db.query(Inventory).filter(
        Inventory.estado == InventoryState.sobrante,
        Inventory.ancho_mm >= threshold,
        Inventory.alto_mm >= threshold,
        Inventory.espesor_mm == thickness_mm,
    )
    if material_type:
        q = q.filter(Inventory.tipo.ilike(material_type))
    if exclude_consumed:
        q = q.filter(Inventory.consumed_at.is_(None))
    return q.order_by(Inventory.created_at.desc()).all()


def consume_offcut_by_dimensions(
    db: Session,
    ancho_mm: float,
    alto_mm: float,
    thickness_mm: float,
    material_type: Optional[str] = None,
) -> Optional[Inventory]:
    q = db.query(Inventory).filter(
        Inventory.estado == InventoryState.sobrante,
        Inventory.consumed_at.is_(None),
        Inventory.ancho_mm == ancho_mm,
        Inventory.alto_mm == alto_mm,
        Inventory.espesor_mm == thickness_mm,
    )
    if material_type:
        q = q.filter(Inventory.tipo.ilike(material_type))
    item = q.first()
    if not item:
        return None
    item.cantidad -= 1
    if item.cantidad <= 0:
        item.consumed_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


def _register_movement(db: Session, inventory_id: str, tipo: str, cantidad: int, motivo: Optional[str] = None) -> InventoryMovement:
    movement = InventoryMovement(
        inventory_id=inventory_id,
        tipo=tipo,
        cantidad=cantidad,
        motivo=motivo,
    )
    db.add(movement)
    db.commit()
    return movement


def consume_inventory(db: Session, item_id: str, cantidad: int = 1, motivo: Optional[str] = None) -> Inventory:
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
    _register_movement(db, item.id, "salida", cantidad, motivo)
    return item


def restock_inventory(db: Session, item_id: str, cantidad: int, motivo: Optional[str] = None) -> Inventory:
    item = db.query(Inventory).filter(Inventory.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material no encontrado")
    item.cantidad += cantidad
    if item.consumed_at is not None:
        item.consumed_at = None
        item.estado = InventoryState.nuevo
    db.commit()
    db.refresh(item)
    _register_movement(db, item.id, "entrada", cantidad, motivo)
    return item


def get_inventory_movements(db: Session, item_id: str) -> List[InventoryMovement]:
    return (
        db.query(InventoryMovement)
        .filter(InventoryMovement.inventory_id == item_id)
        .order_by(InventoryMovement.created_at.desc())
        .all()
    )


def get_low_stock_items(db: Session, threshold: int = 1) -> List[Inventory]:
    return (
        db.query(Inventory)
        .filter(
            Inventory.consumed_at.is_(None),
            Inventory.cantidad <= threshold,
        )
        .order_by(Inventory.cantidad.asc())
        .all()
    )


def add_offcut_from_project(
    db: Session,
    project: Project,
    ancho_mm: float,
    alto_mm: float,
    cantidad: int = 1,
    motivo: Optional[str] = None,
) -> Inventory:
    area = (ancho_mm * alto_mm) / 1_000_000.0
    offcut = Inventory(
        tipo=project.material_type or "MDF",
        espesor_mm=project.board_thickness_mm,
        ancho_mm=ancho_mm,
        alto_mm=alto_mm,
        cantidad=cantidad,
        estado=InventoryState.sobrante,
        proyecto_origen=project.id,
        area_m2=area,
    )
    db.add(offcut)
    db.commit()
    db.refresh(offcut)
    _register_movement(
        db,
        offcut.id,
        "entrada",
        cantidad,
        motivo or f"Sobrante generado del proyecto {project.name}",
    )
    return offcut
