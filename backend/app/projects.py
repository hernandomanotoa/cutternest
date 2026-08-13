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
from app.models import Inventory, InventoryState, Layout, Piece, Project, User
from app.schemas import OptimizeRequest, ProjectCreate, QuoteRequest

settings = get_settings()


def create_project(db: Session, payload: ProjectCreate, owner: Optional[User] = None) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=owner.id if owner else None,
        board_width_cm=payload.board_width_cm or 244.0,
        board_height_cm=payload.board_height_cm or 122.0,
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


def list_projects(db: Session, owner: Optional[User] = None) -> List[Project]:
    q = db.query(Project)
    if owner:
        q = q.filter(Project.owner_id == owner.id)
    return q.order_by(Project.created_at.desc()).all()


def add_pieces_to_project(db: Session, project: Project, pieces: List[Dict[str, Any]]) -> Project:
    for p in pieces:
        db.add(
            Piece(
                project_id=project.id,
                external_id=p["id"],
                name=p["nombre"],
                width_cm=float(p["ancho"]),
                height_cm=float(p["alto"]),
                quantity=int(p.get("cantidad", 1)),
                rotate=bool(p.get("rotar", True)),
                color=p.get("color", "#3B82F6"),
                thickness_mm=float(p.get("espesor", project.board_thickness_mm)),
                edge_banding=p.get("cantos", ""),
            )
        )
    db.commit()
    db.refresh(project)
    return project


def optimize_project(db: Session, project_id: str, payload: OptimizeRequest) -> Dict[str, Any]:
    project = get_project(db, project_id)

    # Actualizar configuracion si viene en payload
    if payload.tablero:
        project.board_width_cm = payload.tablero.ancho
        project.board_height_cm = payload.tablero.alto
        project.board_thickness_mm = payload.tablero.espesor
        project.kerf_mm = payload.tablero.kerf_mm
        project.margin_mm = payload.tablero.margen_mm
    project.use_offcuts = payload.usar_sobrantes
    db.commit()

    # Borrar piezas anteriores y layouts anteriores
    db.query(Piece).filter(Piece.project_id == project.id).delete()
    db.query(Layout).filter(Layout.project_id == project.id).delete()
    db.commit()

    add_pieces_to_project(db, project, [p.model_dump() for p in payload.piezas])

    offcuts = []
    if project.use_offcuts:
        offcuts_db = inventory_service.list_offcuts(db)
        offcuts = [
            {"id": o.id, "ancho": o.ancho_cm, "alto": o.alto_cm, "espesor": o.espesor_mm}
            for o in offcuts_db
        ]

    pieces = [p.model_dump() for p in payload.piezas]
    result = optimizer_service.optimize_cuts(
        board_width_cm=project.board_width_cm,
        board_height_cm=project.board_height_cm,
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
                board_width_cm=board["ancho"],
                board_height_cm=board["alto"],
                utilization=board["utilizacion"],
                svg_path=paths["svg_path"],
                png_path=paths["png_path"],
                placements=board["placements"],
            )
        )
    db.commit()

    # Registrar sobrantes si hay areas grandes (placeholder simplificado)
    # No se implementa automatico en MVP para evitar complejidad excesiva.

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
            "ancho": l.board_width_cm,
            "alto": l.board_height_cm,
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
            "ancho": l.board_width_cm,
            "alto": l.board_height_cm,
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
