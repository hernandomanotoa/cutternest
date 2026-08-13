from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import projects as projects_service
from app.database import get_db
from app.dependencies import get_current_user, get_current_user_or_guest
from app.models import User
from app.schemas import (
    AssemblyResponse,
    OptimizeRequest,
    ProjectCreate,
    ProjectRead,
    QuoteRequest,
)


router = APIRouter()


@router.get("", response_model=List[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    if hasattr(current_user, "role"):
        return projects_service.list_projects(db, owner=current_user)
    return []


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    owner = current_user if hasattr(current_user, "role") else None
    return projects_service.create_project(db, payload, owner=owner)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.get_project(db, project_id)


@router.post("/{project_id}/optimize")
def optimize_project(
    project_id: str,
    payload: OptimizeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.optimize_project(db, project_id, payload)


@router.get("/{project_id}/layouts")
def list_layouts(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.get_layouts(db, project_id)


@router.post("/{project_id}/quote")
def create_quote(
    project_id: str,
    payload: QuoteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.create_quote(db, project_id, payload)


@router.post("/{project_id}/cutlist")
def generate_cutlist(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    path = projects_service.generate_cutlist(db, project_id)
    return {"pdf_path": path}


@router.post("/{project_id}/labels")
def generate_labels(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    path = projects_service.generate_labels(db, project_id)
    return {"pdf_path": path}


@router.get("/{project_id}/assembly", response_model=AssemblyResponse)
def get_assembly(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return projects_service.get_assembly(db, project_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    projects_service.delete_project(db, project_id)
    return None
