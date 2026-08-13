# Convenciones de autenticación y seguridad — CutterNest

## Métodos de autenticación

- **MVP**: solo autenticación local.
  - Registro: username + password + email (email solo como campo de texto, **sin envío de correos**).
  - TOTP: `pyotp` genera secreto Base32; mostrar QR en pantalla como PNG base64 (provisioning URI).
  - Login: username/password → pantalla de código TOTP (6 dígitos) o backup code → JWT access + refresh tokens.
  - Guest PIN: 4 dígitos generados por usuario principal, mostrados en pantalla, expiran en 5 minutos si no se usan; sesión de 4 horas con claim `mode: "guest"`.
- **No incluir en MVP**:
  - ❌ Email SMTP (verificación, notificaciones, recuperación de password).
  - ❌ SMS (Twilio o gateway propio).
  - ❌ WhatsApp (Baileys, notificaciones a clientes, registro por WA).
  - ❌ OAuth / LDAP / SAML.
  - ❌ Recuperación de password por email → usar backup codes o contactar admin.
- **Fase 4+**: WhatsApp/SMS como notificaciones y OTP fallback, pero nunca como único factor de autenticación.

## JWT y tokens

- `JWT_SECRET_KEY`: solo en `.env`, nunca en código (mínimo 32 caracteres).
- Access token: 15 minutos. Refresh token: 7 días, guardado en tabla `sessions`.
- Logout: borrar refresh token de la base de datos (blacklist simple en SQLite; en Fase 2, agregar también a Redis).
- Header `Authorization: Bearer <token>` para access token.
- Nunca devolver tokens en body de respuesta como práctica principal; usar cookies httpOnly si el frontend y backend lo acuerdan, pero el header Bearer es el contrato mínimo en MVP.
- No almacenar tokens en `localStorage` del frontend.

## Cookies y almacenamiento frontend

- Si se usan cookies, `accessToken` debe ser `httpOnly`, `secure` en producción y `sameSite` adecuado.
- El frontend no lee tokens de respuesta JSON para almacenarlos.
- Datos de sesión guest no sensibles (proyectos temporales) pueden usar `localStorage` con cuidado.

## Rate limiting y protección de endpoints

- MVP: rate limit básico por IP en memoria o SQLite para login y Guest PIN.
- Fase 2: rate limit por IP + por usuario en Redis:
  - Máximo 5 intentos de login por IP cada 15 minutos.
  - Máximo 3 intentos de PIN incorrecto por sesión temporal; bloquear 15 minutos.
  - Máximo 1 OTP por minuto por método si se habilita Fase 4.
- Middleware de auth en `backend/app/auth.py` verifica JWT y modo guest.

## TOTP y cifrado

- Secreto TOTP: cifrar con AES-256-GCM o al menos hashear en Fase 2; en MVP puede almacenarse cifrado con clave derivada de `JWT_SECRET_KEY` o una `TOTP_ENCRYPTION_KEY` separada en `.env`.
- Backup codes: 10 códigos generados con alta entropía, hasheados con bcrypt, mostrados una sola vez en registro. Verificación atomizada: al usar uno, marcarlo como usado y no permitir reutilización.
- Passwords: hashear con `bcrypt` o `argon2`.
- Guest PIN: generar con `secrets.randbelow(10000)` formateado a 4 dígitos. Guardar hash en `guest_sessions` con expiración.

## Variables sensibles (resumen)

- Nunca hardcodear ni loggear: `JWT_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`, contraseñas, tokens, secrets, PINs, backup codes.
- Usar `backend/app/config.py` (Pydantic Settings) como único punto de acceso a env vars.

## Referencias técnicas

- Backend: [conventions-backend.md](./conventions-backend.md)
- Frontend: [conventions-frontend.md](./conventions-frontend.md)
- Base de datos / RBAC: [conventions-db.md](./conventions-db.md)
