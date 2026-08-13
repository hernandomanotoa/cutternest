# DevHive Security Policy — CutterNest

This document is the single source of truth for technical security rules in the CutterNest project. Every agent must follow it when implementing, reviewing, testing or documenting authentication, authorization, cryptography, sessions and infrastructure.

## 1. Cryptography

- **Password hashing**: use `bcrypt` (via `passlib[bcrypt]`) with a cost factor of at least 10.
- **JWT secrets**: must be at least 32 characters of random data. Never commit production secrets; load them from `.env` (`JWT_SECRET_KEY`).
- **TOTP secrets**: must be encrypted at rest using Fernet (derived from `TOTP_ENCRYPTION_KEY`). The encryption key must be stored in `.env` and must be separate from `JWT_SECRET_KEY`.
- **TOTP window**: verify codes within `valid_window=1` (30 seconds before/after) using `pyotp`.
- **Backup codes**: hash with bcrypt and store in the `backup_codes` table; verify with `bcrypt.checkpw`. Mark as used with `used_at` timestamp and never reuse.
- **Guest PIN**: generate with `secrets.randbelow(10000)` formatted as 4 digits; store only the PIN identifier in the database. The PIN is short-lived and single-use.
- **Token type verification**: always verify `type` claim in JWT (`access`, `refresh`, `temp`).
- **No hardcoded secrets**: keys, passwords, tokens, API secrets and credentials must only live in `.env*` files, never in source code, tests or documentation.

## 2. Token and Cookie Handling

- **Delivery**: `access_token`, `refresh_token` and `temp_token` must be delivered as **httpOnly cookies**, never in response bodies.
- **Storage**: never store `access_token`, `refresh_token` or `temp_token` in `localStorage` or `sessionStorage` on the frontend.
- **Cookie flags**: cookies must be `httpOnly`. `SameSite` must not be `'none'`. Use `Secure` in production.
- **Temp tokens**: short-lived (5 minutes), stored in the JWT payload and delivered as httpOnly cookie. Verify and revoke immediately after successful 2FA/TOTP verification.
- **Token lifetimes** (default):
  - Access token: 15 minutes
  - Refresh token: 7 days
  - Temp token: 5 minutes
- **Refresh rotation**: `POST /api/v1/auth/refresh` must rotate the access token using the httpOnly `refresh_token` cookie. Do not accept refresh tokens from request bodies or headers.

## 3. Rate Limiting

- Apply rate limiting to authentication-sensitive endpoints:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/verify`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/guest/pin`
  - `POST /api/v1/auth/guest/login`
  - `POST /api/v1/optimize` and `POST /api/v1/projects/{id}/optimize`
- Use `slowapi` with in-memory storage in MVP; Redis in Fase 2.
- Default limit: 5 attempts per minute for auth endpoints, 10 per minute for optimization.
- Rate-limiting responses must not leak whether a user exists.

## 4. Transport and Environment

- **HTTPS required in production**; use `COOKIE_SECURE=true` in production.
- Keep development and production environment configurations separate via `.env` and `docker-compose.*` files.
- Do not expose backend directly without nginx in production.

## 5. Logging and Secrets

- **Never log passwords, TOTP secrets, JWT tokens, refresh tokens, temp tokens, encryption keys, PINs or private keys.**
- Log authentication actions to stdout/structured logs with sanitized data.
- When logging failures, record only the action type, timestamp, endpoint and user identifier (if known), not the submitted credentials.

## 6. Input Validation

- Validate request bodies with Pydantic models before processing.
- Use `async/await`; never use callbacks for request handling.
- Sanitize inputs to prevent injection (SQL via SQLAlchemy, path traversal for exports).
- Reject unexpected fields in request bodies (`extra = "ignore"` in settings, but validate in schemas).

## 7. Infrastructure Secrets

- Do not read, write or modify `.env*` files, certificates (`*.pem`, `*.key`, `*.crt`) or secret stores unless explicitly authorized.
- Do not execute destructive commands: `rm -rf /`, `DROP DATABASE`, `docker system prune`, `chmod -R 777 /`, etc.
- Only reference services defined in `docker-compose.yml` (and `docker-compose.fase2.yml` / `docker-compose.fase4.yml` for their respective phases).

## 8. Dependency Security

- Audit auth-related packages regularly: `PyJWT`, `cryptography`, `passlib[bcrypt]`, `bcrypt`, `pyotp`, `qrcode`, `slowapi`, `fastapi`, `uvicorn`.
- Flag any dependency update that would make it impossible to keep httpOnly cookies, `SameSite` cookies or TOTP encryption at rest.

## 9. Changing This Policy

Any change to these rules requires approval from `@auth-agent` and the Guardian, and usually explicit user approval. Agents must not weaken security rules to satisfy a test or feature request.
