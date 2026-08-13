from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Layout, Piece, Project, Quote

settings = get_settings()


def calculate_quote(
    db: Session,
    project: Project,
    hardware: List[Dict[str, Any]],
    costo_m2_mdf: float,
    costo_hora_mano_obra: float,
    margin: float,
) -> Dict[str, Any]:
    # Area total de tableros usados
    layouts = db.query(Layout).filter(Layout.project_id == project.id).all()
    if layouts:
        area_total_m2 = sum((l.board_width_cm * l.board_height_cm) / 10000.0 for l in layouts)
    else:
        # Fallback: area de piezas + 15% desperdicio
        pieces = db.query(Piece).filter(Piece.project_id == project.id).all()
        area_piezas = sum((p.width_cm * p.height_cm * p.quantity) / 10000.0 for p in pieces)
        area_total_m2 = area_piezas * 1.15

    material_cost = area_total_m2 * costo_m2_mdf * 1.15
    hardware_cost = sum(item["cantidad"] * item["precio_unit"] for item in hardware)

    # Mano de obra: 2 min por corte + 30 min setup
    pieces = db.query(Piece).filter(Piece.project_id == project.id).all()
    total_cuts = sum(p.quantity for p in pieces)
    labor_minutes = total_cuts * 2 + 30
    labor_cost = (labor_minutes / 60.0) * costo_hora_mano_obra

    subtotal = material_cost + hardware_cost + labor_cost
    total = subtotal * margin

    breakdown = {
        "material": round(material_cost, 2),
        "hardware": round(hardware_cost, 2),
        "mano_obra": round(labor_cost, 2),
        "subtotal": round(subtotal, 2),
        "total": round(total, 2),
    }

    quote = Quote(
        project_id=project.id,
        hardware=hardware,
        material_cost=breakdown["material"],
        hardware_cost=breakdown["hardware"],
        labor_cost=breakdown["mano_obra"],
        total=breakdown["total"],
        margin=margin,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return {
        "quote_id": quote.id,
        "project_id": project.id,
        "breakdown": breakdown,
        "hardware": hardware,
        "created_at": quote.created_at,
    }
