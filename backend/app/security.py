import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

import pyotp
import qrcode
import qrcode.image.pil
import bcrypt
from cryptography.fernet import Fernet, InvalidToken
import jwt

from app.config import get_settings

settings = get_settings()
BCRYPT_ROUNDS = 12


def _normalize_hash(hash_prefix: str) -> str:
    """Normaliza el prefijo del hash para bcrypt puro ($2y$ -> $2b$)."""
    if hash_prefix.startswith("$2y$"):
        return "$2b$" + hash_prefix[len("$2y$"):]
    return hash_prefix


def _derive_fernet_key(secret: str) -> bytes:
    """Deriva una clave Fernet (32 bytes url-safe base64) a partir del JWT secret."""
    import base64
    import hashlib

    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Fernet:
    return Fernet(_derive_fernet_key(settings.totp_encryption_key))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), _normalize_hash(hashed).encode("utf-8"))
    except ValueError:
        return False


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_totp_secret(secret: str) -> str:
    return get_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_totp_secret(encrypted: str) -> str:
    return get_fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")


def generate_qr_base64(username: str, secret: str) -> str:
    issuer = "CutterNest"
    uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)
    img = qrcode.make(uri, image_factory=qrcode.image.pil.PilImage)
    from io import BytesIO

    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    import base64

    return base64.b64encode(buffer.read()).decode("utf-8")


def verify_totp_code(encrypted_secret: str, code: str) -> bool:
    try:
        secret = decrypt_totp_secret(encrypted_secret)
    except InvalidToken:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_backup_codes(count: int = 10) -> List[str]:
    """Genera códigos de backup planos. Devuelve una lista de strings."""
    codes = []
    for _ in range(count):
        code = secrets.token_hex(4).upper()[:8]
        codes.append(code)
    return codes


def verify_backup_code(backup_codes: list, code: str):
    """Busca un código de backup no usado que coincida con el hash.
    
    Devuelve el objeto BackupCode si coincide y no está usado, o None.
    """
    for bc in backup_codes:
        if bc.used_at is None and verify_password(code, bc.code_hash):
            return bc
    return None


def create_token(subject: str, token_type: str, expires_delta: timedelta, extra: dict) -> str:
    now = datetime.utcnow()
    expire = now + expires_delta
    jti = secrets.token_urlsafe(16)
    payload = {
        "sub": subject,
        "type": token_type,
        "exp": expire,
        "iat": now,
        "jti": jti,
    }
    payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise e
    except jwt.InvalidTokenError:
        raise ValueError("Token invalido")


def create_access_token(user_id: str, mode: str = "principal") -> Tuple[str, str, datetime]:
    delta = timedelta(minutes=settings.jwt_access_expire_minutes)
    jti = secrets.token_urlsafe(16)
    token = create_token(user_id, "access", delta, {"mode": mode, "jti": jti})
    return token, jti, datetime.utcnow() + delta


def create_refresh_token(session_id: str, user_id: str, mode: str = "principal") -> Tuple[str, str, datetime]:
    delta = timedelta(days=settings.jwt_refresh_expire_days)
    jti = secrets.token_urlsafe(16)
    token = create_token(session_id, "refresh", delta, {"mode": mode, "jti": jti, "user_id": user_id})
    return token, jti, datetime.utcnow() + delta


def create_temp_token(user_id: str) -> str:
    delta = timedelta(minutes=5)
    return create_token(user_id, "temp", delta, {})


def hash_token(token: str) -> str:
    return hash_password(token)
