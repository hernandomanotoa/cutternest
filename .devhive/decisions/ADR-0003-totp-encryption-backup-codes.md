# ADR-0003: Clave de cifrado TOTP separada y códigos de respaldo de un solo uso

## Status
Accepted

## Context
El secreto TOTP debe protegerse incluso si se compromete la base de datos SQLite del MVP. Además, los códigos de respaldo no deben poder reutilizarse.

## Decision
- Separar `TOTP_ENCRYPTION_KEY` de `JWT_SECRET_KEY`.
- Cifrar el secreto TOTP con `cryptography.fernet.Fernet` antes de persistirlo.
- Invalidar un código de respaldo inmediatamente después de su uso exitoso (hash en base de datos marcado como usado).
- Generar códigos de respaldo con `secrets.token_hex` y almacenar su hash con bcrypt.

## Consequences
- Positivo: compromiso de JWT no revela secretos TOTP.
- Positivo: compromiso de base de datos no revela secretos TOTP en claro.
- Positivo: los códigos de respaldo no pueden reutilizarse.
- Negativo: requiere mantener dos secretos distintos en `.env`.

## References
- `backend/app/models.py`
- `backend/app/routers/auth.py`
- `backend/app/config.py`
