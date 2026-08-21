import secrets
import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import BackupCode, GuestSession, Session as UserSession, User
from app.schemas import RegisterResponse, UserRead
from app.security import (
    create_access_token,
    create_refresh_token,
    create_temp_token,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_qr_base64,
    generate_totp_secret,
    hash_password,
    hash_token,
    verify_backup_code,
    verify_password,
    verify_totp_code,
)

settings = get_settings()


def register_user(
    db: Session, username: str, email: str, password: str
) -> RegisterResponse:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario ya existe",
        )

    is_first_user = db.query(User).first() is None
    totp_secret = generate_totp_secret()
    plain_codes = generate_backup_codes(10)

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        totp_secret_encrypted=encrypt_totp_secret(totp_secret),
        role="admin" if is_first_user else "principal",
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    for plain in plain_codes:
        db.add(BackupCode(user_id=user.id, code_hash=hash_password(plain)))
    db.commit()

    qr_base64 = generate_qr_base64(username, totp_secret)
    return RegisterResponse(
        user=UserRead.model_validate(user),
        qr_base64=f"data:image/png;base64,{qr_base64}",
        backup_codes=plain_codes,
    )


def login_step1(db: Session, username: str, password: str) -> str:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales invalidas",
        )
    return create_temp_token(user.id)


def verify_login(
    db: Session, temp_token: str, code: str
) -> Tuple[User, str, str]:
    from app.security import decode_token

    try:
        payload = decode_token(temp_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token temporal invalido",
        )

    if payload.get("type") != "temp":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token temporal invalido",
        )

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )

    used_backup_code = None
    if not verify_totp_code(user.totp_secret_encrypted, code):
        used_backup_code = verify_backup_code(user.backup_codes, code)
        if not used_backup_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Codigo TOTP o backup invalido",
            )

    user.is_active = True
    db.add(user)

    access_token, access_jti, access_exp = create_access_token(user.id, mode="principal")

    session_id = str(uuid.uuid4())
    new_session = UserSession(
        id=session_id,
        user_id=user.id,
        refresh_token_hash="",
        expires_at=datetime.utcnow() + timedelta(days=settings.jwt_refresh_expire_days),
    )
    db.add(new_session)
    db.flush()

    refresh_token, refresh_jti, refresh_exp = create_refresh_token(
        session_id=session_id, user_id=user.id, mode="principal"
    )
    new_session.refresh_token_hash = hash_token(refresh_token)
    new_session.expires_at = refresh_exp

    if used_backup_code:
        used_backup_code.used_at = datetime.utcnow()

    db.commit()
    return user, access_token, refresh_token


def refresh_access_token(db: Session, refresh_token: str) -> Tuple[str, str]:
    from app.security import decode_token

    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido",
        )

    session = (
        db.query(UserSession)
        .filter(
            UserSession.id == payload["sub"],
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion no encontrada o expirada",
        )

    if not verify_password(refresh_token, session.refresh_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido",
        )

    # Rotacion: revocar la sesion actual y crear una nueva
    session.revoked_at = datetime.utcnow()

    access_token, _, _ = create_access_token(session.user_id, mode="principal")

    new_session_id = str(uuid.uuid4())
    new_session = UserSession(
        id=new_session_id,
        user_id=session.user_id,
        refresh_token_hash="",
        expires_at=datetime.utcnow() + timedelta(days=settings.jwt_refresh_expire_days),
    )
    db.add(new_session)
    db.flush()

    new_refresh_token, _, new_exp = create_refresh_token(
        session_id=new_session_id, user_id=session.user_id, mode="principal"
    )
    new_session.refresh_token_hash = hash_token(new_refresh_token)
    new_session.expires_at = new_exp
    db.commit()
    return access_token, new_refresh_token


def logout(db: Session, refresh_token: str) -> None:
    from app.security import decode_token

    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido",
        )

    session = (
        db.query(UserSession)
        .filter(
            UserSession.id == payload["sub"],
            UserSession.revoked_at.is_(None),
        )
        .first()
    )
    if session and verify_password(refresh_token, session.refresh_token_hash):
        session.revoked_at = datetime.utcnow()
        db.commit()


def generate_guest_pin(
    db: Session,
    user_id: str,
    project_id: Optional[str] = None,
) -> Tuple[str, datetime, Optional[str]]:
    if project_id:
        from app.models import Project

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or project.owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para compartir este proyecto",
            )

    pin = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=5)
    guest = GuestSession(
        pin_hash=hash_password(pin),
        project_id=project_id,
        created_by=user_id,
        expires_at=expires_at,
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return pin, expires_at, project_id


def login_guest(db: Session, pin: str) -> Tuple[GuestSession, str]:
    now = datetime.utcnow()
    candidates = (
        db.query(GuestSession)
        .filter(
            GuestSession.used_at.is_(None),
            GuestSession.revoked_at.is_(None),
            GuestSession.expires_at > now,
        )
        .all()
    )
    guest = None
    for candidate in candidates:
        if verify_password(pin, candidate.pin_hash):
            guest = candidate
            break
    if not guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN invalido o expirado",
        )

    guest.used_at = now
    guest.expires_at = now + timedelta(hours=settings.guest_session_hours)
    db.commit()
    db.refresh(guest)

    access_token, _, _ = create_access_token(guest.id, mode="guest")
    return guest, access_token


def revoke_guest_session(db: Session, guest_id: str, user_id: str) -> None:
    guest = (
        db.query(GuestSession)
        .filter(GuestSession.id == guest_id, GuestSession.created_by == user_id)
        .first()
    )
    if guest:
        guest.revoked_at = datetime.utcnow()
        db.commit()
