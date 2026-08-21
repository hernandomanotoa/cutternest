from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import assembly as assembly_service
from app import inventory as inventory_service
from app import optimizer as optimizer_service
from app import pdf_generator
from app import quotes as quotes_service
from app import svg_generator
from app.config import get_settings
from app.models import AssemblyState, AssemblyStep, Inventory, InventoryState, Layout, Piece, Project, Quote, User
from app.schemas import OptimizeRequest, ProjectCreate, QuoteRequest

settings = get_settings()


def create_project(db: Session, payload: ProjectCreate, owner: Optional[User] = None) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=owner.id if owner else None,
        board_width_mm=payload.board_width_mm or 2440.0,
        board_height_mm=payload.board_height_mm or 1220.0,
        board_thickness_mm=payload.board_thickness_mm or 18.0,
        kerf_mm=payload.kerf_mm or settings.kerf_mm,
        margin_mm=payload.margin_mm or settings.margen_mm,
        material_type=payload.material_type or "MDF",
        use_offcuts=payload.use_offcuts if payload.use_offcuts is not None else False,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_project(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return project


def list_projects(
    db: Session,
    owner: Optional[User] = None,
    query: Optional[str] = None,
    status: Optional[str] = None,
    material_type: Optional[str] = None,
) -> List[Project]:
    q = db.query(Project)
    if owner:
        q = q.filter(Project.owner_id == owner.id)
    if status:
        q = q.filter(Project.status == status)
    if material_type:
        q = q.filter(Project.material_type.ilike(material_type))
    if query:
        like = f"%{query}%"
        q = q.filter((Project.name.ilike(like)) | (Project.description.ilike(like)))
    return q.order_by(Project.created_at.desc()).all()


def add_pieces_to_project(db: Session, project: Project, pieces: List[Dict[str, Any]]) -> Project:
    coded_pieces = assembly_service.assign_piece_codes(pieces)
    for p in coded_pieces:
        db.add(
            Piece(
                project_id=project.id,
                external_id=p["id"],
                name=p["nombre"],
                width_mm=float(p["ancho"]),
                height_mm=float(p["alto"]),
                quantity=int(p.get("cantidad", 1)),
                rotate=bool(p.get("rotate", True)),
                color=p.get("color", "#3B82F6"),
                thickness_mm=float(p.get("espesor", project.board_thickness_mm)),
                edge_banding=p.get("cantos", ""),
            )
        )
    db.commit()
    db.refresh(project)
    return project


def save_pieces(db: Session, project_id: str, pieces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Guarda/reemplaza las piezas de un proyecto sin optimizar. Genera el ensamblaje."""
    project = get_project(db, project_id)
    db.query(Piece).filter(Piece.project_id == project.id).delete()
    db.query(Layout).filter(Layout.project_id == project.id).delete()
    db.commit()
    add_pieces_to_project(db, project, pieces)
    return assembly_service.generate_for_project(db, project.id)


def optimize_project(db: Session, project_id: str, payload: OptimizeRequest) -> Dict[str, Any]:
    project = get_project(db, project_id)

    # Actualizar configuracion si viene en payload
    if payload.tablero:
        project.board_width_mm = payload.tablero.ancho
        project.board_height_mm = payload.tablero.alto
        project.board_thickness_mm = payload.tablero.espesor
        project.kerf_mm = payload.tablero.kerf_mm
        project.margin_mm = payload.tablero.margen_mm
    if payload.material_type:
        project.material_type = payload.material_type
    project.use_offcuts = payload.use_offcuts
    db.commit()

    # Borrar piezas anteriores y layouts anteriores
    db.query(Piece).filter(Piece.project_id == project.id).delete()
    db.query(Layout).filter(Layout.project_id == project.id).delete()
    db.commit()

    add_pieces_to_project(db, project, [p.model_dump() for p in payload.piezas])

    offcuts = []
    if project.use_offcuts:
        offcuts_db = inventory_service.list_matching_offcuts(
            db,
            material_type=project.material_type or "MDF",
            thickness_mm=project.board_thickness_mm,
        )
        # Respetar cantidad: duplicar entradas por cada unidad disponible.
        for o in offcuts_db:
            for _ in range(o.cantidad):
                offcuts.append({"id": o.id, "ancho": o.ancho_mm, "alto": o.alto_mm, "espesor": o.espesor_mm})

    pieces = [p.model_dump() for p in payload.piezas]
    result = optimizer_service.optimize_cuts(
        board_width_mm=project.board_width_mm,
        board_height_mm=project.board_height_mm,
        pieces=pieces,
        offcuts=offcuts,
        kerf_mm=project.kerf_mm,
        margin_mm=project.margin_mm,
    )

    exports_dir = "/app/data/exports"
    import os
    os.makedirs(exports_dir, exist_ok=True)

    # Guardar layouts y generar archivos
    for idx, board in enumerate(result["tableros"]):
        paths = svg_generator.save_layout_files(board, idx, exports_dir)
        db.add(
            Layout(
                project_id=project.id,
                board_index=idx,
                board_width_mm=board["ancho"],
                board_height_mm=board["alto"],
                utilization=board["utilizacion"],
                svg_path=paths["svg_path"],
                png_path=paths["png_path"],
                placements=board["placements"],
            )
        )
    db.commit()

    # Consumir sobrantes utilizados y registrar sobrantes grandes aproximados.
    threshold = settings.offcut_threshold_mm
    used_offcut_ids = set(result.get("offcut_ids_used", []))
    for offcut_id in used_offcut_ids:
        inventory_service.consume_inventory(db, offcut_id, cantidad=1)

    for board in result["tableros"]:
        board_area = board["ancho"] * board["alto"]
        used_area = sum(p["w"] * p["h"] for p in board["placements"])
        leftover_area = board_area - used_area
        if leftover_area <= 0:
            continue
        # Aproximar sobrante como rectángulo del ancho del tablero x alto = area/ancho.
        offcut_w = board["ancho"]
        offcut_h = leftover_area / offcut_w
        # Normalizar a dimensiones razonables (alto <= alto del tablero).
        if offcut_h > board["alto"]:
            offcut_h = board["alto"]
            offcut_w = leftover_area / offcut_h
        if offcut_w >= threshold and offcut_h >= threshold:
            inventory_service.add_offcut_from_project(
                db,
                project,
                ancho_mm=round(offcut_w, 2),
                alto_mm=round(offcut_h, 2),
                cantidad=1,
            )

    return result


def get_layouts(db: Session, project_id: str) -> List[Layout]:
    return db.query(Layout).filter(Layout.project_id == project_id).all()


def create_quote(db: Session, project_id: str, payload: QuoteRequest) -> Dict[str, Any]:
    project = get_project(db, project_id)
    hardware = [item.model_dump() for item in payload.hardware]
    quote = quotes_service.calculate_quote(
        db,
        project,
        hardware,
        payload.costo_m2_mdf,
        payload.costo_hora_mano_obra,
        payload.margen,
    )
    pdf_path = pdf_generator.generate_quote_pdf(quote, project.name, "/app/data/exports")
    from app.models import Quote as QuoteModel
    q = db.query(QuoteModel).filter(QuoteModel.id == quote["quote_id"]).first()
    if q:
        q.pdf_path = pdf_path
        db.commit()
    quote["pdf_path"] = pdf_path
    return quote


def generate_cutlist(db: Session, project_id: str) -> str:
    project = get_project(db, project_id)
    layouts = get_layouts(db, project_id)
    boards = [
        {
            "board_index": l.board_index,
            "ancho": l.board_width_mm,
            "alto": l.board_height_mm,
            "placements": l.placements,
        }
        for l in layouts
    ]
    return pdf_generator.generate_cutlist_pdf(project.name, boards, "/app/data/exports")


def generate_labels(db: Session, project_id: str, label_size: str = "50x30") -> str:
    project = get_project(db, project_id)
    layouts = get_layouts(db, project_id)
    boards = [
        {
            "board_index": l.board_index,
            "ancho": l.board_width_mm,
            "alto": l.board_height_mm,
            "placements": l.placements,
        }
        for l in layouts
    ]
    return pdf_generator.generate_labels_pdf(project.name, boards, "/app/data/exports", label_size)


def delete_project(db: Session, project_id: str) -> None:
    project = get_project(db, project_id)
    db.delete(project)
    db.commit()


def get_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    return assembly_service.get_assembly(db, project_id)


def generate_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    return assembly_service.generate_for_project(db, project_id)


def project_progress(db: Session, project_id: str) -> Dict[str, Any]:
    project = get_project(db, project_id)
    state = db.query(AssemblyState).filter(AssemblyState.project_id == project_id).first()
    if state and state.completed_step_ids:
        steps = db.query(AssemblyStep).filter(AssemblyStep.project_id == project_id).count()
        completed = len(state.completed_step_ids)
        percentage = round((completed / max(steps, 1)) * 100, 2)
        return {"project_id": project_id, "percentage": percentage, "completed_steps": completed, "total_steps": steps}

    layouts = get_layouts(db, project_id)
    if layouts:
        avg_utilization = sum(l.utilization for l in layouts) / len(layouts)
        return {
            "project_id": project_id,
            "percentage": round(min(avg_utilization, 100.0), 2),
            "completed_steps": 0,
            "total_steps": 0,
        }

    return {"project_id": project_id, "percentage": 0.0, "completed_steps": 0, "total_steps": 0}


def generate_assembly_pdf(db: Session, project_id: str) -> str:
    project = get_project(db, project_id)
    assembly = assembly_service.get_assembly(db, project_id)
    pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
    pieces_data = [
        {
            "external_id": p.external_id,
            "name": p.name,
            "width_mm": p.width_mm,
            "height_mm": p.height_mm,
        }
        for p in pieces
    ]
    return pdf_generator.generate_assembly_manual(
        project_name=project.name,
        steps=assembly.get("pasos", []),
        pieces=pieces_data,
        exports_dir="/app/data/exports",
        project_id=project.id,
    )
