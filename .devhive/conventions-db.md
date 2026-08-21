# Convenciones de base de datos — CutterNest

Stack: SQLite para MVP; PostgreSQL 15 + Redis 7 en Fase 2.

## Estructura y reglas de DDL

- `init.sql` es el schema canónico para PostgreSQL (Fase 2). Para SQLite se usan modelos SQLAlchemy con `create_all` o migraciones Alembic.
- Cualquier script SQL que defina las mismas tablas debe mantenerse alineado o marcarse explícitamente como `LEGACY`.
- No dejar tablas en `init.sql` o modelos que no tengan al menos un consumidor en `backend/app/` o `frontend/src/` (salvo que estén justificadas en un ADR).
- Al renombrar o eliminar una tabla, se debe:
  1. Actualizar o eliminar el servicio que la consume.
  2. Actualizar modelos SQLAlchemy y `init.sql`.
  3. Crear un script de migración idempotente en `scripts/` o Alembic para bases de datos existentes.
  4. Notificar al `knowledge-graph-agent` para actualizar/eliminar el nodo correspondiente.

## Tablas principales (MVP)

- `users` — registro local, username, email (texto), hash de password, secreto TOTP cifrado, backup codes hasheados.
- `sessions` — refresh tokens con expiración y revocación.
- `guest_sessions` — PIN de 4 dígitos, `created_by`, `expires_at`, `used_at`, `revoked_at`.
- `projects` — proyectos de optimización, JSON de piezas/tablas, resultados, cotización.
- `inventory` — tableros y sobrantes (`tipo`, `espesor_mm`, `ancho_mm`, `alto_mm`, `cantidad`, `estado`, `proyecto_origen`, `area_m2`).
- `audit_logs` — acciones relevantes (opcional en MVP, requerido en Fase 2).

## Esquema de permisos / RBAC

- MVP: solo dos modos de usuario — **principal** (todo) y **guest** (funciones limitadas). No hay roles granulados en MVP.
- Fase 2+: si se introduce RBAC, la fuente de verdad es la tabla `roles` en PostgreSQL, con permisos definidos en `backend/app/constants/permissions.py`.
- Los endpoints de admin (backups, reportes completos) requieren flag `is_admin` o rol `ADMIN` en Fase 2.

## Prevención de deuda técnica

### Schema vs código

- Mantener modelos SQLAlchemy y `init.sql` sincronizados. Un cambio en uno debe reflejarse en el otro.
- No dejar modelos/archivos `.py` que no sean importados ni ejecutados.
- Tras una refactorización, eliminar utilidades, servicios y routers que ya no tengan uso.
- Si un archivo se mantiene como referencia, marcarlo explícitamente como `legacy` y documentar por qué.

### Grafo de conocimiento

- El `knowledge-graph-agent` debe detectar nodos sin relaciones de uso (`orphans`) y reportarlos al Guardian.
- Antes de aprobar una tarea que toca schema o servicios, el Guardian debe verificar que no existan componentes huérfanos ni definiciones conflictivas.

## Migración SQLite → PostgreSQL (Fase 2)

- Usar SQLAlchemy async con `create_async_engine("postgresql+asyncpg://...")`.
- Alembic para migraciones de schema.
- El schema de tablas es idéntico al MVP, solo cambia el dialecto.
- Backups automáticos con contenedor `backup` en `./backups/` cada 24h, retención 7 días.
