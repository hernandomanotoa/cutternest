# ADR-0001: Uso de PyJWT con secretos obligatorios para autenticación

## Status
Accepted

## Context
El MVP de CutterNest requiere autenticación local (TOTP + Guest PIN) sin depender de servicios externos. El código inicial usaba una librería de JWT con defaults inseguros y permitía omitir `JWT_SECRET_KEY` en entorno local.

## Decision
- Migrar toda la generación/validación de tokens a `PyJWT` (`jwt`).
- Eliminar defaults inseguros en `Settings`: `JWT_SECRET_KEY` y `TOTP_ENCRYPTION_KEY` son obligatorios.
- Levantar la aplicación con `raise ValueError` en `config.py` si falta alguna variable sensible.
- Usar algoritmo `HS256` con access token de 15 minutos y refresh token de 7 días.

## Consequences
- Positivo: no hay modo "dev inseguro" accidental; los secretos deben configurarse explícitamente.
- Positivo: alineado con estándar de facto de Python.
- Negativo: requiere actualizar `.env` en todos los entornos.

## References
- `backend/app/config.py`
- `backend/app/dependencies.py`
- `backend/app/routers/auth.py`
- `AGENTS.md` sección 5 (reglas de seguridad)
