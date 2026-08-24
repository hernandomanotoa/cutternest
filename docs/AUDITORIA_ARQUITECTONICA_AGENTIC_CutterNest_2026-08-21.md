# Auditoría Arquitectónica del Sistema Agentic — CutterNest

**Fecha:** 2026-08-21  
**Auditor:** Guardian / DevHive auditor  
**Scope:** `/workspace/cutternest-kit` — infraestructura agentic (`.agents/`, `.devhive/`, `scripts/`, MCP, skills, prompts)  
**Restricción:** solo lectura; no se modificó código, configuraciones ni dependencias.

---

## 1. Resumen ejecutivo

El proyecto cuenta con un **framework agentic documentado pero no ejecutado realmente como runtime autónomo**. DevHive v2.2.0 define 9 agentes core + 4 plugins, un Guardian orquestador, un knowledge graph basado en `codebase-memory-mcp`, un protocolo DCOP de compresión de contexto, plantillas de skills y mecanismos de permisos. La mayor parte de la funcionalidad "agentic" reside en prompts, archivos Markdown y scripts Node.js manuales; **no existe una capa de runtime/orquestación externa que enlace automáticamente los agentes, controle tokens, impida loops o recupere errores**.

Los principales riesgos son:

1. **Referencias inconsistentes al workspace** (`/workspace/flujo-autentificacion` en lugar de `/workspace/cutternest-kit`) que descontextualizan a los agentes.
2. **MCP desacoplado** del contexto agentic: las recetas apuntan a un proyecto inexistente y el índice excluye `.agents/`, `.devhive/`, `scripts/` y `docs/`.
3. **Control de loops manual**: existe stall detection como script, pero no está integrada al runtime.
4. **Gestión de tokens heurística**: solo hay un estimador de bytes, sin presupuesto real por turno/agente.
5. **No hay observabilidad de costo, trazas ni evaluación automática**.

**Recomendación principal:** no reemplazar Kimi Code. Complementarlo con una capa ligera de orquestación que primero corrija consistencia de nombres e integración MCP, y luego agregue control de loops, presupuesto de tokens y observabilidad.

---

## 2. Metodología

1. Indexación MCP del repo (`cutternest-kit`, modo fast, 10.492 nodos, 14.323 edges).
2. Lectura directa de L0-L3: `.kimi-memory.md`, `.devhive/profile.yaml`, `.devhive/project-brief.md`, `.devhive/conventions*.md`, `.devhive/current-sprint.md`, `.devhive/architecture.md`, `.devhive/token-economy-report-20260803.md`.
3. Lectura del stack agentic: `.agents/MASTER_PROMPT.md`, `.agents/SKILL-BASE.md`, `.agents/TEMPLATE-KERNEL.md`, `.agents/TOKEN-SAVING-GUIDE.md`, `.agents/guardian/SKILL.md`, `.agents/guardian/policies.json`, `.agents/guardian/templates/deliverable-template.md`, todos los `SKILL.md` de agentes.
4. Lectura de scripts de control: `scripts/optimize.mjs`, `scripts/checkpoint.mjs`, `scripts/resume.mjs`, `scripts/validate-devhive.mjs`, `scripts/lib/dcop-utils.mjs`, `.agents/guardian/scripts/{batch-update-memory,detect-stall,guardrails-dry-run,merge-policies}.js`.
5. Exploración de memorias, session-state, context-policy, aliases, queries.md, edges.md, orphans.md, mcp-status.md.
6. Búsqueda de skills builtin, archivos de configuración Kimi, cron jobs y templates.
7. Sin modificar archivos.

---

## 3. Arquitectura actual

```
USUARIO
  ↓
Kimi Code CLI (host)
  ↓
Guardian (rol, prompt en .agents/guardian/SKILL.md + MASTER_PROMPT.md)
  ↓
AGENTES DEVHIVE (prompts en .agents/{agent}/SKILL.md)
  ├─ core: architect, backend-agent, frontend-agent, db-agent, auth-agent,
  │         deploy-agent, test-agent, docs-agent, knowledge-graph-agent
  ├─ plugins: code-reviewer, dependency-checker, integration-validator, ui-ux-agent
  └─ on-demand: tunnel-agent, ldap-agent
  ↓
SKILLS
  ├─ Builtin de Kimi: update-config, write-goal
  └─ "Skills" propias: SKILL.md largos con rol/contexto/restricciones/formato
  ↓
MCP (codebase-memory-mcp)
  ├─ Grafo del código backend/frontend (indexado)
  └─ Stubs manuales en .agents/knowledge-graph-agent/memory/graph/
  ↓
TOOLS (las del host: Bash, Read, Edit, Write, Agent, AgentSwarm, MCP, etc.)
  ↓
KNOWLEDGE
  ├─ .devhive/ (project-brief, conventions, current-sprint, decisions, ADRs)
  ├─ .agents/ (SKILL.md, templates, policies)
  ├─ .agents/memory/ (session-state, context-policy, aliases, optimization.log)
  └─ .agents/{agent}/memory/ (active-tasks, queue, blockers, learnings, completed-tasks)
  ↓
FILES / DB / EXTERNAL SERVICES
  ├─ SQLite del backend
  ├─ Archivos de exportación en data/exports/
  ├─ Docker Compose (MVP/Fase2/Fase4)
  └─ Git repo
```

### Ubicaciones clave

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Perfil DevHive | `.devhive/profile.yaml` | Metadatos, stack, comandos, lista de agentes, paths |
| Políticas | `.agents/guardian/policies.json` | Scopes, allowed/denied patterns, guardrails, tokens |
| Orquestador | `.agents/MASTER_PROMPT.md` + `.agents/guardian/SKILL.md` | Reglas de swarm, tokens, handoffs, MCP refresh |
| Plantillas skills | `.agents/templates/*.hbs` | Renderizado de SKILL.md por agente |
| Deliverable | `.agents/guardian/templates/deliverable-template.md` | Formato de entrega de cada agente |
| Knowledge graph | `.agents/knowledge-graph-agent/memory/` | Stubs, edges, queries, orphans, mcp-status |
| DCOP | `scripts/optimize.mjs`, `checkpoint.mjs`, `resume.mjs` | Compresión, snapshot, resumen de contexto |
| Memoria global | `.agents/memory/` | session-state, context-policy, aliases, optimization.log |
| Memoria por agente | `.agents/{agent}/memory/` | active-tasks, queue, blockers, learnings, completed-tasks |
| Audit log | `.agents/guardian/audit.log` | Registro manual de decisiones |
| Stall detection | `.agents/guardian/scripts/detect-stall.mjs` | Detección offline de loops/repetición/inactividad |
| Batch memory | `.agents/guardian/scripts/batch-update-memory.mjs` | Actualización centralizada de memorias |
| Validador | `scripts/validate-devhive.mjs` | Valida profile.yaml y placeholders de templates |

### Estado del contexto

- `session-state.md` indica 57% de uso de contexto y 7 "open token markers".
- `CONTEXT_BUDGET_BYTES = 200_000` en `scripts/lib/dcop-utils.mjs`; es una heurística, no un presupuesto de tokens real.
- El token economy report previo reporta ahorros significativos, pero no existe `scripts/audit-stub-tokens.mjs` a pesar de que el reporte lo menciona.

---

## 4. Mapa de agentes

| Agente | Scope principal | Permisos de escritura | Riesgo observado |
|---|---|---|---|
| **architect** | `.devhive/`, `.agents/*/SKILL.md` | ADRs, convenciones, skills | Puede modificar skills de otros; requiere aprobación solo para stack/agents |
| **knowledge-graph-agent** | `.agents/knowledge-graph-agent/memory/` | Stubs, edges, queries, orphans | Referencias proyecto incorrecto; reindex requiere aprobación pero no hay integración automática |
| **backend-agent** | `backend/app/**/*.py` | APIs, servicios, modelos | Denied `backend/app/auth.py`; require_approval para main.py/dependencies |
| **frontend-agent** | `frontend/src/**/*.{ts,tsx,css}` | Componentes, hooks, stores | No puede tocar configs ni package.json sin aprobación |
| **frontend-template-agent** | `frontend/src/components/ui/`, `frontend/src/hooks/` | UI base, temas | Overlap con frontend-agent; forbidden cycle definida |
| **auth-agent** | `backend/app/auth.py`, `models.py`, `database.py` | Auth/TOTP/JWT/PIN | TTL de token más corto (5 min); sensibilidad alta |
| **db-agent** | `backend/app/models.py`, `init.sql`, `scripts/migrations/` | Esquema, migraciones | Denied raw SQL; requiere aprobación para ALTER/DROP |
| **deploy-agent** | `docker-compose*.yml`, `Dockerfile*`, `scripts/*.sh` | Infra Docker | Requiere aprobación para cambios de puertos/imagen base |
| **test-agent** | `backend/tests/`, frontend tests | Tests, ejecutar tests | Puede ejecutar tests; overlap con backend/frontend |
| **docs-agent** | `*.md`, `docs/**` | README, OpenAPI, ADRs | Scope amplio (`./`) pero denied `src/`, `frontend/src/`, `scripts/` |
| **integration-validator** | Todo (read-only) | Ejecutar validaciones finales | No modifica; es plugin final |
| **code-reviewer** | On-demand | Revisión | No tiene SKILL.md leído en este audit |
| **dependency-checker** | On-demand | Análisis de dependencias | Idem |
| **ui-ux-agent** | On-demand | Patrones UI/UX | Referenciado en frontend skills y edges |
| **tunnel-agent** | `scripts/tunnel/`, `docker-compose.tunnels.yml` | Túneles (cloudflared/ngrok) | No habilitado en profile.yaml actual |
| **ldap-agent** | On-demand | LDAP | No habilitado en MVP |

### Duplicaciones y overlaps

- **frontend-agent** y **frontend-template-agent**: comparten hooks y UI base; `policies.json` define forbidden cycle, pero la separación puede generar fricción.
- **backend-agent** y **auth-agent**: comparten modelos compartidos (`models.py`, `database.py`); require coordinación manual.
- **architect** y **knowledge-graph-agent**: ambos definen arquitectura; riesgo de doble fuente de verdad si no se sincronizan.
- **MASTER_PROMPT.md** y **guardian/SKILL.md**: repiten secciones (formato de decisión, cierre de swarm, MCP refresh).

### Riesgo de fragmentación

Cada agente tiene su propio `active-tasks.md`, `queue.md`, `blockers.md`. En el session-state actual hay 33 archivos P1 listados como "hot", lo que multiplica el contexto activo. El DCOP debería comprimir `learnings.md` y `completed-tasks.md`, pero no reduce la cantidad de archivos hot.

---

## 5. Mapa de Skills

| Skill | Scope | Tipo | Observación |
|---|---|---|---|
| `update-config` | CLI config | Builtin Kimi | Funcional, no usada por agentes DevHive |
| `write-goal` | Redacción de goals | Builtin Kimi | Funcional, no usada por agentes DevHive |
| Todos los `.agents/{agent}/SKILL.md` | Prompts largos de rol | "Skill como prompt" | No son skills invocables; son contexto estático que cada agente debe cargar |
| `.agents/TOKEN-SAVING-GUIDE.md` | Buenas prácticas | Documento | No es skill; contiene duplicación con `SKILL-BASE.md` |
| `.agents/TEMPLATE-KERNEL.md` | Plantilla para skills | Plantilla | No es skill en ejecución |

### Problemas

- **No hay skills reutilizables invocables** por los agentes (salvo las 2 builtin de Kimi).
- Los SKILL.md actúan como **almacenamiento de conocimiento** más que como "cómo hacer algo".
- Cada SKILL.md repite secciones KERNEL (contexto, tarea, restricciones, formato, criterio de éxito, handoff), generando duplicación.
- `knowledge-graph-agent/SKILL.md` aún dice "Wiki DITIC" y apunta a `/workspace/flujo-autentificacion`.

---

## 6. Mapa de MCP

| Nombre | Función | Tools/Recursos | Prompts | Riesgo |
|---|---|---|---|---|
| `codebase-memory-mcp` | Grafo de conocimiento del código | `index_repository`, `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `detect_dead_code` | No tiene prompts invocables | Configurado con nombre de proyecto incorrecto en queries.md |

### Problemas encontrados

1. **Nombre de proyecto inconsistente**:
   - `profile.yaml`: `mcp_name: workspace-cutternest-kit`
   - `knowledge-graph-agent/SKILL.md`: `workspace-flujo-autentificacion`
   - `queries.md`: `workspace-flujo-autentificacion`
   - Índice real del MCP: `cutternest-kit`
2. **Exclusión de infraestructura agentic** del índice: `.agents/`, `.devhive/`, `docs/`, `scripts/` fueron excluidos en `index_repository` (fast mode). Esto hace que MCP no responda sobre la propia arquitectura agentic.
3. **MCP no expone recursos del proyecto**: no hay resources/prompts de MCP para agentes, políticas o decisiones.
4. **No hay MCP Router**: cualquier agente puede potencialmente llamar a cualquier tool del host.

---

## 7. Análisis Goal / Plan / Swarm

| Mecanismo | Inicia | Controla | Termina | Herramientas | Límites observados |
|---|---|---|---|---|---|
| **Goal** | Usuario con `CreateGoal` | Kimi Code host | Criterio de completitud definido | Herramientas del host | Depende del host; DevHive no impone límite propio |
| **Plan** | Host en Plan Mode | Guardian/architect | Aprobación del usuario | `EnterPlanMode` / `ExitPlanMode` | L0-L3 deben cargarse; plan file en plan file del host |
| **Swarm** | Guardian decide | MASTER_PROMPT dice que emite tokens | Cierre manual con 13 pasos | Agent/AgentSwarm del host | `max_concurrent_tokens: 1` por agente; `max_handoffs_per_task: 5`; `max_steps_default: 15` |
| **Subagentes** | Guardian/agente | Host Kimi | Resultado del subagente | `Agent`, `AgentSwarm` | Timeout 30 min; sin límite de profundidad forzado |
| **Workflows paralelos** | AgentSwarm | Host | Resultado de todos | AgentSwarm | Recomendado solo para tareas independientes |
| **Workflows secuenciales** | Guardian con tokens | Guardian | Entrega + handoff | Prompt manual | Depende de la disciplina del agente |

### Gaps

- No hay mecanismo automático para saber que un swarm terminó; el Guardian debe ejecutar 13 pasos manualmente.
- No hay integración entre `policies.json` y el runtime real; el host no conoce `max_concurrent_tokens`.
- No hay límite de tokens por Goal/Swarm en las políticas.

---

## 8. Análisis de loops

| Loop | Ubicación | Causa | Probabilidad | Impacto | Prevención actual | Recomendación |
|---|---|---|---|---|---|---|
| **A) Agentes** frontend-agent ↔ frontend-template-agent | `.agents/guardian/policies.json` forbidden_cycles | Solicitudes cruzadas de UI | Media | Media | forbidden_cycles declarado | Hacerlo chequeable por script |
| **B) Agentes** backend-agent ↔ db-agent | `.agents/guardian/policies.json` forbidden_cycles | Cambios de esquema requieren cambios de código | Alta | Alta | forbidden_cycles declarado | Integrar con MCP para detectar dependencias reales |
| **C) Planificación** plan → execute → replan | Plan Mode manual | Plan no concreto o cambios de scope | Media | Alta | Requiere aprobación del usuario | Limitar replanificaciones explícitas |
| **D) Herramientas** error → retry → error | Cualquier agente | Reintentos sin backoff | Media | Media | Sin mecanismo | Circuit breaker + max_retries |
| **E) Delegación** agent → subagent → subagent | Uso de `Agent` | Prompts amplios | Media | Alta | `max_handoffs_per_task: 5` | Limitar profundidad real en runtime |
| **F) Recuperación** failure → retry → failure | Scripts/tests | Reintentos infinitos en bucles | Baja | Alta | Sin mecanismo | Exponential backoff + max_retries |
| **G) Semántico** trabajo sin progreso | Tareas grandes mal divididas | Falta de criterios de éxito binarios | Media | Alta | Criterios KERNEL | Validar entregables antes de continuar |
| **H) DCOP** optimize → modifica memoria → optimize | `scripts/optimize.mjs` | Puede llamarse repetidamente | Baja | Baja | Umbral 70% | Agregar cooldown o idempotencia |

### Límites propuestos (sin implementar)

```
max_iterations: 5 por planificación
max_agent_depth: 3 subagentes anidados
max_handoffs: 5 (ya existe en policies.json)
max_tool_calls: 50 por turno
max_retries: 3 con backoff
max_execution_time: 30 min por tarea
```

---

## 9. Análisis de contexto y tokens

### Clasificación de información cargada

| Información | Tipo | Ubicación | Tokens estimados | Problema |
|---|---|---|---|---|
| Project brief, stack, fases | SYSTEM/PROJECT | `.devhive/project-brief.md` | ~600 | Esencial |
| Convenciones core/backend/frontend/db/deploy/test/auth/agents | PROJECT | `.devhive/conventions*.md` | ~2.500 | Esencial pero repetido entre agentes |
| Current sprint | STATE | `.devhive/current-sprint.md` | ~500 | Esencial |
| SKILL.md propio + SKILL-BASE + MASTER/guardian parcial | TASK/STATE | `.agents/{agent}/SKILL.md` | ~1.500-2.000 por agente | Repetido; cada agente carga mucho contexto genérico |
| Active-tasks, queue, blockers | STATE | `.agents/{agent}/memory/` | ~150 por archivo × 33 archivos hot = ~5.000 | Demasiados archivos hot activos |
| Knowledge graph queries hot | KNOWLEDGE | `queries.md` | ~350 | Apunta a proyecto incorrecto |
| Knowledge graph edges | KNOWLEDGE | `edges.md` | ~220 | Contiene relaciones conceptuales de otro proyecto |
| Graph stubs | KNOWLEDGE | `.agents/knowledge-graph-agent/memory/graph/*.md` | ~3.700 (74×50) | OK si se consultan bajo demanda |
| Session state, context-policy, aliases | STATE | `.agents/memory/` | ~600 | Necesario pero crece |

### Mayor desperdicio de tokens

1. **Carga de L0-L3 completa en cada agente**: convenciones y reglas genéricas se repiten.
2. **33 archivos hot en session-state**: cada agente tiene active-tasks/queue/blockers marcados P1 aunque no estén en uso activo.
3. **SKILL.md como prompts estáticos**: no hay resumen dinámico ni cache.
4. **queries.md hot con comandos incorrectos**: si un agente los ejecuta, obtendrá errores y reintentará, desperdiciando más tokens.

### Recomendación de contexto

- Mantener en contexto: tarea actual + estado + contexto relevante.
- Mover a MCP/resources: decisiones, arquitectura, queries canónicas.
- Convertir en artifacts: plan de implementación, reporte de tests, decision-log.
- Archivar: completed-tasks, learnings antiguos.

---

## 10. Análisis de estado y artifacts

### Estado actual

- **Texto/contexto**: los agentes se comunican mediante archivos Markdown y prompts.
- **No hay artifact store estructurado** (no existe `requirements.json`, `architecture.json`, `decision-log.json`, `test-report.json`).
- **Checkpoints**: `scripts/checkpoint.mjs` copia archivos a `.agents/memory/archive/checkpoints/`.
- **Session-state**: `scripts/resume.mjs` reconstruye contexto mínimo.

### Gaps

- No hay schema de artifacts.
- No hay versionado de artifacts.
- No hay referencias UUID entre tareas y entregables.
- No hay separación clara entre "resultado de agente" y "artefacto del proyecto".

---

## 11. Control de ejecución

| Mecanismo | Existe | Dónde | Cómo funciona | Limitaciones |
|---|---|---|---|---|
| Checkpoint | ✅ | `scripts/checkpoint.mjs` | Copia memoria y L0-L3 a timestamped dir | Manual; no rollback automático |
| Retry | ⚠️ | Políticas + host | Reintentos implícitos en errores de tool | Sin backoff ni max_retries forzado |
| Timeout | ⚠️ | Host Kimi (60-300s foreground, 600s+ background) | Tiempo límite por tool call/swarm | No configurable por agente |
| Cancellation | ✅ | `TaskStop`, Ctrl-C | Interrupción manual | No automática ante stalls |
| Rollback | ❌ | — | — | No existe |
| Circuit breaker | ❌ | — | — | No existe |
| Human approval | ✅ | `EnterPlanMode` / `ExitPlanMode`, `AskUserQuestion` | Host pregunta al usuario | No enlazado a `require_approval_for` de policies.json |
| Resumable execution | ⚠️ | `scripts/resume.mjs` | Carga session-state | Manual; no reanuda subagentes automáticamente |
| Stall detection | ⚠️ | `.agents/guardian/scripts/detect-stall.mjs` | Script offline sobre audit.log | No ejecuta automáticamente en runtime |

---

## 12. Observabilidad

| Métrica | Disponible | Fuente | Notas |
|---|---|---|---|
| Prompt ejecutado | ⚠️ | Implicit en audit.log | No incluye versión |
| Versión del prompt | ❌ | — | No hay versionado |
| Agente | ✅ | Audit log | Formato manual |
| Modelo utilizado | ❌ | — | No registrado |
| Tokens entrada/salida | ❌ | — | No hay métricas reales |
| Herramientas utilizadas | ⚠️ | Audit log/actions | No completo |
| Número de llamadas | ⚠️ | Audit log/optimization.log | Parcial |
| Duración | ❌ | — | No registrada |
| Errores | ✅ | blockers.md + markers | Requiere markers explícitos |
| Retries | ❌ | — | No registrado |
| Handoffs | ⚠️ | Handoff tickets manuales | No trazable automáticamente |
| Costo estimado | ❌ | — | No existe |
| Checkpoint | ✅ | `session-state.md` + checkpoints | Sí |
| Versión de Skill | ❌ | — | No versionado |
| Versión de MCP | ⚠️ | `mcp-status.md` | Manual, puede estar stale |

### Conclusión

La observabilidad es **manual y fragmentada**. No hay telemetría de costos, tokens, modelos ni duración.

---

## 13. Seguridad

### Permisos por agente

- `policies.json` define `allowed_file_patterns`, `denied_file_patterns`, `require_approval_for`, `max_file_size_mb`, `token_ttl_minutes`, `max_concurrent_tokens`.
- Reglas globales: no modificar `.env*`, no leer `certs/server.key`, no ejecutar `rm -rf /`, etc.

### Problemas

- **No hay enforcement técnico**: todo depende de que el LLM respete las instrucciones del SKILL.md.
- **Inconsistencia de paths**: algunos skills referencian `/workspace/flujo-autentificacion`.
- **El backend-agent no puede tocar auth.py**, pero `models.py` y `database.py` sí están en su scope, lo que permite alterar tablas de auth indirectamente.
- **db-agent** puede escribir `scripts/*.sql` y `init.sql` sin un scope tan restringido como el código.
- **docs-agent** tiene scope `./` y puede escribir `*.md` en cualquier lugar salvo `src/`, `frontend/src/`, `scripts/`.

### Clasificación de herramientas (R0-R5)

| Tool | Riesgo | Notas |
|---|---|---|
| Read | R0 | Lectura segura, excepto secretos |
| Grep/Glob | R1 | Análisis |
| mcp__codebase-memory__* | R1/R2 | Lectura/gráfico |
| Agent/AgentSwarm | R3/R4 | Delegación que puede modificar código |
| Bash | R4 | Ejecución externa |
| Write/Edit | R3/R5 | Modificación irreversible si no hay backup |
| AskUserQuestion | R1 | Generación de opciones |

### Acciones que deberían requerir aprobación humana

- Modificación de `.env*` o secretos.
- Cambio de base de datos (`init.sql`, `models.py`, migraciones).
- Cambio de autenticación/TOTP/JWT.
- Cambio de imagen base Docker o puertos expuestos.
- Ejecución de `DROP`, `DELETE`, `rm -rf`, `docker system prune`.

---

## 14. Arquitectura objetivo (complementar Kimi Code)

| Componente | ¿Ya existe? | ¿Parcial? | ¿Falta? | ¿Kimi lo resuelve? | Acción recomendada |
|---|---|---|---|---|---|
| AI Gateway | ❌ | — | ✅ | Parcial (host tools) | Configurar alias claros |
| Task Router | ❌ | — | ✅ | Parcial | Implementar en Guardian script |
| Agent Registry | ⚠️ | ✅ (profile.yaml) | — | No | Refactorizar profile.yaml a registry |
| Prompt Registry | ⚠️ | ✅ (templates) | — | No | Versionar templates |
| Knowledge Router | ❌ | — | ✅ | No | Integrar MCP con DevHive |
| MCP Router | ❌ | — | ✅ | No | Definir qué tools por agente |
| Context Manager | ⚠️ | ✅ (DCOP) | — | Parcial | Mejorar presupuesto real |
| Token Budget Manager | ❌ | — | ✅ | No | Implementar límite por turno |
| Loop Controller | ⚠️ | ✅ (detect-stall) | — | Parcial | Integrar a runtime |
| Checkpoint Manager | ⚠️ | ✅ (checkpoint.mjs) | — | Parcial | Automatizar en cambios riesgosos |
| Artifact Store | ❌ | — | ✅ | No | Crear schema de artifacts JSON |
| Validation Engine | ⚠️ | ✅ (validate-devhive) | — | Parcial | Extender a tests y lint |
| Observability | ❌ | — | ✅ | No | Agregar métricas de tokens/tiempo |
| Evaluation Engine | ❌ | — | ✅ | No | Tests automáticos de agentes |

---

## 15. Matriz de gaps

| Capacidad | Existe | Kimi lo resuelve | Falta | Prioridad | Acción |
|---|---|---|---|---|---|
| Consistencia de workspace y nombres de proyecto | Parcial | No | Sí | **P0** | Corregir todas las referencias a `/workspace/flujo-autentificacion` |
| Integración MCP con nombre correcto | Parcial | No | Sí | **P0** | Actualizar queries.md, SKILL.md y reindexar |
| Indexación de infraestructura agentic en MCP | No | No | Sí | **P0** | Incluir `.agents/`, `.devhive/`, `scripts/`, `docs/` en índice |
| Skill invocables para agentes | No | Parcial | Sí | **P1** | Convertir SKILL.md a skills reutilizables o al menos stubs |
| Control de loops en runtime | Parcial | Parcial | Sí | **P1** | Integrar detect-stall y max_steps |
| Presupuesto de tokens real | No | No | Sí | **P1** | Implementar contador por turno/agente |
| Artifact store estructurado | No | No | Sí | **P1** | Definir schema JSON para artifacts |
| Observabilidad de costos/tiempo | No | No | Sí | **P2** | Logger de tokens, duración, modelo |
| MCP Router / Tool permissions | No | No | Sí | **P2** | Mapear tools permitidas por agente |
| Validation engine completa | Parcial | No | Sí | **P2** | Extender validate-devhive a tests/lint |
| Evaluation engine | No | No | Sí | **P3** | Tests de comportamiento de agentes |
| AI Gateway/Task Router | No | Parcial | Sí | **P3** | Script de enrutamiento por intención |

---

## 16. Riesgos principales

1. **Descontextualización de agentes**: referencias a workspace y proyecto incorrectos pueden hacer que los agentes tomen decisiones en el repo equivocado.
2. **MCP no fiable para arquitectura agentic**: al excluir `.agents/` y `.devhive/`, MCP no puede responder preguntas sobre la propia infraestructura.
3. **Loop de reintentos con MCP**: si `docker exec codebase-memory-mcp` falla, los agentes reintentarán comandos incorrectos.
4. **Sobrecarga de contexto**: 33 archivos hot + L0-L3 + SKILL largos saturan el contexto sin aportar valor por turno.
5. **Falta de enforcement de seguridad**: las políticas son prompts; no hay sandbox técnico.
6. **No hay rollback**: un agente puede dejar el repo en estado inconsistente.
7. **Fragmentación de conocimiento**: decisiones en `.devhive/decisions/`, edges en `.agents/knowledge-graph-agent/memory/`, learnings en cada agente.
8. **Dependencia de scripts manuales**: optimize/checkpoint/resume no se ejecutan solos.
9. **Skills no invocables**: el sistema DevHive no aprovecha las capabilities de skills de Kimi.
10. **Observabilidad ciega**: no se sabe cuántos tokens cuesta realmente cada swarm.

---

## 17. Recomendaciones vinculadas a evidencia real

### R1: Corregir referencias de workspace y proyecto

```
PROBLEMA: Los agentes pueden operar bajo CWD incorrecto.
EVIDENCIA: .agents/SKILL-BASE.md L29, .agents/guardian/templates/deliverable-template.md L15, .agents/knowledge-graph-agent/SKILL.md L21 usan /workspace/flujo-autentificacion.
IMPACTO: Alto. Los agentes podrían leer/escribir fuera del repo o confundirse.
SOLUCIÓN: Reemplazar todas las referencias por /workspace/cutternest-kit. Actualizar templates hbs.
BENEFICIO: Consistencia y seguridad.
COMPLEJIDAD: Baja.
PRIORIDAD: P0.
```

### R2: Sincronizar nombre de proyecto MCP

```
PROBLEMA: Las recetas MCP apuntan a un proyecto inexistente.
EVIDENCIA: .agents/knowledge-graph-agent/SKILL.md L24 y .agents/knowledge-graph-agent/memory/queries.md usan workspace-flujo-autentificacion.
IMPACTO: Alto. Las queries MCP fallarán y los agentes reintentarán.
SOLUCIÓN: Reemplazar por cutternest-kit o workspace-cutternest-kit según profile.yaml.
BENEFICIO: MCP-first funciona realmente.
COMPLEJIDAD: Baja.
PRIORIDAD: P0.
```

### R3: Indexar infraestructura agentic en MCP

```
PROBLEMA: MCP no conoce la arquitectura agentic.
EVIDENCIA: index_repository excluyó .agents/, .devhive/, docs/, scripts/.
IMPACTO: Medio. No se puede preguntar a MCP sobre el propio sistema DevHive.
SOLUCIÓN: Reindexar en modo full incluyendo esos directorios (salvo secretos y binarios).
BENEFICIO: Arquitectura propia consultable por MCP.
COMPLEJIDAD: Media.
PRIORIDAD: P0.
```

### R4: Crear un agent registry liviano

```
PROBLEMA: profile.yaml mezcla metadatos, stack y agentes.
EVIDENCIA: .devhive/profile.yaml líneas 116-132 declaran enabled agents y plugins.
IMPACTO: Difícil escalar y validar.
SOLUCIÓN: Extraer a .agents/registry.json o sección `agent_registry` con TTL, scopes, tools.
BENEFICIO: Single source of truth para orquestación.
COMPLEJIDAD: Media.
PRIORIDAD: P1.
```

### R5: Convertir SKILL.md en skills invocables o stubs

```
PROBLEMA: Los SKILL.md son prompts estáticos largos.
EVIDENCIA: backend-agent/SKILL.md 109 líneas, frontend-agent/SKILL.md 109 líneas, auth-agent/SKILL.md 118 líneas.
IMPACTO: Cada agente carga ~1.500-2.000 tokens de reglas genéricas.
SOLUCIÓN: Mover reglas comunes a SKILL-BASE.md (ya existe) y dejar en SKILL.md solo addendum. Considerar crear skills Kimi reales.
BENEFICIO: Menor contexto por agente, menos duplicación.
COMPLEJIDAD: Media.
PRIORIDAD: P1.
```

### R6: Implementar presupuesto de tokens real

```
PROBLEMA: DCOP solo estima bytes, no tokens de LLM.
EVIDENCIA: scripts/lib/dcop-utils.mjs L20 CONTEXT_BUDGET_BYTES=200000 y approximateTokens divide longitud/6.
IMPACTO: No se sabe cuánto contexto consume realmente cada turno.
SOLUCIÓN: Usar un tokenizer real o contador de mensajes del host. Definir presupuesto por agente y tarea.
BENEFICIO: Evitar saturación de contexto y costos.
COMPLEJIDAD: Media-Alta.
PRIORIDAD: P1.
```

### R7: Integrar detect-stall al runtime

```
PROBLEMA: La detección de stalls es un script manual.
EVIDENCIA: .agents/guardian/scripts/detect-stall.mjs no se ejecuta automáticamente.
IMPACTO: Los loops no se detectan hasta que alguien corre el script.
SOLUCIÓN: Ejecutar detect-stall periódicamente (cron/background) o al final de cada swarm. Integrar con audit.log.
BENEFICIO: Recuperación proactiva de loops.
COMPLEJIDAD: Media.
PRIORIDAD: P1.
```

### R8: Definir artifact store

```
PROBLEMA: No hay lugar estructurado para artifacts.
EVIDENCIA: No existe requirements.json, decision-log.json, test-report.json ni schema.
IMPACTO: Los agentes pasan resultados como texto, desperdiciando tokens.
SOLUCIÓN: Crear .artifacts/ con schema JSON: task-id, parent, type, version, path, hash.
BENEFICIO: Referencias compactas entre agentes, trazabilidad.
COMPLEJIDAD: Media.
PRIORIDAD: P1.
```

### R9: Implementar observabilidad mínima

```
PROBLEMA: No hay métricas de tokens, duración ni modelo.
EVIDENCIA: No se encontró logger de tokens; audit.log solo registra decisiones manuales.
IMPACTO: No se puede optimizar ni auditar costos.
SOLUCIÓN: Añadir a cada entregable: tokens in/out, modelo, duración, herramientas usadas.
BENEFICIO: Datos para optimización.
COMPLEJIDAD: Baja-Media.
PRIORIDAD: P2.
```

### R10: Validar DevHive en CI

```
PROBLEMA: validate-devhive no se ejecuta automáticamente.
EVIDENCIA: scripts/validate-devhive.mjs existe pero no hay workflow de GitHub Actions.
IMPACTO: Inconsistencias entre profile.yaml y templates pasan desapercibidas.
SOLUCIÓN: Añadir job `.github/workflows/devhive.yml` con validate-devhive + guardrails-dry-run.
BENEFICIO: Calidad de la infraestructura agentic.
COMPLEJIDAD: Baja.
PRIORIDAD: P2.
```

### R11: Implementar MCP/Tool router

```
PROBLEMA: Cualquier agente puede invocar cualquier tool del host.
EVIDENCIA: policies.json no mapea tools permitidas por agente.
IMPACTO: Riesgo de que un agente use tools fuera de su alcance.
SOLUCIÓN: Añadir `allowed_tools` y `denied_tools` por agente en registry/policies.
BENEFICIO: Menor superficie de ataque y errores.
COMPLEJIDAD: Media-Alta.
PRIORIDAD: P2.
```

### R12: Añadir tests para scripts DCOP

```
PROBLEMA: optimize/checkpoint/resume no tienen tests.
EVIDENCIA: No se encontraron tests de scripts/.
IMPACTO: Un bug en DCOP puede corromper memorias.
SOLUCIÓN: Crear tests unitarios para dcop-utils.mjs y scripts con casos de backup/compress.
BENEFICIO: Robustez del sistema de memoria.
COMPLEJIDAD: Media.
PRIORIDAD: P2.
```

---

## 18. Top 10 cambios de mayor ROI

1. **Corregir referencias a workspace/proyecto** (P0, bajo esfuerzo): elimina riesgo de descontextualización inmediata.
2. **Sincronizar nombre MCP** (P0, bajo esfuerzo): hace usable el knowledge graph.
3. **Reindexar MCP con infraestructura agentic** (P0, esfuerzo medio): permite auditar la propia arquitectura.
4. **Reducir SKILL.md a addendum** (P1, esfuerzo medio): ahorra ~30-40% de contexto por agente.
5. **Definir artifact store JSON** (P1, esfuerzo medio): reduce tokens de handoff y mejora trazabilidad.
6. **Integrar detect-stall al runtime** (P1, esfuerzo medio): previene loops.
7. **Implementar presupuesto de tokens real** (P1, esfuerzo medio-alto): controla costos.
8. **Crear registry de agentes** (P1, esfuerzo medio): simplifica orquestación y permisos.
9. **Añadir observabilidad mínima** (P2, esfuerzo bajo): habilita optimización posterior.
10. **Validar DevHive en CI** (P2, esfuerzo bajo): previene regresiones de consistencia.

**Pregunta clave:** ¿Qué deberíamos cambiar primero para obtener el mayor beneficio con el menor esfuerzo?  
**Respuesta:** Corregir las referencias del workspace y del proyecto MCP, y reindexar MCP con la infraestructura agentic. Son 3 cambios de bajo-medio esfuerzo que desbloquean todo lo demás.

---

## 19. Plan de implementación por fases

### Fase A — Correcciones críticas (1-2 días)
- [ ] Reemplazar `/workspace/flujo-autentificacion` por `/workspace/cutternest-kit` en todos los archivos.
- [ ] Reemplazar `workspace-flujo-autentificacion` por `cutternest-kit` en `queries.md`, `edges.md`, `knowledge-graph-agent/SKILL.md`.
- [ ] Re-renderizar templates con `node scripts/render-devhive-templates.mjs` (cuando se restaure).
- [ ] Ejecutar `node scripts/validate-devhive.mjs` y corregir errores.

### Fase B — MCP y conocimiento (2-3 días)
- [ ] Reindexar MCP en modo full incluyendo `.agents/`, `.devhive/`, `scripts/`, `docs/`.
- [ ] Actualizar stubs del knowledge graph y relaciones críticas.
- [ ] Restaurar o reemplazar `scripts/audit-stub-tokens.mjs`.

### Fase C — Orquestación y control (3-5 días)
- [ ] Crear `.agents/registry.json` o refactorizar `profile.yaml`.
- [ ] Integrar `detect-stall.mjs` en flujo de cierre de swarm.
- [ ] Definir `max_iterations`, `max_retries`, `max_tool_calls` por agente.
- [ ] Implementar token budget manager.

### Fase D — Artifacts y observabilidad (3-5 días)
- [ ] Definir schema de artifacts en `.artifacts/schema.json`.
- [ ] Añadir logger de tokens/duración/modelo en entregables.
- [ ] Implementar `.github/workflows/devhive.yml`.

### Fase E — Evaluación y maduración (continuo)
- [ ] Tests unitarios para scripts DCOP.
- [ ] Tests de comportamiento de agentes (simulación de tareas).
- [ ] MCP/Tool router con `allowed_tools`.

---

## 20. Conclusión

El sistema agentic de CutterNest está **bien documentado pero aún depende de la disciplina manual del LLM y del operador**. Kimi Code provee las capacidades de ejecución (Agent, Swarm, MCP, Goal, Plan), mientras que DevHive aporta convenciones, prompts y utilidades. La brecha principal está en la **integración real**: consistencia de nombres, indexación MCP, control de loops, presupuesto de tokens y observabilidad.

No se recomienda reemplazar Kimi Code ni reconstruir un orquestador externo completo. La estrategia óptima es **refinar la capa DevHive existente**, corregir las inconsistencias críticas y automatizar progresivamente los guardrails.

---

*Fin de la auditoría. No se realizaron cambios en el repositorio.*
