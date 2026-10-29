# DevHive Agent Team - Wiki DITIC

Este directorio contiene el equipo de agentes de IA para el proyecto **Flujo de Autentificación - Wiki DITIC**, organizado según el sistema **DevHive v2.2.0**.

> **Generic framework:** DevHive is designed to be reusable across projects. Project-specific configuration lives in `.devhive/profile.yaml`; templates use `{{variable.path}}` placeholders and are rendered with `node scripts/render-devhive-templates.mjs`. See `.agents/README-GENERIC.md` for bootstrapping DevHive in a new repository.

## Estructura

```
.agents/
├── guardian/                 # Orquestador + control de permisos + guardrails de loops
│   ├── SKILL.md              # Definición del Guardián (prompt runtime)
│   ├── policies.json         # Permisos, guardrails y concurrencia (runtime, merged)
│   ├── policies.base.json    # Reglas universales
│   ├── policies.stack.json   # Patrones específicos del stack
│   ├── policies.project.json # Aprobaciones específicas del proyecto
│   ├── scripts/merge-policies.js  # Generador de policies.json
│   ├── scripts/detect-stall.mjs   # Detector de loops/stalls y guardrails
│   ├── audit.log             # Registro de decisiones
│   └── memory/               # Memoria del Guardián
│       ├── active-tasks.md
│       ├── queue.md            # Vista global de colas y tokens activos
│       ├── learnings.md
│       └── blockers.md
├── SKILL-BASE.md              # Reglas genéricas compartidas por todos los agentes (L3b)
├── TEMPLATE-KERNEL.md         # Plantilla KERNEL para SKILL.md: Contexto → Tarea → Restricciones → Formato → Criterio
├── templates/                # Plantillas genéricas renderizables
│   ├── agent-skill.md.hbs
│   ├── deliverable.md.hbs
│   └── rendered/             # Salidas renderizadas desde profile.yaml
├── architect/                # Arquitecto / Tech Lead
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md            # Cola de tareas y tokens del agente
├── backend-agent/            # Backend Node.js + Express + TypeScript
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── frontend-agent/           # Frontend React + Vite + TypeScript
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── db-agent/                 # PostgreSQL schema, migraciones, queries
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── auth-agent/               # Seguridad, JWT, TOTP, criptografía
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── deploy-agent/             # Docker, Compose, nginx, WSL scripts
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── test-agent/               # Tests Jest + Supertest + React Testing Library
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── docs-agent/               # Documentación técnica
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
├── knowledge-graph-agent/    # Cartógrafo de Arquitectura
│   └── memory/
│       ├── active-tasks.md
│       └── queue.md
└── plugins/                  # Agentes bajo demanda
    ├── code-reviewer/        # Revisión de código
    ├── dependency-checker/   # Auditoría de dependencias npm
    ├── ldap-agent/             # OpenLDAP dev
    ├── integration-validator/ # Validación final de swarm: tests + entregables
    ├── tunnel-agent/           # Túneles para SMS Gateway privado (Cloudflare, Tailscale, ngrok)
    └── ui-ux-agent/            # Apple HIG + responsive design advisor
```

### Plugins (on-demand)

- **ui-ux-agent** — Apple HIG + responsive design specialist. Advises on HIG compliance, responsive patterns, accessibility, and touch targets. See [SKILL.md](./plugins/ui-ux-agent/SKILL.md).
- **code-reviewer** — Manual code review on demand.
- **dependency-checker** — Dependency audit.
- **ldap-agent** — OpenLDAP dev helper.
- **integration-validator** — Final gate after a swarm: runs tests and verifies deliverables.
- **tunnel-agent** — Tunnels for SMS Gateway private client (Cloudflare, Tailscale, ngrok).

## Host modes, skills and subagents

The Kimi Code runtime that executes the Guardian and worker agents supports several execution modes. The Guardian selects the right mode to minimize token spend and maximize correctness.

| Mode | Use for | Decision owner |
|------|---------|--------------|
| **Conversational** | Quick questions, one-line fixes, or ≤3 tool calls. | Host / User |
| **Plan Mode** | New features, refactors, multi-file changes, architectural decisions. | Guardian (must approve plan before coding) |
| **Goal Mode** | Concrete, verifiable objectives that span many turns (e.g. "make all tests pass"). | Guardian + User (define completion criterion) |
| **Subagent** | Focused investigation (`explore`), planning (`plan`), or implementation (`coder`). | Guardian |
| **AgentSwarm** | Many independent subtasks over different inputs (e.g. review N files). | Guardian |
| **Background task** | Long-running builds, tests, watchers, servers. | Host |

### Built-in skills

The host exposes two built-in skills that agents can request:

- **`update-config`** — Inspect or edit Kimi Code CLI configuration (`config.toml`, `tui.toml`).
- **`write-goal`** — Help craft a well-specified `/goal` objective with completion criterion, proof, boundaries, and stop rule.

### Subagent types

- **`explore`** — Read-only codebase exploration. Use when a task needs >3 searches.
- **`plan`** — Read-only implementation planning and architecture design.
- **`coder`** — General software engineering: read, edit, run commands.

See `.agents/SKILL-BASE.md` for the full mode-selection rules, clean code principles, and token-saving guidelines.

## Generic profile and templating

The project profile at `.devhive/profile.yaml` is the single source of truth for:

- Project metadata (`project.id`, `project.name`, `project.workspace_path`).
- Stack (`stack.backend.framework`, `stack.frontend.bundler`, `stack.database.engine`, etc.).
- Commands (`commands.test_backend`, `commands.build_frontend`, etc.).
- Enabled agents and plugins.

Templates under `.agents/templates/` use `{{...}}` placeholders. To regenerate rendered templates and the rendered master prompt, and to see the full template index:

```bash
node scripts/render-devhive-templates.mjs
```

See `.agents/templates/README.md` for the full list of templates, their rendered outputs, and conventions for adding or modifying a template.

Policy layers are merged with:

```bash
node .agents/guardian/scripts/merge-policies.js
```

For full bootstrap instructions in a new project, read `.agents/README-GENERIC.md`.

### knowledge-graph-agent

- **Ubicación**: `.agents/knowledge-graph-agent/`
- **Rol**: Cartógrafo de Arquitectura
- **Propósito**: Reducir el consumo de tokens en consultas de arquitectura usando `codebase-memory-mcp` como fuente primaria.
- **Memoria**: 
  - `.agents/knowledge-graph-agent/memory/graph/` — stubs de nodos con `qualified_name` MCP y fecha de validación (≤50 tokens cada uno)
  - `.agents/knowledge-graph-agent/memory/edges.md` — relaciones críticas conceptuales únicamente
  - `.agents/knowledge-graph-agent/memory/queries.md` — recetas de consultas MCP de alta frecuencia (hot)
  - `.agents/knowledge-graph-agent/memory/queries.cold.md` — recetas de baja frecuencia y caché estable (cold)
  - `.agents/knowledge-graph-agent/memory/mcp-status.md` — estado del índice MCP
  - `scripts/audit-stub-tokens.mjs` — auditoría del presupuesto de tokens de stubs
- **Integración con el flujo de swarm**: después de cualquier cambio en `backend/src/` o `frontend/src/`, el Guardián debe emitir un token a `knowledge-graph-agent` para re-indexar MCP (`index_repository`) y refrescar los stubs afectados antes de cerrar el swarm.

## Memoria jerárquica (Layered Loading)

Cada agente carga contexto en capas, de más general a más específico:

| Layer | Archivo | Obligatorio | Notas |
|-------|---------|-------------|-------|
| L0 | `.devhive/project-brief.md` | Sí | Project goals, scope and glossary |
| L1 | `.devhive/conventions.md` | Sí | Índice ligero a convenciones por área |
| L1b | `.devhive/conventions-{backend,frontend,db,deploy,test,auth,agents}.md` | Bajo demanda | Detalle por área; se carga según el scope de la tarea |
| L2 | `.devhive/current-sprint.md` | Sí | Sprint activo, tasks y prioridades |
| L2 (cold) | `.devhive/sprints/archive/sprint-2026-07-completed.md` | No | Historial completado; no se carga por defecto |
| L3 | `.agents/{agent}/SKILL.md` | Sí (especialización del agente) | Solo reglas específicas del agente; incluye criterios de éxito y handoff ticket KERNEL |
| L3b | `.agents/SKILL-BASE.md` | Sí (reglas transversales) | Pre-condiciones, MCP-first, concurrencia, entregable |
| L4 | `.agents/{agent}/memory/active-tasks.md` | Sí, si existe | Runtime task state |
| L5 | `.devhive/security-policy.md` | Bajo demanda | |
| L5 | `.devhive/domain-rules.md` | Bajo demanda | |
| L5 | `.devhive/decisions/*.md` relevant | Bajo demanda | |
| L5 | `.agents/knowledge-graph-agent/memory/queries.md` (recetas hot) | Bajo demanda | |
| L6 | `.agents/knowledge-graph-agent/memory/queries.cold.md` (recetas cold) | Solo si el Guardián autoriza carga cold | |
| L6 | `.agents/knowledge-graph-agent/memory/edges.md` (relaciones críticas) | Bajo demanda | |
| L7 | MCP query vía `knowledge-graph-agent` | Fuente primaria para preguntas de arquitectura | |
| L8 | Código fuente | Solo el archivo específico devuelto por MCP | |

> **Nota:** las rutas legacy `src/` están obsoletas. El código backend real vive en `backend/src/`.
> **Nota:** el historial completado del agente vive en `.agents/{agent}/memory/completed-tasks.md` y no se carga por defecto.
> **Nota:** L1 ahora es un índice ligero; el detalle por área vive en los archivos L1b y se carga bajo demanda según el scope de la tarea.
> **Nota:** L3b (`.agents/SKILL-BASE.md`) centraliza las reglas transversales; el `SKILL.md` de cada agente (L3) solo debe contener reglas específicas de ese rol.
> **Auditoría:** verifica los presupuestos de tokens con `node scripts/audit-context-tokens.mjs`.

## Flujo de trabajo

1. El agente carga su memoria jerárquica (L0–L3, L3b y L4).
2. El usuario solicita una tarea siguiendo `.devhive/how-to-request-a-task.md`.
3. El Guardián valida la solicitud, prioridad y concurrencia:
   - Si el agente está por debajo de `max_concurrent_tokens`, emite el token.
   - Si está en el límite y `queue_policy` es `enqueue`, encola la tarea en `.agents/{agent}/memory/queue.md`.
   - Si está en el límite y `queue_policy` es `reject`, rechaza la solicitud.
4. El agente registra la tarea como `IN_PROGRESS` en `active-tasks.md` y `queue.md`.
5. Para preguntas de arquitectura o impacto, el agente consulta a `knowledge-graph-agent` vía MCP antes de leer código fuente.
6. El agente ejecuta la tarea con el token incluido en cada operación.
7. Al finalizar, el agente actualiza el estado a `COMPLETED` o `FAILED` y el Guardián revoca el token.
8. Si hay tareas en cola, el Guardián promueve la siguiente.
9. Si la tarea modificó código fuente, el Guardián emite un token a `knowledge-graph-agent` para re-indexar MCP y refrescar stubs.
10. El agente entrega el resultado con el formato estándar de DevHive, incluyendo el 🎫 HANDOFF TICKET si el trabajo pasa a otro agente.

## Concurrencia y gestión de tokens

Cada agente tiene un límite de tokens concurrentes definido en `.agents/guardian/policies.json`:

| Agente | Tokens concurrentes | Política de cola | Timeout de token huérfano |
|---|---|---|---|
| architect | 1 | enqueue | 90 min |
| knowledge-graph-agent | 1 | enqueue | 45 min |
| backend-agent | 1 | enqueue | 25 min |
| frontend-agent | 1 | enqueue | 25 min |
| db-agent | 1 | enqueue | 20 min |
| auth-agent | 1 | enqueue | 15 min |
| deploy-agent | 1 | enqueue | 45 min |
| test-agent | 2 | enqueue | 25 min |
| docs-agent | 2 | enqueue | 25 min |
| tunnel-agent (plugin) | 1 | enqueue | 30 min |
| plugins | 1 | enqueue | 15 min |

**Reglas clave:**

- Un token = una acción específica sobre un recurso específico.
- El Guardián no emite un nuevo token a un agente que ya está en su límite.
- Las tareas encoladas se almacenan en `.agents/{agent}/memory/queue.md`.
- El Guardián mantiene una vista global en `.agents/guardian/memory/queue.md`.
- Un token que excede su `orphan_token_timeout_minutes` sin finalización se revoca automáticamente.
- Antes de enviar un mensaje inter-agente, el agente origen debe consultar disponibilidad al Guardián.

### Formato de solicitud cuando el agente está ocupado

```markdown
[AGENT: backend-agent] Requests: create backend/src/services/reportService.ts
Justification: [why]
Context loaded: L0-L3 + L3b ✅

⚠️ Agent currently has [N] active token(s). Requesting queue position if at limit.
```

### Formato de respuesta cuando se encola

```markdown
🛡️ GUARDIAN DECISION:
- Agent: backend-agent
- Action: create backend/src/services/reportService.ts
- Decision: ⏳ QUEUED
- Token: -
- Queue position: 1
- Reason: Agent is at max_concurrent_tokens; request will be processed when the active token is released.

🧠 MEMORY UPDATED: `.agents/guardian/memory/queue.md`, `.agents/backend-agent/memory/queue.md`
```

## Guardrails de loops y stalls

El Guardián aplica guardrails de ejecución definidos en `.agents/guardian/policies.json`:

- `max_steps_default`: 15 pasos por tarea; si un agente los alcanza, marca la tarea como `stalled` y reporta.
- `max_handoffs_per_task`: máximo 5 handoffs entre agentes para la misma tarea.
- `forbidden_cycles`: handoffs cíclicos prohibidos (p. ej. `backend-agent ↔ db-agent`).
- `stall_detection`: repetición de la misma acción + input + resultado 3 veces, o inactividad > 10 min, se considera stall.

El detector `.agents/guardian/scripts/detect-stall.mjs` lee el `audit.log` y las políticas, escribe una alerta y marca la tarea afectada como `stalled` en el `active-tasks.md` del agente. Uso:

```bash
node .agents/guardian/scripts/detect-stall.mjs
```

## Formato de entrega estándar

Todos los agentes deben usar la plantilla de entrega en `.agents/guardian/templates/deliverable-template.md`. Las pre-conditions obligatorias y las reglas genéricas viven en `.agents/SKILL-BASE.md` (L3b); las reglas específicas de cada agente viven en su `SKILL.md` (L3).

El campo `PRE-CONDITIONS MET` es obligatorio para todo agente antes de declarar una tarea completada. Incluye: CWD (`/workspace/flujo-autentificacion`), contexto L0-L3 + L3b, token activo, scope permitido, sincronización de lockfiles (si se tocó `package.json`) y backup de `audit.log` (gestionado por el Guardian).

## Cierre de swarm

Antes de declarar un swarm como completado, el Guardian debe:

1. Recopilar todos los entregables en formato estándar.
2. Verificar que cada agente cumplió los pre-conditions.
3. Verificar sincronización de lockfiles si se modificó `package.json`.
4. Hacer backup de `.agents/guardian/audit.log` antes de la escritura final.
5. Actualizar todas las memorias en un único batch al final del swarm.
6. Emitir un token de validación a `integration-validator` y esperar su reporte.

## Mapeo desde agentes legacy

Los archivos legacy (`legacy-core/` y `legacy-memory/`) fueron eliminados del repositorio porque ya no se utilizan. El siguiente mapeo se conserva solo como referencia histórica:

| Agente legacy | Agente DevHive |
|---|---|
| `orchestrator` | `guardian` |
| `architect` | `architect` |
| `backend` | `backend-agent` |
| `frontend` | `frontend-agent` |
| `dba` | `db-agent` |
| `devops` | `deploy-agent` |
| `security-qa` | `auth-agent` + `test-agent` |
| `ldap-admin` | `ldap-agent` (plugin) |
| `cache-admin` | integrado en `backend-agent` |
| `code-reviewer` | `code-reviewer` (plugin) |
| `test-generator` | `test-agent` |
| `doc-generator` | `docs-agent` |
| `dependency-checker` | `dependency-checker` (plugin) |
| `tunnel-admin` | `tunnel-agent` (plugin) |

## Referencias

- `.agents/README-GENERIC.md` — bootstrap genérico de DevHive.
- `.devhive/profile.yaml` — fuente única de verdad de agentes, stack y comandos.
- `.agents/guardian/policies.json` — políticas de permisos, concurrencia y guardrails.
- `.devhive/how-to-request-a-task.md` — plantilla genérica de solicitud de tareas.
- `docs/AGENT-WORKFLOW.md` — flujo completo del equipo y guía práctica para Kimi Code.
- `docs/AGENTS.md` — organigrama y responsabilidades detalladas.
- `.devhive/conventions.md` — convenciones de código y memoria.

## Notas

- Nunca modificar archivos fuera del scope asignado sin token del Guardián.
- Las memorias individuales se dividen en `active-tasks.md`, `completed-tasks.md`, `queue.md`, `learnings.md` y `blockers.md`.
- `active-tasks.md` solo contiene tareas en curso, próximas acciones y bloqueadores.
- `completed-tasks.md` es el archivo frío con el historial de tareas finalizadas.
- `queue.md` es la fuente de verdad del estado de tokens y tareas encoladas de cada agente.
- La memoria compartida del proyecto vive en `.devhive/`.
- El índice maestro del proyecto está en `.kimi-memory.md`.
