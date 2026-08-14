from fastapi import APIRouter, Depends

from app import catalog as catalog_service
from app.dependencies import get_current_user_or_guest

router = APIRouter()


@router.get("/catalog")
def get_catalog(current_user=Depends(get_current_user_or_guest)):
    """Catálogo de materiales, formatos de placa y colores (guía melamínicos Ecuador)."""
    return catalog_service.get_catalog()
