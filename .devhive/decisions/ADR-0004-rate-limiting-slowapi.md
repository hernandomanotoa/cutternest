# ADR-0004: Rate limiting con slowapi en endpoints críticos

## Status
Accepted

## Context
El MVP maneja autenticación local y Guest PIN. Sin rate limiting, los endpoints de login, TOTP y Guest PIN son vulnerables a fuerza bruta.

## Decision
- Usar `slowapi` con backend en memoria (`MemoryStorage`) para el MVP.
- Aplicar limitaciones por IP en:
  - `POST /api/v1/auth/login` (5/minuto)
  - `POST /api/v1/auth/verify` (5/minuto)
  - `POST /api/v1/auth/guest` (3/minuto)
  - `POST /api/v1/auth/register` (3/hora)
- Mantener el limitador configurable para reemplazar por Redis en Fase 2.

## Consequences
- Positivo: protección básica contra fuerza bruta sin dependencias externas.
- Positivo: migración a Redis en Fase 2 es transparente.
- Negativo: límites por IP pueden afectar usuarios detrás de NAT corporativo.

## References
- `backend/app/main.py` (limiter y excepciones)
- `backend/app/routers/auth.py`
- `backend/requirements.txt`
