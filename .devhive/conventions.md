# Convenciones de Código - CutterNest

Índice de convenciones por área. Cada archivo se carga bajo demanda según el scope de la tarea.

- [Core / transversales](./conventions-core.md) — estructura del repo, git, reglas de memoria, presupuesto de tokens, checklists generales (si existe; de lo contrario, ver `AGENTS.md`).
- [Backend](./conventions-backend.md) — Python 3.11/FastAPI/SQLAlchemy/Pydantic/pytest.
- [Frontend](./conventions-frontend.md) — React 18/Vite/TypeScript/Three.js/Tailwind.
- [Base de datos](./conventions-db.md) — SQLite MVP; PostgreSQL/Redis en Fase 2.
- [Despliegue](./conventions-deploy.md) — Docker Compose por fases (MVP, Fase 2, Fase 4).
- [Tests](./conventions-test.md) — pytest backend, Vitest frontend.
- [Auth / Seguridad](./conventions-auth.md) — JWT, TOTP local, Guest PIN, sin auth externa en MVP.
- [Agentes DevHive](./conventions-agents.md) — reglas de agentes, memoria, handoffs.

## Convenciones transversales rápidas

- Idioma del proyecto: Español para UI, mensajes de error y PDFs. Código y nombres de archivo en inglés o español según dominio (priorizar claridad del negocio).
- No versionar secretos, `.env`, datos persistentes (`data/`, `backups/`, `*.db`) ni claves.
- Preferir `Edit` sobre `Write` para cambios pequeños; usar `Write` solo para archivos nuevos o reemplazo completo autorizado.
- Antes de cambios de arquitectura, consultar `.devhive/project-brief.md` y el archivo L1b correspondiente.
