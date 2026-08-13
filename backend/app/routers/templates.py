from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user_or_guest
from app.schemas import TemplateGenerateRequest, TemplateRead
from app.templates import generate_template, list_templates

router = APIRouter()


@router.get("", response_model=List[TemplateRead])
def list_templates_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return list_templates()


@router.post("/{template_id}/generate")
def generate_template_endpoint(
    template_id: str,
    payload: TemplateGenerateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_guest),
):
    return {"piezas": generate_template(template_id, payload.model_dump(exclude_unset=True))}
