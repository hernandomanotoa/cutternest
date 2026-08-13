# DevHive Domain Rules — CutterNest

This document defines the business and domain-specific rules for CutterNest. It complements `.devhive/security-policy.md` (technical security rules) with project-specific flows, entities, roles and integration patterns. Every agent must load this document when working on authentication, authorization, optimization, inventory, projects, templates or exports.

## 1. Authentication Methods

The MVP supports the following authentication factors:

- **Local password** — username/password stored in SQLite.
- **TOTP** — time-based one-time password using `pyotp`.
- **Backup codes** — static 8-character recovery codes, single-use.
- **Guest PIN** — 4-digit temporary PIN for workshop operators.

New methods (SMS, email, WhatsApp, LDAP, OAuth) require approval from `@auth-agent` and the Guardian, and are only allowed in Fase 2+.

## 2. TOTP Setup Flow

- During registration, the backend generates a raw TOTP secret, encrypts it with `TOTP_ENCRYPTION_KEY`, and stores it in `users.totp_secret_encrypted`.
- The QR code is displayed to the user once as a base64 PNG during registration.
- Backup codes are generated, hashed with bcrypt, and stored in the `backup_codes` table linked to the user.
- Both the plain TOTP secret and plain backup codes are shown only once; they are not recoverable afterwards.

## 3. Multi-Factor Authentication (MFA) Flow

1. After local password validation, the backend sets a `temp_token` as an **httpOnly cookie**.
2. The frontend does **not** store the `temp_token` in `localStorage` or `sessionStorage`.
3. On successful verification, the backend issues `access_token` and `refresh_token` as httpOnly cookies and deletes the `temp_token` cookie.
4. The frontend deletes any non-sensitive UI state on successful verification and on component unmount if the user abandons the flow.

## 4. Guest PIN Flow

- The principal user can generate a 4-digit PIN (`POST /api/v1/auth/guest/pin`).
- The PIN is displayed once on the principal user's screen; it is never sent via email, SMS, WhatsApp or any external channel.
- The PIN expires in 5 minutes if unused and is invalidated after first use.
- Guest sessions last 4 hours by default.
- Guest users cannot access inventory management, user management, or other users' projects.

## 5. Refresh Token Rotation

- Provide `POST /api/v1/auth/refresh`.
- The endpoint reads the `refresh_token` from the httpOnly cookie.
- It issues a new `access_token` as an httpOnly cookie and rotates the `refresh_token`.
- Do not return tokens in the JSON body.

## 6. Roles and Authorization

MVP roles are minimal:

- **principal** — full access to their own projects, inventory, templates and reports.
- **guest** — limited access: can view/create projects, use optimizer, assembly and quote views; cannot access inventory, user management, or historical data from other users.

Changes to roles or RBAC require Guardian and `@auth-agent` approval.

## 7. Project Ownership

- Every project has an `owner_id` pointing to the principal user who created it.
- Endpoints that read, update, delete or optimize a project must verify that the current user is the owner (or a guest with appropriate access).
- The helper `require_project_owner` in `backend/app/dependencies.py` enforces this check.

## 8. Inventory and Offcuts

- Inventory tracks boards (`tipo`, `espesor_mm`, `ancho_cm`, `alto_cm`, `cantidad`, `estado`).
- States: `nuevo`, `usado`, `sobrante`.
- When optimization uses `use_offcuts=true`, the optimizer attempts to place small pieces on `sobrante` boards first before consuming new boards.
- Offcuts can be added to inventory from optimization results.

## 9. Optimization and Export Rules

- The optimizer uses `rectpack` with `GuillotineBssfSas` or fallback algorithms.
- Inputs: board dimensions, piece list with dimensions, `kerf_mm`, `margin_mm`, rotation flags.
- Outputs: SVG/PNG layout, PDF cut list, PDF labels, PDF quote, CSV efficiency report.
- All exports are generated locally and served as static files from `/app/data/exports/`.

## 10. Templates

- Predefined furniture templates (closet, estantería, etc.) generate a piece list from user parameters.
- Templates are backend-defined in `backend/app/templates.py` and exposed via `/api/v1/templates/*`.
- The frontend renders a parameter form based on the template metadata.

## 11. Documentation Requirements

- OpenAPI specs must state that `access_token` and `refresh_token` are delivered as httpOnly cookies and are not returned in response bodies.
- TOTP setup documentation must describe that the QR code is displayed once during registration.
- User-facing guides must not reveal secret keys, encryption keys or credentials.

## 12. Changing This Document

Any change to these domain rules requires approval from `@auth-agent`, `@architect` and the Guardian.
