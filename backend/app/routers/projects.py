from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import assembly as assembly_service
from app import projects as projects_service
from app.database import get_db
from app.dependencies import (
    PrincipalOrGuest,
    get_current_user,
    get_current_user_or_guest,
    require_project_owner,
)
from app.limiter import limiter
from app.models import User
from app.schemas import (
    AssemblyProgressUpdate,
    AssemblyResponse,
    AssemblyStepValidation,
    OptimizeRequest,
    ProjectCreate,
    ProjectRead,
    QuoteRequest,
)


router = APIRouter()


@router.get("", response_model=List[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user: PrincipalOrGuest = Depends(get_current_user_or_guest),
):
    if isinstance(current_user, User):
        return projects_service.list_projects(db, owner=current_user)
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
    current_user: User = Depends(get_current_user),
):
    return require_project_owner(db, project_id, current_user)


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


@router.get("/{project_id}/layouts")
def list_layouts(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.get_layouts(db, project_id)


@router.post("/{project_id}/quote")
def create_quote(
    project_id: str,
    payload: QuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.create_quote(db, project_id, payload)


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
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.get_assembly(db, project_id)


@router.post("/{project_id}/assembly/generate", response_model=AssemblyResponse)
def generate_assembly(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return projects_service.generate_assembly(db, project_id)


@router.post("/{project_id}/assembly/steps/{step_id}/validate")
def validate_assembly_step(
    project_id: str,
    step_id: str,
    payload: AssemblyStepValidation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
    return assembly_service.validate_step(db, step_id, payload.piece_transforms)


@router.post("/{project_id}/assembly/steps/{step_id}/progress")
def update_assembly_progress(
    project_id: str,
    step_id: str,
    payload: AssemblyProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_owner(db, project_id, current_user)
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
