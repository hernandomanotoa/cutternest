# ADR-0002: Entrega de tokens vía cookies httpOnly

## Status
Accepted

## Context
El frontend de CutterNest no debe almacenar tokens en `localStorage` por riesgo de XSS. El flujo incluye access token, refresh token y un `temp_token` intermedio durante TOTP.

## Decision
- Todos los tokens se entregan y consumen como cookies `httpOnly`.
- `temp_token` (válido 5 minutos) también usa cookie `httpOnly` con `path=/api/v1/auth`.
- El frontend lee el estado de sesión únicamente del endpoint `GET /api/v1/auth/session`.
- Atributos `Secure` y `SameSite` son configurables vía `.env` (`COOKIE_SECURE`, `COOKIE_SAMESITE`).

## Consequences
- Positivo: mitigación de XSS sobre tokens de sesión.
- Positivo: flujo TOTP intermedio no expone secreto en storage del navegador.
- Negativo: el frontend debe manejar errores 401/403 y redirigir sin depender de `localStorage`.

## References
- `backend/app/routers/auth.py` (funciones `_set_*_cookie`)
- `frontend/src/hooks/useAuth.ts`
- `backend/app/dependencies.py`
