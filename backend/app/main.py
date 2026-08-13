from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from pathlib import Path

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy import text

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.limiter import limiter
from app.models import BackupCode
from app.routers import auth, optimizer, inventory, projects, templates

settings = get_settings()

EXPORTS_DIR = Path('/app/data/exports')
BACKUPS_DIR = Path('/app/backups')
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


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


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(optimizer.router, prefix='/api/v1', tags=['optimizer'])
app.include_router(inventory.router, prefix='/api/v1/inventory', tags=['inventory'])
app.include_router(projects.router, prefix='/api/v1/projects', tags=['projects'])
app.include_router(templates.router, prefix='/api/v1/templates', tags=['templates'])
app.mount('/exports', StaticFiles(directory='/app/data/exports'), name='exports')
