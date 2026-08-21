from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import catalog as catalog_service
from app.database import get_db
from app.dependencies import get_current_user_or_guest
from app.schemas import HardwareTemplate

router = APIRouter()


@router.get("/hardware-templates", response_model=List[HardwareTemplate])
def list_hardware_templates(current_user=Depends(get_current_user_or_guest)):
    return catalog_service.list_hardware_templates()
