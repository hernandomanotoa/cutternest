from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import catalog as catalog_service
from app import pdf_generator
from app import price_list as price_list_service
from app.models import Piece, PriceItemType, Project, Quote


def _resolve_costo_m2_mdf(project: Project, override: Optional[float]) -> float:
    if override is not None and override > 0:
        return override
    price = catalog_service.get_price_per_m2(project.material_type or "MDF Melamina", project.board_thickness_mm or 18)
    if price is not None:
        return price
    return 8.5


# ── Estimación de herrajes del proyecto ────────────────────────────────────
# Nombres canónicos: coinciden con los templates del catálogo
# (config/hardware_templates.json) para que el match con la lista de precios
# sea exacto.
def _calcular_herrajes(pieces: List[Piece]) -> List[Dict[str, Any]]:
    """Heurística de herrajes a partir de los nombres de las piezas.

    - Toda pieza lleva tornillería de ensamble (confirmat).
    - Puertas: bisagras de cazoleta + tirador.
    - Cajones/zapateras: par de correderas telescópicas + tirador.
    """
    agregados: Dict[str, float] = {}

    def sumar(nombre: str, cantidad: float) -> None:
        agregados[nombre] = agregados.get(nombre, 0.0) + cantidad

    for p in pieces:
        und = max(1, int(p.quantity))
        nombre = (p.name or "").lower()
        sumar("Tornillo confirmat 6.4x50", 4 * und)
        if "puerta" in nombre:
            sumar("Bisagra cazoleta 35mm", 2 * und)
            sumar("Tirador aluminio 128mm", 1 * und)
        if "cajon" in nombre or "cajón" in nombre or "zapatera" in nombre:
            sumar("Corredera telescopica 450mm", 2 * und)
            sumar("Tirador aluminio 128mm", 1 * und)

    return [{"nombre": n, "cantidad": c} for n, c in sorted(agregados.items())]


def calcular_cotizacion(
    db: Session,
    project: Project,
    hardware_extra: List[Dict[str, Any]],
    costo_m2_mdf: Optional[float],
    margen: float,
    incluir_mano_obra: bool = False,
) -> Dict[str, Any]:
    """Cotizador 1-clic: desglose por conceptos desde la lista de precios.

    - materiales: Σ área de piezas × precio material_m2 del material del
      proyecto (lista de precios, fallback al catálogo, fallback 8.5).
    - tapacanto: metros lineales (clasificación de cantos) × tapacanto_ml.
    - herrajes: estimación por nombre de pieza + items extra del request,
      match exacto por nombre en price_items tipo herraje (sin precio → 0 y
      warning).
    - mano de obra (opcional): área de piezas × mano_obra_m2.
    """
    pieces = db.query(Piece).filter(Piece.project_id == project.id).all()
    items: List[Dict[str, Any]] = []
    warnings: List[str] = []
    material_nombre = project.material_type or "MDF"

    # Materiales
    area_piezas = sum(p.width_mm * p.height_mm * p.quantity for p in pieces) / 1_000_000.0
    precio_item = price_list_service.find_price(db, PriceItemType.material_m2, material_nombre)
    if precio_item is not None:
        precio_material = precio_item.precio
        moneda_material = precio_item.moneda
    elif costo_m2_mdf is not None and costo_m2_mdf > 0:
        precio_material = costo_m2_mdf
        moneda_material = "$"
    else:
        precio_material = _resolve_costo_m2_mdf(project, None)
        moneda_material = "$"
        warnings.append(
            f"Material '{material_nombre}' sin precio en la lista; se usa el precio de catálogo."
        )
    subtotal_material = round(area_piezas * precio_material, 2)
    items.append({
        "concepto": "Material",
        "detalle": f"{material_nombre} — {area_piezas:.2f} m² de piezas",
        "cantidad": round(area_piezas, 4),
        "unidad": f"m² ({moneda_material})",
        "precio_unit": round(precio_material, 4),
        "subtotal": subtotal_material,
    })

    # Tapacanto
    piezas_cantos = [
        {"ancho": p.width_mm, "alto": p.height_mm, "cantidad": p.quantity, "cantos": p.edge_banding or ""}
        for p in pieces
    ]
    clasificacion = pdf_generator._clasificar_cantos(piezas_cantos)
    metros_ml = clasificacion["total_metros"]
    if metros_ml > 0:
        item_ml = price_list_service.first_price_of_type(db, PriceItemType.tapacanto_ml)
        if item_ml is None:
            warnings.append("Tapacanto sin precio en la lista (tipo tapacanto_ml); se cotiza a 0.")
            precio_ml, moneda_ml = 0.0, "$"
        else:
            precio_ml, moneda_ml = item_ml.precio, item_ml.moneda
        items.append({
            "concepto": "Tapacanto",
            "detalle": f"{metros_ml:.2f} ml de tapacanto ({clasificacion['total_unidades']} piezas canteadas)",
            "cantidad": round(metros_ml, 4),
            "unidad": f"ml ({moneda_ml})",
            "precio_unit": round(precio_ml, 4),
            "subtotal": round(metros_ml * precio_ml, 2),
        })

    # Herrajes: estimación del proyecto + items extra del request
    herrajes = _calcular_herrajes(pieces)
    for h in hardware_extra:
        if h.get("item"):
            herrajes.append({"nombre": str(h["item"]), "cantidad": float(h.get("cantidad", 1))})
    hardware_resuelto: List[Dict[str, Any]] = []
    subtotal_herrajes = 0.0
    for h in herrajes:
        if h["cantidad"] <= 0:
            continue
        item_h = price_list_service.find_price(db, PriceItemType.herraje, h["nombre"])
        if item_h is None:
            warnings.append(f"Herraje '{h['nombre']}' sin precio en la lista; se cotiza a 0.")
            precio_h, moneda_h = 0.0, "$"
        else:
            precio_h, moneda_h = item_h.precio, item_h.moneda
        subtotal = round(h["cantidad"] * precio_h, 2)
        subtotal_herrajes += subtotal
        hardware_resuelto.append({
            "item": h["nombre"],
            "cantidad": h["cantidad"],
            "precio_unit": round(precio_h, 4),
            "moneda": moneda_h,
            "subtotal": subtotal,
        })
    if hardware_resuelto:
        items.append({
            "concepto": "Herrajes",
            "detalle": ", ".join(f"{h['item']} ×{h['cantidad']:g}" for h in hardware_resuelto),
            "cantidad": sum(h["cantidad"] for h in hardware_resuelto),
            "unidad": "ud.",
            "precio_unit": None,
            "subtotal": round(subtotal_herrajes, 2),
        })

    # Mano de obra (opcional)
    subtotal_mano_obra = 0.0
    if incluir_mano_obra:
        item_mo = price_list_service.first_price_of_type(db, PriceItemType.mano_obra_m2)
        if item_mo is None:
            warnings.append("Mano de obra sin precio en la lista (tipo mano_obra_m2); se cotiza a 0.")
            precio_mo, moneda_mo = 0.0, "$"
        else:
            precio_mo, moneda_mo = item_mo.precio, item_mo.moneda
        subtotal_mano_obra = round(area_piezas * precio_mo, 2)
        items.append({
            "concepto": "Mano de obra",
            "detalle": f"{area_piezas:.2f} m² de piezas",
            "cantidad": round(area_piezas, 4),
            "unidad": f"m² ({moneda_mo})",
            "precio_unit": round(precio_mo, 4),
            "subtotal": subtotal_mano_obra,
        })

    subtotal = round(sum(i["subtotal"] for i in items), 2)
    total = round(subtotal * margen, 2)

    breakdown = {
        "material": round(subtotal_material, 2),
        "hardware": round(subtotal_herrajes, 2),
        "mano_obra": round(subtotal_mano_obra, 2),
        "subtotal": subtotal,
        "total": total,
    }

    return {
        "items": items,
        "total": total,
        "subtotal": subtotal,
        "warnings": warnings,
        "breakdown": breakdown,
        "hardware": [
            {"item": h["item"], "cantidad": h["cantidad"], "precio_unit": h["precio_unit"]}
            for h in hardware_resuelto
        ],
    }


def calculate_quote(
    db: Session,
    project: Project,
    hardware: List[Dict[str, Any]],
    costo_m2_mdf: Optional[float],
    costo_hora_mano_obra: float,
    margin: float,
    incluir_mano_obra: bool = False,
) -> Dict[str, Any]:
    """Calcula la cotización 1-clic y persiste el Quote del proyecto."""
    resultado = calcular_cotizacion(
        db,
        project,
        hardware,
        costo_m2_mdf,
        margin,
        incluir_mano_obra=incluir_mano_obra,
    )

    quote = Quote(
        project_id=project.id,
        hardware=resultado["hardware"],
        material_cost=resultado["breakdown"]["material"],
        hardware_cost=resultado["breakdown"]["hardware"],
        labor_cost=resultado["breakdown"]["mano_obra"],
        total=resultado["breakdown"]["total"],
        margin=margin,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return {
        "quote_id": quote.id,
        "project_id": quote.project_id,
        "items": resultado["items"],
        "total": resultado["total"],
        "subtotal": resultado["subtotal"],
        "warnings": resultado["warnings"],
        "breakdown": resultado["breakdown"],
        "hardware": resultado["hardware"],
        "created_at": quote.created_at,
    }


def list_quotes(db: Session, project_id: str) -> List[Quote]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return db.query(Quote).filter(Quote.project_id == project_id).order_by(Quote.created_at.desc()).all()
