from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth as auth_service
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import (
    GuestLoginRequest,
    GuestPinRequest,
    GuestPinResponse,
    LoginStep1Request,
    LoginStep1Response,
    RefreshRequest,
    RegisterResponse,
    TokenResponse,
    UserCreate,
    UserRead,
    VerifyRequest,
)

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    return auth_service.register_user(db, payload.username, payload.email, payload.password)


@router.post("/login", response_model=LoginStep1Response)
def login(payload: LoginStep1Request, db: Session = Depends(get_db)):
    temp_token = auth_service.login_step1(db, payload.username, payload.password)
    return LoginStep1Response(temp_token=temp_token)


@router.post("/verify", response_model=TokenResponse)
def verify(payload: VerifyRequest, db: Session = Depends(get_db)):
    user, access_token, refresh_token = auth_service.verify_login(
        db, payload.temp_token, payload.code
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=15 * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    access_token, refresh_token = auth_service.refresh_access_token(db, payload.refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=15 * 60,
    )


@router.post("/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, payload.refresh_token)
    return {"message": "Sesion cerrada"}


@router.post("/guest/pin", response_model=GuestPinResponse)
def guest_pin(
    _: GuestPinRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pin, expires_at = auth_service.generate_guest_pin(db, current_user.id)
    return GuestPinResponse(pin=pin, expires_at=expires_at)


@router.get("/users/me", response_model=UserRead)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/guest/login", response_model=TokenResponse)
def guest_login(payload: GuestLoginRequest, db: Session = Depends(get_db)):
    guest, access_token = auth_service.login_guest(db, payload.pin)
    return TokenResponse(
        access_token=access_token,
        refresh_token="",
        expires_in=4 * 60 * 60,
    )
