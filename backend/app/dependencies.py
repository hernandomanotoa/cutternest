from datetime import datetime
from typing import Union

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import GuestSession, Project, Session as UserSession, User
from app.security import decode_token

security = HTTPBearer(auto_error=False)
settings = get_settings()

PrincipalOrGuest = Union[User, GuestSession]


def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    """Extrae el token de la cookie httpOnly o del header Authorization."""
    token = request.cookies.get("access_token")
    if token:
        return token
    if credentials:
        return credentials.credentials
    return None


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(request, credentials)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es access token")

    if payload.get("mode") != "principal":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Requiere usuario principal")

    user = db.query(User).filter(User.id == payload["sub"], User.is_active == True).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    return user


def get_current_user_or_guest_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> PrincipalOrGuest | None:
    """Devuelve el usuario/guest actual o None si no hay sesion. No lanza 401."""
    token = _extract_token(request, credentials)
    if token is None:
        return None
    try:
        payload = decode_token(token)
    except (ExpiredSignatureError, ValueError):
        return None

    if payload.get("type") != "access":
        return None

    mode = payload.get("mode")
    if mode == "guest":
        guest = (
            db.query(GuestSession)
            .filter(GuestSession.id == payload["sub"], GuestSession.revoked_at.is_(None))
            .first()
        )
        if not guest or guest.expires_at < datetime.utcnow():
            return None
        return guest

    user = db.query(User).filter(User.id == payload["sub"], User.is_active == True).first()
    if user is None:
        return None
    return user


def get_current_user_or_guest(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> PrincipalOrGuest:
    """Requiere una sesion principal o guest valida; lanza 401 si no hay."""
    user = get_current_user_or_guest_optional(request, credentials, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")
    return user


def require_project_owner(db: Session, project_id: str, user: User) -> Project:
    """Verifica que el usuario principal sea propietario del proyecto."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para acceder a este proyecto")
    return project
