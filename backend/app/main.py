from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from pathlib import Path
import re

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.limiter import limiter
from app.models import BackupCode, Base
from app.routers import assembly_planner, auth, catalog, optimizer, inventory, projects, quotes, templates

settings = get_settings()

EXPORTS_DIR = Path('/app/data/exports')
BACKUPS_DIR = Path('/app/backups')
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

MAX_PAYLOAD_SIZE = 1_000_000  # 1 MB


class PayloadSizeMiddleware(BaseHTTPMiddleware):
    """Rechaza cuerpos de petición mayores a 1 MB."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_PAYLOAD_SIZE:
            return JSONResponse(
                status_code=413,
                content={
                    "detail": "Payload demasiado grande",
                    "code": "PAYLOAD_TOO_LARGE",
                    "status": 413,
                },
            )
        return await call_next(request)


def _derive_error_code(detail):
    """Intenta asignar un código legible al error; fallback a versión normalizada."""
    if not isinstance(detail, str):
        return "ERROR"

    mapping = [
        ("PIECE_TOO_LARGE", "PIECE_TOO_LARGE"),
        ("Payload demasiado grande", "PAYLOAD_TOO_LARGE"),
        ("Credenciales", "CREDENTIALS_INVALID"),
        ("Token", "TOKEN_INVALID"),
        ("PIN invalido", "GUEST_PIN_INVALID"),
        ("Proyecto no encontrado", "PROJECT_NOT_FOUND"),
        ("No tienes permiso", "FORBIDDEN"),
        ("Codigo TOTP o backup invalido", "TOTP_INVALID"),
        ("Material no encontrado", "MATERIAL_NOT_FOUND"),
        ("Stock insuficiente", "INSUFFICIENT_STOCK"),
        ("El nombre de usuario ya existe", "USERNAME_EXISTS"),
        ("El proyecto no tiene piezas", "NO_PIECES"),
        ("Paso no encontrado", "STEP_NOT_FOUND"),
    ]
    for needle, code in mapping:
        if needle in detail:
            return code
    normalized = re.sub(r"[^a-zA-Z0-9 ]+", "", detail).upper().replace(" ", "_")
    return normalized[:64] if normalized else "ERROR"


def _http_exception_handler(request: Request, exc: HTTPException):
    code = _derive_error_code(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": code, "status": exc.status_code},
    )


def _validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in e.get('loc', []))}: {e.get('msg', '')}"
        for e in errors
    )
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "code": "VALIDATION_ERROR", "status": 422},
    )


def _migrate_backup_codes() -> None:
    """Migra codigos de backup del formato JSON antiguo a la tabla backup_codes."""
    db = SessionLocal()
    try:
        if db.query(BackupCode).first():
            return
        try:
            rows = db.execute(text("SELECT id, backup_codes_hash FROM users WHERE backup_codes_hash IS NOT NULL"))
        except Exception:
            # Columna o tabla antigua no existe; nada que migrar.
            return
        for row in rows:
            codes = row.backup_codes_hash
            if isinstance(codes, list):
                for hashed in codes:
                    db.add(BackupCode(user_id=row.id, code_hash=hashed))
        db.commit()
    finally:
        db.close()


def _default_for_column(col) -> str:
    """Devuelve un valor SQL literal por defecto para una columna de SQLAlchemy."""
    import json

    if col.default is not None:
        arg = col.default.arg
        if callable(arg):
            arg = None
        if arg is not None:
            if isinstance(arg, bool):
                return "1" if arg else "0"
            if isinstance(arg, (int, float)):
                return str(arg)
            if isinstance(arg, (list, dict)):
                return json.dumps(arg, ensure_ascii=False)
            return f"'{arg}'"
    if col.server_default is not None:
        arg = col.server_default.arg
        if isinstance(arg, str):
            return arg.replace("'", "''")
    if col.nullable:
        return "NULL"
    # Fallbacks segun tipo
    if str(col.type) == "BOOLEAN":
        return "0"
    if "JSON" in str(col.type):
        return "'[]'" if "list" in str(col.type).lower() else "'{}'"
    if "FLOAT" in str(col.type).upper() or "INTEGER" in str(col.type).upper():
        return "0"
    return "''"


def _migrate_schema() -> None:
    """Aplica migraciones menores para mantener el esquema SQLite al dia."""
    db = SessionLocal()
    try:
        conn = db.connection()
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        existing_tables = {row[0] for row in result}

        # 1. Añadir columnas faltantes
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            pragma = conn.execute(text(f"PRAGMA table_info({table.name})"))
            existing_cols = {row[1] for row in pragma}
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                default_value = _default_for_column(col)
                sql_type = str(col.type)
                # SQLite acepta tipos como VARCHAR(255), FLOAT, BOOLEAN, JSON, TEXT
                sql = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {sql_type} DEFAULT {default_value}"
                conn.execute(text(sql))

        # 2. Normalizar valores de enums obsoletos
        conn.execute(text("UPDATE users SET role = 'principal' WHERE role NOT IN ('admin', 'principal')"))
        conn.execute(text("UPDATE inventory SET estado = 'nuevo' WHERE estado NOT IN ('nuevo', 'sobrante', 'danado')"))

        # 3. Recrear tabla guest_sessions si aun usa el esquema antiguo
        if "guest_sessions" in existing_tables:
            pragma = conn.execute(text("PRAGMA table_info(guest_sessions)"))
            guest_cols = {row[1] for row in pragma}
            if "pin_hash" not in guest_cols:
                conn.execute(text("DROP TABLE guest_sessions"))

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _migrate_schema()
    init_db()
    _migrate_backup_codes()
    yield


app = FastAPI(
    title='CutterNest API',
    description='Sistema de optimizacion de cortes para muebles',
    version='1.0.0',
    lifespan=lifespan
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(HTTPException, _http_exception_handler)
app.add_exception_handler(RequestValidationError, _validation_exception_handler)

app.add_middleware(PayloadSizeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.get('/api/v1/health')
async def health_check():
    return {'status': 'ok', 'version': '1.0.0'}

app.include_router(auth.router, prefix='/api/v1/auth', tags=['auth'])
app.include_router(catalog.router, prefix='/api/v1', tags=['catalog'])
app.include_router(optimizer.router, prefix='/api/v1', tags=['optimizer'])
app.include_router(inventory.router, prefix='/api/v1/inventory', tags=['inventory'])
app.include_router(projects.router, prefix='/api/v1/projects', tags=['projects'])
app.include_router(quotes.router, prefix='/api/v1/quotes', tags=['quotes'])
app.include_router(templates.router, prefix='/api/v1/templates', tags=['templates'])
app.include_router(assembly_planner.router, prefix='/api/v1/assembly-planner', tags=['assembly-planner'])
app.mount('/exports', StaticFiles(directory='/app/data/exports'), name='exports')
