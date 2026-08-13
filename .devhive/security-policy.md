# DevHive Security Policy

This document is the single source of truth for technical security rules in the DevHive project. Every agent must follow it when implementing, reviewing, testing or documenting authentication, authorization, cryptography, sessions and infrastructure.

## 1. Cryptography

- **Password hashing**: use `bcrypt` (or `bcryptjs`) with a cost factor of **at least 12**.
- **JWT secrets**: must be **at least 256 bits** of cryptographically secure random data. Never commit production secrets to the repository; load them from `.env`.
- **TOTP secrets**: must be **encrypted at rest** using AES-256-GCM (or equivalent authenticated encryption). The encryption key must be stored in `.env` (`TOTP_ENCRYPTION_KEY`, `EMAIL_TOTP_ENCRYPTION_KEY`, etc.).
- **TOTP window**: verify codes within **exactly 1 period** (30 seconds). Do not accept older codes unless a documented risk assessment approves it.
- **Device token**: generate a **32-byte random token** (e.g., `crypto.randomBytes(32).toString('hex')`).
- **Device fingerprint**: compute as a **SHA-256** hash of stable client details (user-agent, screen, locale, etc.).
- **Token type verification**: always call `verifyToken(token, expectedType)` with the expected type (`access`, `refresh`, `temp`, `device`, etc.).
- **No hardcoded secrets**: keys, passwords, salts, API secrets and credentials must only live in `.env*` files, never in source code, tests or documentation.

## 2. Token and Cookie Handling

- **Delivery**: `accessToken`, `refreshToken` and `session` tokens must be delivered as **httpOnly cookies**, never in response bodies.
- **Storage**: never store `accessToken`, `refreshToken` or `session` in `localStorage` or `sessionStorage` on the frontend.
- **Cookie flags**: cookies must be `httpOnly`. `SameSite` must **not** be `'none'`. Use `Secure` in production.
- **Temp tokens**: store temporary 2FA/MFA tokens in the cache engine (Redis) using `storeTempToken`. Verify them with `verifyTempToken` and revoke them immediately with `revokeTempToken` after a successful 2FA/TOTP verification.
- **Token lifetimes** (default):
  - Access token: **15 minutes**
  - Refresh token: **7 days**
  - Temp token: **5 minutes**
  - Device token: **30 days**
- **Refresh rotation**: `POST /api/auth/refresh` must rotate the access token using the httpOnly `refreshToken` cookie sent by the browser. Do not accept refresh tokens from request bodies or headers.
- **Trusted devices**: the frontend may persist a `deviceToken` in `localStorage` as a long-lived trusted-device identifier. It must be sent on login to allow skipping 2FA when the role/policy allows it. Do not use it for access control or authorization decisions on its own.

## 3. Rate Limiting

- Apply a rate limit of **5 attempts per 15 minutes** in production to authentication-sensitive endpoints including, but not limited to:
  - login
  - 2FA/TOTP verification
  - `/request-email-totp`
  - `/request-sms`
- Use `express-rate-limit` or an equivalent backend middleware.
- Rate-limiting decisions must not leak whether a user exists.

## 4. Transport and Environment

- **HTTPS required in production**.
- Do not accept authentication or token-bearing requests over plain HTTP in production.
- Use TLS for LDAPS connections (port 636/1636).
- Keep development and production environment configurations separate.

## 5. Logging and Secrets

- **Never log passwords, TOTP secrets, JWT tokens, refresh tokens, device tokens, encryption keys or private keys.**
- Log authentication actions to `audit_logs` using structured, sanitized data.
- When logging failures, record only the action type, timestamp, endpoint, IP (if allowed) and user identifier (if known), not the submitted credentials.

## 6. Input Validation

- Validate `req.body` with strict types before processing.
- Use `async/await`; never use callbacks for request handling.
- Sanitize inputs to prevent injection (SQL, NoSQL, LDAP, command, path traversal).
- Reject unexpected fields in request bodies.

## 7. Infrastructure Secrets

- Do not read, write or modify `.env*` files, certificates (`*.pem`, `*.key`, `*.crt`) or secret stores unless explicitly authorized.
- Do not execute destructive commands: `rm -rf /`, `DROP DATABASE`, `docker system prune`, `chmod -R 777 /`, etc.
- Only reference services defined in `docker-compose.yml`.

## 8. Dependency Security

- Audit auth-related packages regularly: `bcryptjs`, `jsonwebtoken`, `express`, `express-rate-limit`, `cookie-parser`, `cors`, `helmet`, `speakeasy`, `qrcode`, `nodemailer`.
- Flag any dependency update that would make it impossible to keep httpOnly cookies, `SameSite` cookies or TOTP encryption at rest.

## 9. Changing This Policy

Any change to these rules requires approval from `@auth-agent` and the Guardian, and usually explicit user approval. Agents must not weaken security rules to satisfy a test or feature request.
