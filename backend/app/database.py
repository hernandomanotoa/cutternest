from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from app.config import get_settings

settings = get_settings()

# Asegurar que el directorio de la BD SQLite exista antes de conectar
db_path = urlparse(settings.database_url).path
if db_path:
    Path(db_path).resolve().parent.mkdir(parents=True, exist_ok=True)

# SQLAlchemy 2.0 con SQLite sincrono. El path debe ser absoluto dentro del contenedor.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Regla para forzar foreign keys en SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
