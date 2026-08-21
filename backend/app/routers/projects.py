from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import assembly as assembly_service
from app import catalog as catalog_service
from app import projects as projects_service
from app import quotes as quotes_service
from app.database import get_db
from app.dependencies import (
    PrincipalOrGuest,
    get_current_user,
    get_current_user_or_guest,
    get_current_user_or_guest_optional,
    require_project_access,
    require_project_owner,
)
from app.limiter import limiter
from app.models import GuestSession, Layout, Piece, User
from app.schemas import (
    AssemblyPlanRequest,
    AssemblyPlanResponse,
    AssemblyProgressUpdate,
    AssemblyResponse,
    AssemblyStepValidation,
    HardwareTemplate,
    OptimizeRequest,
    PiecesUpdateRequest,
    ProjectCreate,
    ProjectRead,
    QuoteRead,
    QuoteRequest,
)
from app import svg_generator


router = APIRouter()


@router.get("", response_model=List[ProjectRead])
def list_projects(
    query: Optional[str] = None,
    status: Optional[str] = None,
    material_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    if isinstance(current_user, User):
        return projects_service.list_projects(
            db,
            owner=current_user,
            query=query,
            status=status,
            material_type=material_type,
        )
    if isinstance(current_user, GuestSession) and current_user.project_id:
        project = projects_service.get_project(db, current_user.project_id)
        return [ProjectRead.model_validate(project)]
    return []


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return projects_service.create_project(db, payload, owner=current_user)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return projects_service.get_project(db, project_id)


@router.post("/{project_id}/optimize")
@limiter.limit("10/minute")
def optimize_project(
    request: Request,
    project_id: str,
    payload: OptimizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.optimize_project(db, project_id, payload)


@router.post("/{project_id}/pieces", response_model=AssemblyResponse)
def update_pieces(
    project_id: str,
    payload: PiecesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.save_pieces(db, project_id, [p.model_dump() for p in payload.piezas])


@router.get("/{project_id}/layouts")
def list_layouts(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return projects_service.get_layouts(db, project_id)


@router.get("/{project_id}/layouts/{layout_index}/png")
def get_layout_png(
    project_id: str,
    layout_index: int,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    import os

    require_project_access(db, project_id, current_user)
    layouts = projects_service.get_layouts(db, project_id)
    layout = next((l for l in layouts if l.board_index == layout_index), None)
    if not layout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Layout no encontrado")

    exports_dir = "/app/data/exports"
    os.makedirs(exports_dir, exist_ok=True)
    png_path = os.path.join(exports_dir, f"layout_{layout_index}.png")

    if not os.path.exists(png_path):
        board = {
            "ancho": layout.board_width_mm,
            "alto": layout.board_height_mm,
            "placements": layout.placements,
        }
        svg_generator.save_png(board, png_path, width=1200)

    return StreamingResponse(open(png_path, "rb"), media_type="image/png")


@router.post("/{project_id}/quote")
def create_quote(
    project_id: str,
    payload: QuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.create_quote(db, project_id, payload)


@router.get("/{project_id}/quotes", response_model=List[QuoteRead])
def list_project_quotes(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return quotes_service.list_quotes(db, project_id)


@router.post("/{project_id}/cutlist")
def generate_cutlist(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    path = projects_service.generate_cutlist(db, project_id)
    return {"pdf_path": path}


@router.post("/{project_id}/labels")
def generate_labels(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    path = projects_service.generate_labels(db, project_id)
    return {"pdf_path": path}


@router.get("/{project_id}/assembly", response_model=AssemblyResponse)
def get_assembly(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return projects_service.get_assembly(db, project_id)


@router.post("/{project_id}/assembly/generate", response_model=AssemblyResponse)
def generate_assembly(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.generate_assembly(db, project_id)


def _normalize_dependencies(deps: List[Any]) -> List[List[str]]:
    if not deps:
        return []
    if isinstance(deps[0], dict):
        return [[e["from"], e["to"]] for e in deps]
    return deps


@router.post("/{project_id}/assembly/plan", response_model=AssemblyPlanResponse)
def plan_assembly(
    project_id: str,
    payload: AssemblyPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
    if not pieces:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proyecto no tiene piezas",
        )

    dep_tuples = [(f, t) for f, t in payload.dependencies]
    if payload.save:
        result = assembly_service.AssemblyEngine.save_plan(db, project_id, dep_tuples)
    else:
        result = assembly_service.AssemblyEngine.build_assembly(
            project_id, pieces, dependencies=dep_tuples
        )

    cycle = result.get("cycle")
    if cycle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"cycle": cycle},
        )

    return AssemblyPlanResponse(
        dependencies=_normalize_dependencies(result["dependencies"]),
        levels=result["levels"],
        min_steps=len(result["steps"]),
        steps=result["steps"],
    )


@router.post("/{project_id}/assembly/pdf")
def generate_assembly_manual_pdf(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    path = projects_service.generate_assembly_pdf(db, project_id)
    return {"pdf_path": path}


@router.get("/{project_id}/progress")
def get_project_progress(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return projects_service.project_progress(db, project_id)


@router.post("/{project_id}/assembly/steps/{step_id}/validate")
def validate_assembly_step(
    project_id: str,
    step_id: str,
    payload: AssemblyStepValidation,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return assembly_service.validate_step(db, step_id, payload.piece_transforms)


@router.post("/{project_id}/assembly/steps/{step_id}/progress")
def update_assembly_progress(
    project_id: str,
    step_id: str,
    payload: AssemblyProgressUpdate,
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    require_project_access(db, project_id, current_user)
    return assembly_service.update_progress(db, step_id, payload)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    projects_service.delete_project(db, project_id)
    return None
