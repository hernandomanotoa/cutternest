from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app import auth as auth_service
from app.config import get_settings
from app.database import get_db
from app.dependencies import PrincipalOrGuest, get_current_user, get_current_user_or_guest, get_current_user_or_guest_optional
from app.models import User
from app.limiter import limiter
from app.schemas import (
    GuestLoginRequest,
    GuestPinRequest,
    GuestPinResponse,
    LoginStep1Request,
    LoginStep1Response,
    RegisterResponse,
    TokenResponse,
    UserCreate,
    UserRead,
    VerifyRequest,
)

router = APIRouter()
settings = get_settings()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.jwt_access_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.jwt_refresh_expire_days * 86400,
        path="/api/v1/auth/refresh",
    )


def _set_temp_token_cookie(response: Response, temp_token: str) -> None:
    response.set_cookie(
        key="temp_token",
        value=temp_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=300,
        path="/api/v1/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/", secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh", secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    response.delete_cookie("temp_token", path="/api/v1/auth", secure=settings.cookie_secure, samesite=settings.cookie_samesite)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    return auth_service.register_user(db, payload.username, payload.email, payload.password)


@router.post("/login", response_model=LoginStep1Response)
@limiter.limit("5/minute")
def login(request: Request, response: Response, payload: LoginStep1Request, db: Session = Depends(get_db)):
    temp_token = auth_service.login_step1(db, payload.username, payload.password)
    _set_temp_token_cookie(response, temp_token)
    return LoginStep1Response()


@router.post("/verify", response_model=TokenResponse)
@limiter.limit("5/minute")
def verify(request: Request, response: Response, payload: VerifyRequest, db: Session = Depends(get_db)):
    temp_token = request.cookies.get("temp_token") or payload.temp_token
    if not temp_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token temporal no encontrado")
    user, access_token, refresh_token = auth_service.verify_login(
        db, temp_token, payload.code
    )
    _set_auth_cookies(response, access_token, refresh_token)
    response.delete_cookie("temp_token", path="/api/v1/auth")
    return TokenResponse(
        message="Autenticado",
        expires_in=15 * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("5/minute")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token no encontrado")
    access_token, refresh_token = auth_service.refresh_access_token(db, refresh_token)
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        message="Token refrescado",
        expires_in=15 * 60,
    )


@router.post("/logout")
@limiter.limit("10/minute")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        auth_service.logout(db, refresh_token)
    _clear_auth_cookies(response)
    return {"message": "Sesion cerrada"}


@router.post("/guest/pin", response_model=GuestPinResponse)
@limiter.limit("3/minute")
def guest_pin(
    request: Request,
    payload: GuestPinRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pin, expires_at, project_id = auth_service.generate_guest_pin(db, current_user.id, payload.project_id)
    return GuestPinResponse(pin=pin, expires_at=expires_at, project_id=project_id)


@router.get("/users/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/session")
def get_session(current_user: PrincipalOrGuest | None = Depends(get_current_user_or_guest_optional)):
    if current_user is None:
        return {"mode": None, "user": None, "project_id": None}
    if isinstance(current_user, User):
        return {"mode": "principal", "user": UserRead.model_validate(current_user), "project_id": None}
    return {"mode": "guest", "user": None, "project_id": current_user.project_id}


@router.post("/guest/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def guest_login(request: Request, response: Response, payload: GuestLoginRequest, db: Session = Depends(get_db)):
    guest, access_token = auth_service.login_guest(db, payload.pin)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.guest_session_hours * 3600,
        path="/",
    )
    return TokenResponse(
        message="Sesion de invitado iniciada",
        expires_in=settings.guest_session_hours * 3600,
    )
