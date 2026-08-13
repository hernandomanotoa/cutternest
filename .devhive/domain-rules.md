# DevHive Domain Rules

This document defines the business and domain-specific rules for the Wiki DITIC authentication system. It complements `.devhive/security-policy.md` (technical security rules) with project-specific flows, entities, roles and integration patterns. Every agent must load this document when working on authentication, authorization, audit, WhatsApp/Tor proxy or system configuration.

## 1. Authentication Methods

The system supports the following authentication factors, which may be combined based on user role and system configuration:

- **LDAP** — corporate directory, primary factor for DITIC/INEC users.
- **Local password** — fallback for users not in LDAP or during directory outage.
- **TOTP** — time-based one-time password, mandatory for roles that require it.
- **SMS code** — one-time code sent via SMS gateway.
- **Email code** — one-time code sent via SMTP.
- **Backup codes** — static recovery codes.

New methods or factor removal require approval from `@auth-agent` and the Guardian.

## 2. TOTP Setup Flow

- During setup, the raw TOTP secret must be written to the `users.totp_secret_pending` column.
- The secret must **not** be moved to `users.totp_secret` until the user verifies the **first generated code successfully**.
- After first successful verification:
  - copy the secret from `totp_secret_pending` to `totp_secret`;
  - set `users.totp_enabled = TRUE`;
  - clear `totp_secret_pending`.
- This flow prevents enabling TOTP before the user has proven they can generate valid codes.

## 3. Multi-Factor Authentication (MFA) Flow

1. After primary authentication (LDAP or local password), if MFA is required, the backend returns a `tempToken` to the frontend.
2. The frontend keeps the `tempToken` in `sessionStorage` **only** during the verification step.
3. The frontend keeps `pendingUsername` in `sessionStorage` **only** while the MFA step is active.
4. On successful verification, the backend issues `accessToken`, `refreshToken` and `session` as httpOnly cookies and revokes the `tempToken` immediately.
5. The frontend deletes `tempToken` and `pendingUsername` from `sessionStorage` on successful verification and on component unmount if the user abandons the flow.
6. The `tempToken` is a short-lived server-side token stored in the cache engine (Redis). It must be verified with `verifyTempToken` and revoked with `revokeTempToken` immediately after success.

## 4. Trusted Devices

- The frontend may generate and store a `deviceToken` in `localStorage` as a long-lived trusted-device identifier.
- The `deviceToken` must be preserved across logouts.
- On login, the frontend sends the `deviceToken` to the backend.
- The backend may skip the MFA step when the device is recognized **and** the user's role/policy allows it.
- Trusted-device status is an optimization; it does not replace authorization or RBAC checks.

## 5. Refresh Token Rotation

- Provide `POST /api/auth/refresh`.
- The endpoint reads the `refreshToken` from the httpOnly cookie sent by the browser.
- It issues a new `accessToken` as an httpOnly cookie.
- Do not return tokens in the JSON body.

## 6. RBAC and Roles

The canonical roles are defined in `backend/src/middleware/rbac.ts` (or equivalent) and stored in the database:

- `SUPERUSUARIO`
- `ADMINISTRADOR`
- `SUPERVISOR`
- `OPERADOR`
- `AUDITOR`

Rules:

- Permissions must be read from the database, not hardcoded per role (except for the role names themselves).
- Legacy or Spanish-prefixed role names are obsolete. Do not introduce new role names without approval from `@auth-agent` and the Guardian.
- Changes to base roles or permission logic require Guardian approval.

## 7. Audit Logging

- Log all relevant authentication, authorization and configuration actions to the `audit_logs` table.
- Include: action type, actor, target resource, timestamp, result (success/failure), and contextual metadata.
- Do **not** log passwords, secrets, tokens, encryption keys or private keys.
- The Guardian also writes every decision to its own `audit.log` file.

## 8. Core Entities

The database schema includes at least these tables:

- `users` — accounts, passwords, TOTP fields (`totp_secret`, `totp_secret_pending`, `totp_enabled`), roles, MFA preferences.
- `audit_logs` — security audit trail.
- `documents` — wiki documents managed by the system.
- `system_config` — runtime configuration (e.g., feature flags, LDAP settings, MFA policy).

When changing any of these tables, update the canonical schema file (`init-scripts/01-init.sql`) and provide a migration script for existing databases.

## 9. LDAP Integration

- The `ldap-agent` owns the `ldap-dev` service and LDIF files.
- The development OpenLDAP service uses TLS on port **1636** (LDAPS).
- The backend maps LDAP attributes to local user fields (e.g., `uid`, `cn`, `mail`).
- Bind credentials and LDAP URLs must be loaded from `.env`; do not hardcode them.
- Coordinate attribute mapping and bind credentials with `@backend-agent`.

## 10. WhatsApp / Tor Proxy

The system supports outbound WhatsApp notifications through the Baileys library and SOCKS5/Tor proxying for environments behind restrictive corporate firewalls.

- The `backend/src/services/whatsappService.ts` service owns the Baileys integration.
- The `backend/src/utils/proxyAgent.ts` utility provides SOCKS5/Tor proxy configuration.
- WhatsApp configuration (enabled flag, admin number, proxy settings) is managed via `system_config` and the `SystemConfig` UI component.
- A dedicated WhatsApp admin role controls who can manage the integration (see `.devhive/decisions/007-whatsapp-admin-role.md`).
- Tor proxy testing helpers live in `scripts/test-tor-proxy.js` and `tests/tor-browser.test.ts`.
- Changes to the proxy or WhatsApp integration require Guardian approval.

## 11. Documentation Requirements

- OpenAPI specs must state that `accessToken`, `refreshToken` and `session` are delivered as httpOnly cookies and are not returned in response bodies.
- TOTP setup documentation must describe the pending-secret flow (`totp_secret_pending` → `totp_secret` on first verification).
- User-facing guides must not reveal secret keys, encryption keys or credentials.

## 12. Changing This Document

Any change to these domain rules requires approval from `@auth-agent`, `@architect` and the Guardian. When porting DevHive to another project, replace this file with the new project's business rules.
