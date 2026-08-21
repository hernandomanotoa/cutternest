from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import create_engine, event, text
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


# Migraciones de dimensiones: todas las columnas de longitud pasan a milímetros.
_DIMENSION_MIGRATIONS: list[tuple[str, list[tuple[str, str]]]] = [
    ("projects", [("board_width_cm", "board_width_mm"), ("board_height_cm", "board_height_mm")]),
    ("pieces", [("width_cm", "width_mm"), ("height_cm", "height_mm")]),
    ("layouts", [("board_width_cm", "board_width_mm"), ("board_height_cm", "board_height_mm")]),
    ("inventory", [("ancho_cm", "ancho_mm"), ("alto_cm", "alto_mm")]),
]


def _table_has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(row[1] == column for row in rows)


def _migrate_dimension_columns(engine) -> None:
    """Renombra columnas *_cm a *_mm y multiplica por 10 sin perder datos."""
    with engine.connect() as conn:
        for table, pairs in _DIMENSION_MIGRATIONS:
            for old_col, new_col in pairs:
                has_old = _table_has_column(conn, table, old_col)
                has_new = _table_has_column(conn, table, new_col)
                if not has_old and not has_new:
                    continue
                if has_old and not has_new:
                    conn.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {new_col} FLOAT")
                    )
                    conn.execute(
                        text(f"UPDATE {table} SET {new_col} = {old_col} * 10")
                    )
                    conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {old_col}"))
                elif has_old and has_new:
                    conn.execute(
                        text(f"UPDATE {table} SET {new_col} = {old_col} * 10 WHERE {new_col} IS NULL")
                    )
                    conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {old_col}"))
        conn.commit()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_dimension_columns(engine)
