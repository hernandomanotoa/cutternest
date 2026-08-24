# Guía de Uso del Equipo de Agentes — CutterNest

**Versión:** 1.0  
**Fecha:** 2026-08-21  
**Proyecto:** CutterNest (`/workspace/cutternest-kit`)  
**Sistema de agentes:** DevHive v2.2.1

---

## 1. ¿Qué es el equipo de agentes?

CutterNest usa **DevHive**, un sistema de agentes especializados coordinados por un **Guardian**. Cada agente tiene un rol concreto, un scope de archivos permitido y herramientas autorizadas. El Guardian decide (o tú decides, con su ayuda) qué agente es el más adecuado para cada tarea, controla handoffs y aplica guardrails contra loops y sobreconsumo de tokens.

No es obligatorio usar el sistema de agentes para todo: puedes pedir cambios directamente a Kimi Code. Sin embargo, para tareas multi-archivo, refactorizaciones o cuando el contexto crece, delegar en el agente correcto mejora la precisión y reduce el costo de tokens.

---

## 2. Agentes disponibles

| Agente | Rol | Scope principal | Cuándo usarlo |
|--------|-----|-----------------|---------------|
| **architect** | Planificación y arquitectura | `.devhive/`, `.agents/*/SKILL.md` | Antes de un refactor grande, cambios de diseño, nuevos módulos o decisiones técnicas. |
| **backend-agent** | API y lógica de negocio | `backend/app/**/*.py` | Endpoints, modelos Pydantic, servicios, optimizador, cotizaciones, inventario. |
| **frontend-agent** | Interfaz y 3D | `frontend/src/**/*.tsx`, `*.ts`, `*.css` | Componentes React, hooks, Three.js, Tailwind, Zustand, páginas. |
| **db-agent** | Esquema y migraciones | `init.sql`, `backend/app/models.py`, scripts SQL | Cambios de schema, migraciones, índices, consultas SQL. |
| **auth-agent** | Seguridad y autenticación | `backend/app/auth.py`, `models.py`, `database.py` | JWT, TOTP, Guest PIN, sesiones, roles, hashing. |
| **deploy-agent** | Infraestructura Docker | `docker-compose*.yml`, Dockerfiles, `nginx.conf`, `scripts/*.sh` | Builds, compose, redes, volúmenes, despliegues. |
| **test-agent** | Calidad y tests | `backend/tests/**/*.py`, `frontend/**/*.test.ts(x)` | Tests unitarios, de integración, cobertura, Vitest/pytest. |
| **docs-agent** | Documentación | `*.md`, `docs/**` | READMEs, guías, ADRs, OpenAPI, manuales. |
| **knowledge-graph-agent** | Arquitectura e impacto | `.agents/knowledge-graph-agent/memory/graph/*.md` | Consultas de arquitectura, impacto de cambios, MCP graph. |
| **guardian** | Orquestador y permisos | `.agents/`, `.devhive/` | Delegación, validación de handoffs, checkpoints, optimización de contexto. |

### Plugins (especialistas on-demand)

| Plugin | Cuándo activarlo |
|--------|------------------|
| **code-reviewer** | Revisión de PR/diff, detectar regresiones, sugerencias de estilo. |
| **dependency-checker** | Cambios en `requirements*.txt`, `package.json`, lockfiles, seguridad de dependencias. |
| **integration-validator** | Validación final tras un swarm o cambio multi-agente. Corre tests y verifica entregables. |
| **ui-ux-agent** | Nuevos patrones visuales, modales, tablas, formularios, tokens 3D. |

---

## 3. Flujo de trabajo recomendado

### 3.1 Para tareas pequeñas (1-3 archivos)

Pide directamente el cambio. No necesitas nombrar agentes. Ejemplo:

> "Corrige el cálculo de kerf en `backend/app/optimizer.py` para que reste el ancho de la hoja."

### 3.2 Para tareas medianas o especializadas

Pide al Guardian que asigne el agente adecuado:

> "@guardian Necesito agregar validación de stock antes de generar una cotización. ¿Qué agente debería encargarse y cuál es el plan?"

El Guardian revisará el scope y podrá delegar a `backend-agent` o iniciar un handoff controlado.

### 3.3 Para refactorizaciones grandes o multi-agente

1. Pide un plan al **architect**.
2. El architect define tareas y agentes.
3. Cada agente ejecuta su parte.
4. El **integration-validator** o **guardian** revisa el resultado.
5. Se ejecuta `#checkpoint` antes y después.

---

## 4. Comandos DevHive (DCOP)

Estos comandos pueden usarse como prompts a Kimi o ejecutarse directamente desde la terminal.

| Comando | Script | Para qué sirve |
|---------|--------|----------------|
| `#checkpoint [etiqueta]` | `node scripts/checkpoint.mjs` | Guarda el estado actual de memoria y `session-state.md`. Úsalo antes de cambios grandes o al cambiar de agente. |
| `#optimize` | `node scripts/optimize.mjs` | Comprime memoria fría (`learnings.md`, `completed-tasks.md`) cuando el contexto supera el 70 %. También actualiza `optimization.log`. |
| `#resume` | `node scripts/resume.mjs` | Muestra el estado de la sesión: contexto, errores, archivos modificados, próximo paso. |
| `#handoff <agente>` | Manual / Guardian | Transfiere el control a otro agente. El Guardian verifica ciclos prohibidos y límites. |

### Ejemplos de uso en terminal

```bash
# Antes de una sesión larga
node scripts/checkpoint.mjs pre-refactor-login

# Cuando el contexto crece o cambias de agente
node scripts/optimize.mjs --force

# Ver estado actual
node scripts/resume.mjs
```

---

## 5. Validación y salud del sistema

Antes de iniciar una sesión de agentes o después de un cambio importante, ejecuta:

```bash
# Validación rápida (perfil, agentes, templates)
node scripts/validate-devhive.mjs

# Validación completa (scripts DCOP, stubs, ADRs, estado reciente)
node scripts/validate-devhive-full.mjs

# Auditoría de stubs del knowledge graph
node scripts/audit-stub-tokens.mjs

# Guardrails de loops y handoffs
node .agents/guardian/scripts/guardrails-dry-run.mjs

# Tests de scripts DevHive
node scripts/run-tests.mjs
```

**Recomendación:** si `validate-devhive-full.mjs` falla por `optimization.log` antiguo, ejecuta `node scripts/optimize.mjs --force`.

---

## 6. Convenciones de memoria y handoffs

### Archivos de memoria por agente

Cada agente tiene una carpeta `.agents/{agente}/memory/` con estos archivos canónicos:

| Archivo | Propósito |
|---------|-----------|
| `active-tasks.md` | Tarea actual, checkpoints, próximo paso. Es **hot memory**: siempre se carga. |
| `queue.md` | Cola de tareas pendientes. |
| `blockers.md` | Bloqueadores activos marcados con `[BLOCKER]`, `[ACTIVE_ERROR]` o `[CRITICAL]`. |
| `learnings.md** | Lecciones acumuladas. Se comprime automáticamente si supera 50 líneas. |
| `completed-tasks.md` | Tareas terminadas. Se archiva automáticamente si supera 50 líneas. |

### Reglas de handoff

1. **Siempre guarda un checkpoint** antes de transferir a otro agente.
2. **No crees ciclos prohibidos:** el Guardian bloquea handoffs como `backend-agent ↔ db-agent` directos.
3. **Incluye un resumen** de lo hecho, errores abiertos y el próximo paso.
4. **Máximo 5 handoffs por tarea.** Si se necesitan más, el Guardian marcará stall.

### Plantilla de handoff

```markdown
## Handoff to: frontend-agent

### Contexto
Refactor de autenticación en backend completado. El endpoint `/api/v1/auth/login` ahora devuelve `user` + `tokens`.

### Entregables
- `backend/app/auth.py` (modificado)
- `backend/app/models.py` (campo `last_login` añadido)

### Bloqueadores
Ninguno.

### Próximo paso
Actualizar el hook `useAuth` en `frontend/src/hooks/useAuth.ts` para consumir la nueva respuesta.
```

---

## 7. Presupuesto de tokens y eficiencia

### Límites configurados

```yaml
# config/runtime-config.yaml
runtime:
  max_iterations: 15
  max_tool_calls: 50
  max_execution_time_seconds: 120

retry:
  max_retries: 3
  backoff_strategy: exponential

circuit_breaker:
  failure_threshold: 5
  recovery_timeout_seconds: 60
```

### Presupuestos por tipo de tarea

| Tipo | Tokens estimados | Ejemplo |
|------|-----------------|---------|
| **simple** | 4 000 | "Corrige un typo en un componente" |
| **multi** | 8 000 | "Refactoriza 3 componentes relacionados" |
| **swarm** | 16 000 | "Refactoriza backend + frontend + tests" |

### Cómo verificar el presupuesto

```bash
node scripts/token-budget.mjs --agent=backend-agent --task="fix login bug"
node scripts/token-budget.mjs --agent=frontend-agent --type=multi --task="refactor AssemblyPage"
```

### Consejos para ahorrar tokens

1. **MCP-first:** para preguntas de arquitectura o impacto, pide al `knowledge-graph-agent` que use `codebase-memory-mcp`.
2. **Contexto mínimo:** el `context-manager` selecciona solo L0-L3 + skill + active-tasks relevantes.
3. **Comprime memoria fría:** ejecuta `#optimize` regularmente.
4. **Evita handoffs innecesarios:** si la tarea cabe en un solo agente, no la fragmentes.
5. **Usa la plantilla KERNEL** en `.agents/TEMPLATE-KERNEL.md` para pedidos complejos.

---

## 8. Ejemplos de prompts por agente

### architect
> "Diseña la integración entre el optimizador de cortes y el inventario de sobrantes. Quiero un plan con archivos afectados y riesgos."

### backend-agent
> "Agrega un endpoint `/api/v1/inventory/scrap` para registrar sobrantes de tablero. Usa Pydantic v2 y SQLAlchemy. Añade tests en `backend/tests/`."

### frontend-agent
> "Crea un componente `StockPanel` en `frontend/src/components/inventory/StockPanel.tsx` que muestre sobrantes en una tabla con Tailwind."

### db-agent
> "Necesito una migración para añadir la tabla `scrap_stock` con campos `id`, `material`, `dimensions`, `quantity`, `created_at`."

### auth-agent
> "Revisa `backend/app/auth.py`: el Guest PIN debe expirar a los 5 minutos sin uso y la sesión a las 4 horas. Asegúrate de que se guarde hash, no texto plano."

### deploy-agent
> "Actualiza `docker-compose.yml` para montar `./data` en `/app/data` y expón el puerto 8000 solo en la red interna."

### test-agent
> "Escribe tests de pytest para `backend/app/optimizer.py` cubriendo `PIECE_TOO_LARGE` y sobrantes."

### docs-agent
> "Actualiza `docs/Guia_Cotizacion.md` con el nuevo flujo de stock de sobrantes."

### knowledge-graph-agent
> "¿Qué archivos dependen de `backend/app/optimizer.py`? Usa el graph MCP."

---

## 9. Ciclo de vida de una tarea

```
┌─────────────────┐
│ 1. Checkpoint   │ ← Guarda estado actual
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. Asignación   │ ← Guardian elige agente
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. Ejecución    │ ← Agente trabaja con su scope
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. Validación   │ ← Tests + validate-devhive
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. Handoff /    │ ← Si aplica, transferencia controlada
│    Cierre       │
└─────────────────┘
```

---

## 10. Qué NO hacer

- **No edites `.agents/guardian/policies.json`, `.agents/registry.json` ni `AGENTS.md`** a menos que sepas exactamente qué estás cambiando.
- **No modifiques `.env`, `certs/*.key` ni datos persistentes** a través de los agentes.
- **No ignores los stalls:** si el Guardian detecta un loop, detente y revisa.
- **No hagas handoffs directos entre agentes prohibidos** (`backend-agent ↔ db-agent` está restringido).
- **No versiones secretos ni archivos de `data/`/`backups/`** en git.

---

## 11. Referencias rápidas

- Perfil del proyecto: `.devhive/profile.yaml`
- Registro de agentes: `.agents/registry.json`
- Políticas y guardrails: `.agents/guardian/policies.json`
- Guía para agentes de código: `AGENTS.md`
- Plantilla de tareas: `.agents/TEMPLATE-KERNEL.md`
- Plantilla de entregables: `.agents/guardian/templates/deliverable-template.md`
- Runtime config: `config/runtime-config.yaml`
- Scripts de soporte: `scripts/`

---

*Última actualización: 2026-08-21. Si cambias la arquitectura de agentes, actualiza esta guía.*
