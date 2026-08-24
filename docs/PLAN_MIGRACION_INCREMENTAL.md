# PLAN DE MIGRACIÓN INCREMENTAL — SISTEMA AGENTIC

**Basado en:** Auditoría Arquitectónica del Sistema Agentic Existente  
**Fecha:** 2026-08-21  
**Entorno:** Kimi Code Dockerizado  
**Restricción:** Fases pequeñas y reversibles. NO implementar sin aprobación previa.

---

## OBJETIVOS PRIORITARIOS

1. Reducir consumo de tokens.
2. Evitar loops.
3. Evitar pérdida de información.
4. Mejorar trazabilidad.
5. Mejorar recuperación ante errores.
6. Mantener las capacidades actuales de Kimi Code.
7. No romper Skills existentes.
8. No romper MCP existentes.
9. Evitar duplicar capacidades que Kimi ya proporciona.

---

## SECUENCIA DE IMPLEMENTACIÓN

---

## FASE 0 — BASELINE

**Objetivo:** Documentar estado actual antes de cualquier cambio. Crear punto de retorno.

| # | Tarea | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|-------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 0.1 | Crear snapshot Git de todo el repo | Todo `/mnt/agents/` y `/app/.agents/` | Todo | Ninguna | Ninguno | Punto de retorno seguro | 0 | `git log` muestra commit inicial | `git reset --hard` |
| 0.2 | Documentar métricas base (tokens, archivos, skills) | Nuevo: `docs/baseline-metrics.md` | Documentación | 0.1 | Ninguno | Línea base medible | 0 | Verificar archivo creado | `rm docs/baseline-metrics.md` |
| 0.3 | Crear rama Git `feat/audit-migration` | Git repo | Versionado | 0.1 | Ninguno | Aislamiento de cambios | 0 | `git branch` muestra rama | `git checkout main && git branch -D feat/audit-migration` |
| 0.4 | Inventariar Skills activas y su tamaño en tokens | Nuevo: `docs/skills-inventory.md` | Documentación | 0.2 | Ninguno | Visibilidad de carga de contexto | 0 | Contar palabras × 1.3 = tokens estimados | Eliminar archivo |

**Criterio de salida:** Todos los archivos de baseline creados y commit realizado en rama separada.

---

## FASE 1 — OBSERVABILIDAD

**Objetivo:** Ver antes de cambiar. Implementar logging y métricas sin modificar lógica de negocio.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 1.1 | **Reemplazar `print()` por `logging` en todos los scripts** | `scripts/*_tool.py` (×7): `image_generation_tool.py`, `audio_generation_tool.py`, `yahoo_finance_tool.py`, `world_bank_open_data_tool.py`, `sec_edgar_tool.py`, `scholar_tool.py`, `imf_tool.py` | Todos los plugins | Ninguna | Bajo | Logs estructurados, trazabilidad de ejecución, debuggable | 0 | Ejecutar cualquier script, verificar salida en `/mnt/agents/logs/` en formato JSON | Revertir commits de la fase |
| 1.2 | **Crear módulo `observability/logger.py`** | Nuevo: `observability/logger.py`, `observability/__init__.py` | Runtime | 1.1 | Bajo | Logging centralizado, formato consistente | 0 | `from observability import get_logger; logger = get_logger("test")` | Eliminar directorio `observability/` |
| 1.3 | **Agregar métricas de ejecución (tiempo, éxito/fallo, excepción)** | Nuevo: `observability/metrics.py` | Runtime | 1.2 | Bajo | Visibilidad de rendimiento y fiabilidad | 0 | Verificar archivo JSON de métricas en `/mnt/agents/logs/metrics/` | Eliminar archivo |
| 1.4 | **Crear decorators `@timed` y `@traced`** | Nuevo: `observability/decorators.py` | Runtime | 1.2 | Bajo | Tracing de funciones sin modificar su código | 0 | Aplicar `@timed` a una función, verificar duración en logs | Eliminar imports de decorators |
| 1.5 | **Log de tokens estimados por turno de conversación** | Nuevo: `observability/token_counter.py` | Context Manager | Ninguna | Bajo | Visibilidad de costo inmediata | 0 | Contar tokens en historial de chat con `tiktoken` o estimación por palabras | Eliminar archivo |
| 1.6 | **Crear dashboard de métricas simple (archivo JSON acumulativo)** | Nuevo: `observability/dashboard.json` | Runtime | 1.3, 1.5 | Bajo | Snapshot de salud del sistema | 0 | `cat observability/dashboard.json` muestra métricas acumuladas | Eliminar archivo |

**Criterio de salida:** Cada ejecución de tool deja traza en logs estructurados. Dashboard accesible.

---

## FASE 2 — CONTROL DE LOOPS

**Objetivo:** Prevenir ejecuciones infinitas y cascadas de fallos.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 2.1 | **Crear `config/runtime-config.yaml` con límites declarativos** | Nuevo: `config/runtime-config.yaml` | Runtime | Ninguna | Bajo | Control centralizado de límites | 0 | Verificar que Kimi respeta `max_iterations`, `max_tool_calls` definidos | Eliminar archivo |
| 2.2 | **Implementar `LoopController` con contador de iteraciones** | Nuevo: `controllers/loop_controller.py`, `controllers/__init__.py` | Runtime | 2.1 | Medio | Prevención de loops infinitos | Variable (evita miles de tokens en loops) | Forzar loop sintético, verificar aborto al alcanzar `max_iterations` | Eliminar directorio `controllers/` |
| 2.3 | **Agregar `max_retries=3` con backoff exponencial a scripts de plugins** | `scripts/*_tool.py` (×7) | Plugins | 1.1 | Bajo | +40% resiliencia ante fallos de red/API | 0 | Desconectar red temporalmente, verificar 3 reintentos con delay creciente | Revertir cambios en scripts |
| 2.4 | **Implementar Circuit Breaker por tool** | Nuevo: `controllers/circuit_breaker.py` | Runtime | 2.2 | Medio | Prevención de cascada de fallos | 0 | Forzar 3 fallos consecutivos en una tool, verificar que se "abre" el circuito | Eliminar archivo |
| 2.5 | **Agregar timeout por tool call (default 120s)** | `controllers/loop_controller.py` + `config/runtime-config.yaml` | Runtime | 2.1 | Medio | Prevención de ejecuciones colgadas | 0 | Ejecutar tool con `time.sleep(200)`, verificar timeout | Revertir config |

**Criterio de salida:** Ninguna tool puede ejecutarse más de `max_retries` veces ni más de `max_execution_time` segundos.

---

## FASE 3 — BUDGET / TOKEN CONTROL

**Objetivo:** Controlar costos y prevenir sobreconsumo.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 3.1 | **Crear `TokenBudgetManager` con presupuesto por sesión** | Nuevo: `budget/token_budget.py`, `budget/__init__.py` | Runtime | 1.5 | Medio | Control explícito de gasto de tokens | Variable (previene sobreconsumo) | Exceder budget artificialmente, verificar aborto graceful | Eliminar directorio `budget/` |
| 3.2 | **Implementar contador acumulativo por sesión (archivo JSON)** | Nuevo: `budget/session_tracker.json` | Runtime | 3.1 | Bajo | Visibilidad de gasto acumulado | 0 | Verificar que `session_tracker.json` incrementa con cada turno | Eliminar archivo |
| 3.3 | **Alerta al 80% del budget (warning en logs)** | `budget/token_budget.py` | Runtime | 3.1 | Bajo | Prevención proactiva antes de agotar | 0 | Forzar uso alto, verificar mensaje `WARNING: Token budget at 80%` | Revertir lógica de alerta |
| 3.4 | **Budget diferenciado por tipo de tool** | `budget/token_budget.py` + `config/runtime-config.yaml` | Plugins | 3.1 | Medio | Equidad de costos (image-gen más caro que data lookup) | Variable | Llamar image-gen, verificar que consume del bucket "expensive" | Revertir config |
| 3.5 | **Presupuesto por agente (cuando existan agentes definidos)** | `budget/token_budget.py` | Runtime | 7.1 (FASE 7) | Medio | Control granular de gasto | Variable | Definir agente con budget 1000 tokens, verificar límite | Revertir config |

**Criterio de salida:** Sistema rechaza ejecuciones que excederían el budget restante.

---

## FASE 4 — CONTEXT OPTIMIZATION

**Objetivo:** Reducir tokens base por turno.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 4.1 | **Crear `ContextManager` con selección dinámica de skills** | Nuevo: `context/context_manager.py`, `context/__init__.py` | Runtime | Ninguna | Medio | Solo cargar skills relevantes a la tarea | ~3,100 por tarea no financiera | Preguntar "¿Qué hora es?", verificar que NO se cargan skills de yahoo_finance, world_bank, etc. | Eliminar directorio `context/` |
| 4.2 | **Mover referencias grandes a MCP Resources (bajo demanda)** | `references/*.md` → nuevo MCP server | Knowledge | Ninguna | Medio | No cargar 25KB de routing-tables en cada turno | ~6,600 por tarea no relacionada | Consultar sobre widget, verificar que routing-tables NO está en contexto | Restaurar skills originales |
| 4.3 | **Resumir historial de chat después de N turnos** | `context/context_manager.py` | Runtime | 4.1 | Medio | Evitar crecimiento lineal del historial | Variable por sesión larga | Chat de 20 turnos, verificar que turnos 1-10 se resumen a 200 tokens | Revertir lógica |
| 4.4 | **Eliminar `help-center-urls.md` huérfano (no referenciado en SKILL.md)** | Eliminar: `references/help-center-urls.md` o mover a `archive/` | Knowledge | Ninguna | Bajo | Eliminar ~1,000 tokens muertos | ~1,000 | Verificar que skill help-center sigue funcional (usa routing-tables.md) | Restaurar archivo desde Git |
| 4.5 | **Comprimir skills de datos en template único con parámetros** | `skills/*/SKILL.md` (×5 datos) | Skills | Ninguna | Medio | Reducir 5 skills similares a 1 base + 5 overrides | ~2,500 por tarea de datos | Verificar que cada plugin sigue funcionando con su skill específica | Restaurar skills originales |
| 4.6 | **Lazy loading de icon manifest (34KB JSON)** | `kimi-widget/references/icons/manifest.json` | Skills | 4.2 | Medio | No cargar 34KB de iconos si no se piden | ~12,000 por tarea sin widgets | Generar widget sin iconos, verificar que manifest NO se carga | Revertir skill |

**Criterio de salida:** Tarea simple (ej: "hola") consume < 4,000 tokens base (vs ~10,000 actual).

---

## FASE 5 — ARTIFACT / STATE ARCHITECTURE

**Objetivo:** Persistir trabajo intermedio y evitar re-ejecución.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 5.1 | **Crear `ArtifactStore` con schemas JSON** | Nuevo: `artifacts/store.py`, `artifacts/schemas/`, `artifacts/__init__.py` | Runtime | Ninguna | Medio | Resultados estructurados, reutilizables | Variable (evita re-ejecución) | Generar imagen, verificar `artifacts/image-gen-{id}.json` creado | Eliminar directorio `artifacts/` |
| 5.2 | **Modificar scripts de plugins para emitir artifacts** | `scripts/*_tool.py` (×7) | Plugins | 5.1 | Medio | Output estructurado en lugar de texto plano | Variable | Ejecutar tool, verificar artifact en `artifacts/` | Revertir scripts |
| 5.3 | **Implementar `CheckpointManager` para estado de ejecución** | Nuevo: `state/checkpoint_manager.py`, `state/__init__.py` | Runtime | 5.1 | Medio | Recuperación de estado ante fallo | 0 | Forzar fallo a mitad de flujo, verificar resumen desde checkpoint | Eliminar directorio `state/` |
| 5.4 | **Schema de estado de ejecución (`execution_state.json`)** | Nuevo: `state/schemas/execution_state.json` | Runtime | 5.3 | Bajo | Estandarización del estado | 0 | Validar estado generado contra schema JSON | Eliminar archivo |
| 5.5 | **Cache de resultados de APIs de datos (TTL 1 hora)** | `state/cache.py` | Runtime | 5.1 | Medio | Evitar re-consultar datos idénticos | Variable (evita llamadas API redundantes) | Consultar mismo ticker 2 veces, verificar segunda usa cache | Eliminar archivo |

**Criterio de salida:** Resultados de tools son recuperables por ID. Estado de ejecución persistible.

---

## FASE 6 — MCP ROUTING

**Objetivo:** Unificar acceso a conocimiento y herramientas bajo MCP.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 6.1 | **Crear MCP server para referencias de conocimiento** | Nuevo: `mcp/knowledge_server.py`, `mcp/__init__.py` | Knowledge | 4.2 | Medio | Acceso bajo demanda a referencias | ~6,600 por tarea no relacionada | Query MCP: "dame design system", verificar respuesta parcial | Eliminar servidor |
| 6.2 | **Crear MCP server unificado para datos (reemplaza 5 plugins duplicados)** | Nuevo: `mcp/data_server.py` | Plugins | 2.3 | Alto | Reemplaza yahoo_finance, world_bank, sec_edgar, scholar, imf con 1 MCP | ~3,100 por tarea | Query datos vía MCP, verificar que funciona para todas las fuentes | Restaurar 5 plugins originales |
| 6.3 | **MCP Router con permisos por agente** | Nuevo: `mcp/mcp_router.py` | Runtime | 6.1, 6.2 | Alto | Seguridad granular: agente A solo ve tools de A | 0 | Verificar que agente "help" NO puede llamar image-gen | Eliminar router |
| 6.4 | **Exponer `design-system.md` y `routing-tables.md` como MCP Resources** | `mcp/knowledge_server.py` | Knowledge | 6.1 | Medio | Recuperación dinámica de conocimiento | Variable | Query resource por ID, verificar fragmento relevante | Revertir exposición |

**Criterio de salida:** Skills no cargan referencias grandes en contexto; se consultan vía MCP.

---

## FASE 7 — AGENT OPTIMIZATION

**Objetivo:** Definir agentes con responsabilidades claras y permisos granularizados.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 7.1 | **Crear `AGENTS.md` con definiciones de agentes** | Nuevo: `AGENTS.md` | Documentación | Ninguna | Bajo | Claridad arquitectónica, contratos explícitos | 0 | Revisar documentación, verificar que define al menos 3 agentes | Eliminar archivo |
| 7.2 | **Definir agentes especializados: DataAgent, GenAgent, HelpAgent** | `AGENTS.md` + ajustes en skills | Runtime | 7.1 | Medio | Separación de responsabilidades, contexto más pequeño por agente | Variable | Verificar que cada agente tiene scope definido y skills asignadas | Revertir `AGENTS.md` |
| 7.3 | **Asignar permisos por agente (`config/permissions.yaml`)** | Nuevo: `config/permissions.yaml` | Security | 7.2 | Medio | Principio de mínimo privilegio | 0 | Intentar acción no permitida (ej: HelpAgent modifica archivo), verificar bloqueo | Eliminar config |
| 7.4 | **Crear agente `OrchestratorAgent` ligero** | Nuevo: `agents/orchestrator.py` | Runtime | 7.2 | Medio | Delegación controlada sin perder trazabilidad | Variable | Enviar tarea compleja, verificar que Orchestrator delega y recompone | Eliminar archivo |

**Criterio de salida:** Cada agente tiene: ID, responsabilidad, skills permitidas, tools permitidas, budget.

---

## FASE 8 — EVALUATION

**Objetivo:** Medir calidad y prevenir regresiones.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 8.1 | **Crear suite de tests de regresión** | Nuevo: `tests/`, `tests/__init__.py`, `pytest.ini` | QA | Ninguna | Bajo | Prevención de regresiones | 0 | `pytest tests/` ejecuta sin errores | Eliminar directorio `tests/` |
| 8.2 | **Tests unitarios para cada script de plugin** | `tests/test_image_generation_tool.py`, `tests/test_yahoo_finance_tool.py`, etc. (×7) | QA | 8.1 | Bajo | Validación de plugins | 0 | `pytest tests/test_*_tool.py` pasa | Eliminar archivos |
| 8.3 | **Benchmark de tokens por tarea tipo** | Nuevo: `tests/benchmark_tokens.py` | QA | 1.5 | Bajo | Medición cuantitativa de mejora | 0 | Ejecutar benchmark, comparar baseline vs actual | Eliminar archivo |
| 8.4 | **Tests de integración para flujos end-to-end** | Nuevo: `tests/integration/` | QA | 8.2 | Medio | Validación de flujos completos | 0 | `pytest tests/integration/` pasa | Eliminar directorio |
| 8.5 | **Test de no-regresión para skills** | `tests/test_skills_load.py` | QA | 8.1 | Bajo | Verificar que skills cargan sin errores | 0 | Verificar que todas las skills se parsean correctamente | Eliminar archivo |

**Criterio de salida:** `pytest` pasa al 100%. Benchmark muestra reducción de tokens vs baseline.

---

## FASE 9 — ADVANCED ORCHESTRATION

**Objetivo:** Flujos complejos con planificación y coordinación.

| # | Cambio | Archivos afectados | Componentes | Dependencia | Riesgo | Beneficio | Tokens ahorrados | Cómo probar | Cómo revertir |
|---|--------|-------------------|-------------|-------------|--------|-----------|------------------|-------------|---------------|
| 9.1 | **Implementar Goal/Plan engine** | Nuevo: `orchestration/goal_engine.py`, `orchestration/__init__.py` | Runtime | 5.3, 7.2 | Alto | Planificación explícita, reproducible | Variable | Definir goal: "Analizar AAPL y generar reporte", verificar plan generado | Eliminar directorio |
| 9.2 | **Implementar Swarm coordination** | Nuevo: `orchestration/swarm.py` | Runtime | 9.1 | Alto | Paralelismo controlado de agentes | Variable | Múltiples tareas independientes, verificar ejecución paralela | Eliminar archivo |
| 9.3 | **Human-in-the-loop para acciones R3+ (modificación, ejecución)** | `config/permissions.yaml` + `orchestration/approval.py` | Security | 7.3 | Medio | Aprobación humana antes de acciones destructivas | 0 | Intentar modificación de archivo, verificar prompt de aprobación | Revertir config |
| 9.4 | **Rollback automático ante fallo en plan** | `orchestration/goal_engine.py` + `state/checkpoint_manager.py` | Runtime | 5.3, 9.1 | Alto | Recuperación de flujos complejos | Variable | Forzar fallo en paso 3 de 5, verificar rollback a checkpoint 2 | Revertir lógica |
| 9.5 | **Evaluación automática de calidad de respuesta** | Nuevo: `orchestration/evaluator.py` | QA | 8.4 | Medio | Feedback loop de calidad | 0 | Evaluar respuesta contra criterios, verificar score | Eliminar archivo |

**Criterio de salida:** Flujos complejos se planifican, ejecutan, y pueden recuperarse ante fallos.

---

## MATRIZ DE DEPENDENCIAS ENTRE FASES

```
FASE 0 (Baseline)
    │
    ▼
FASE 1 (Observabilidad) ─────────────────┐
    │                                      │
    ▼                                      │
FASE 2 (Loop Control) ◄──────────────────┤
    │                                      │
    ▼                                      │
FASE 3 (Budget/Token) ◄──────────────────┘
    │
    ▼
FASE 4 (Context Optimization)
    │
    ▼
FASE 5 (Artifacts/State)
    │
    ├──────────────┐
    ▼              ▼
FASE 6 (MCP)    FASE 7 (Agents)
    │              │
    └──────┬───────┘
           ▼
    FASE 8 (Evaluation)
           │
           ▼
    FASE 9 (Advanced Orchestration)
```

---

## TOP 10 CAMBIOS DE MAYOR ROI

> "¿Qué deberíamos cambiar primero para obtener el mayor beneficio con el menor esfuerzo?"

| # | Cambio | Fase | Esfuerzo estimado | Impacto | ROI | Tokens ahorrados/turno | Riesgo |
|---|--------|------|-------------------|---------|-----|------------------------|--------|
| 1 | **Mover API key a variable de entorno** | FASE 0 | 15 min | Crítico (seguridad) | ⭐⭐⭐⭐⭐ | 0 | Ninguno |
| 2 | **Agregar retry con backoff a los 7 scripts** | FASE 2 | 30 min | Alto (resiliencia) | ⭐⭐⭐⭐⭐ | 0 | Muy bajo |
| 3 | **Reemplazar `print()` por `logging` estructurado** | FASE 1 | 45 min | Alto (observabilidad) | ⭐⭐⭐⭐☆ | 0 | Muy bajo |
| 4 | **Crear `runtime-config.yaml` con límites** | FASE 2 | 30 min | Alto (control) | ⭐⭐⭐⭐☆ | Variable | Bajo |
| 5 | **Eliminar `help-center-urls.md` huérfano** | FASE 4 | 5 min | Medio | ⭐⭐⭐⭐☆ | ~1,000 | Ninguno |
| 6 | **Extraer librería base para 5 scripts de datos** | FASE 0-1 | 2 h | Alto (mantenibilidad) | ⭐⭐⭐☆☆ | 0 | Bajo |
| 7 | **Crear `ContextManager` con selección de skills** | FASE 4 | 3 h | Alto (tokens) | ⭐⭐⭐☆☆ | ~3,100 | Medio |
| 8 | **Crear `ArtifactStore` básico** | FASE 5 | 2 h | Medio (reutilización) | ⭐⭐⭐☆☆ | Variable | Medio |
| 9 | **Implementar contador de tokens por sesión** | FASE 1 | 1 h | Medio (visibilidad) | ⭐⭐⭐☆☆ | 0 | Bajo |
| 10 | **Crear `AGENTS.md` con scopes definidos** | FASE 7 | 1 h | Medio (claridad) | ⭐⭐☆☆☆ | Variable | Bajo |

**ROI total estimado de los 10 primeros cambios:**
- **Tokens ahorrados:** 3,000–10,000+ por turno no financiero
- **Resiliencia:** +40% éxito en APIs externas
- **Seguridad:** Eliminación de riesgo crítico de fuga de credenciales
- **Observabilidad:** De 0% a 100% de visibilidad
- **Tiempo total de implementación:** ~10 horas distribuidas
- **Reversibilidad:** 100% reversible (cada cambio es independiente)

---

## CHECKLIST DE APROBACIÓN POR FASE

Antes de comenzar cada fase, verificar:

- [ ] Fase anterior completada y probada
- [ ] Commit en rama `feat/audit-migration`
- [ ] Tests de regresión pasan (a partir de FASE 8)
- [ ] Métricas de baseline disponibles para comparación
- [ ] Plan de rollback documentado
- [ ] Aprobación explícita del usuario

---

## NOTAS DE IMPLEMENTACIÓN

1. **NO modificar Skills existentes** hasta FASE 4 (solo ajustes de referencia).
2. **NO eliminar plugins** hasta FASE 6 (MCP unificado debe estar probado).
3. **NO cambiar `.agent-gw.json`** directamente; crear `.env` y modificar scripts para leer de allí.
4. **Mantener compatibilidad** con Kimi Code runtime en todo momento.
5. **Cada fase debe ser desplegable independientemente**.

---

*Plan de Migración Incremental*  
*Generado: 2026-08-21*  
*Estado: PENDIENTE DE APROBACIÓN*
