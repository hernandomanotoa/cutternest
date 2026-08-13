# ADR-0005: Adopción de DevHive con DCOP para gestión de agentes en CutterNest

## Status
Accepted

## Context
CutterNest comenzó con configuración de agentes genérica heredada de otro proyecto. Era necesario alinear el equipo de agentes con el stack real (Python/FastAPI, React/Vite, SQLite, Docker Compose) y el alcance del MVP.

## Decision
- Mantener DevHive con perfil `.devhive/profile.yaml` como fuente de verdad.
- Configurar agentes habilitados: `architect`, `backend-agent`, `frontend-agent`, `db-agent`, `auth-agent`, `deploy-agent`, `test-agent`, `docs-agent`, `knowledge-graph-agent`.
- Configurar plugins: `code-reviewer`, `dependency-checker`, `integration-validator`, `ui-ux-agent`.
- Usar DCOP (`#optimize`, `#checkpoint`, `#resume`) para gestión de contexto y memorias.
- Archivar stubs y logs de auditoría obsoletos en `.agents/memory/archive/`.
- Crear ADRs para decisiones arquitectónicas y de seguridad.

## Consequences
- Positivo: el equipo de agentes refleja el MVP real y no un proyecto anterior.
- Positivo: las memorias se mantienen frescas y con límite de contexto.
- Positivo: las decisiones clave quedan documentadas para futuros agentes.
- Negativo: requiere mantener `profile.yaml` y ADRs actualizados al evolucionar el stack.

## References
- `.devhive/profile.yaml`
- `AGENTS.md`
- `scripts/optimize.mjs`, `scripts/checkpoint.mjs`, `scripts/resume.mjs`
