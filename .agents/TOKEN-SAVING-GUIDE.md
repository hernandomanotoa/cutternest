# Guía maestra de ahorro de tokens — DevHive Wiki DITIC

> Esta guía explica cómo usar correctamente los modos de trabajo, agentes, subagentes, skills y background tasks del host Kimi Code para minimizar el consumo de tokens y maximizar la calidad de las entregas.

## 1. Principio general

El 80% del desperdicio de tokens proviene de:

1. **Re-explorar** código que otro agente ya exploró.
2. **Leer archivos enteros** cuando solo se necesita una función.
3. **Delegar sin contexto** exacto (paths, comandos, criterios).
4. **Crear Planes o Goals** para tareas pequeñas.
5. **Escribir memoria archivo por archivo** en lugar de lotes.
6. **Pegar el contenido completo de archivos** en los entregables.

Regla de oro: **haz solo el trabajo que aporta valor; nunca repitas trabajo que ya se hizo.**

## 2. Árbol de decisión: ¿qué modo usar?

```
¿Es una pregunta o fix de ≤3 tool calls?
  SÍ → Conversacional (actúa directo)
  NO → ¿Es un objetivo verificable y largo (varios turnos)?
          SÍ → Goal Mode
          NO → ¿Es una feature/refactor/multi-archivo o decisión arquitectónica?
                  SÍ → Plan Mode (explora, planea, aprueba, luego code)
                  NO → ¿Necesita exploración amplia (>3 búsquedas)?
                          SÍ → Subagent explore o knowledge-graph-agent
                          NO → ¿Se puede dividir en subtareas independientes?
                                  SÍ → AgentSwarm
                                  NO → Actúa directamente (conversacional)
```

## 3. Cuándo usar cada modo

### 3.1 Conversacional (directo)

- Preguntas puntuales.
- Leer un archivo conocido.
- Editar una línea o dos.
- Ejecutar un comando corto.
- Análisis rápido con contexto ya cargado.

**Ejemplo correcto:**
> "¿Cuál es el estado del último sprint?"
> "Cambia el valor por defecto de `sessionInactivityMinutes` a 60 en `SystemConfig.tsx`."

**Anti-patrón:** crear un Plan para esto.

### 3.2 Plan Mode

- Nueva feature.
- Refactor grande.
- Cambio multi-archivo (>2–3 archivos).
- Decisión arquitectónica con múltiples opciones.

**Proceso:**
1. El Guardian o agente entra en Plan Mode.
2. Investiga (MCP-first, subagent `explore` si es necesario).
3. Escribe el plan en el plan file.
4. Pide aprobación (en manual/yolo) o aplica (en auto).
5. Solo después de aprobado, ejecuta el plan.

**Ejemplo correcto:**
> "Refactoriza `SystemConfig.tsx` en subcomponentes por pestaña y extrae la lógica a hooks personalizados."

### 3.3 Goal Mode

- Objetivo con criterio de completitud claro.
- Trabajo autónomo a lo largo de múltiples turnos.
- El usuario no necesita micro-gestionar.

**Proceso:**
1. Define el objetivo.
2. Define el criterio de completitud (¿cómo sabemos que terminó?).
3. Define límites (qué NO hacer).
4. Crea el Goal.
5. El agente trabaja autónomamente y reporta.

**Ejemplo correcto:**
> "Termina el refactor responsive de todos los componentes admin y asegúrate de que 223 tests frontend pasen."

**Anti-patrón:** Goal con criterio vago como "mejora el código".

### 3.4 Subagentes

Usa un subagente cuando una tarea se beneficia de contexto separado.

| Tipo | Usar para | Prompt ideal |
|------|-----------|--------------|
| `explore` | Buscar patrones, archivos, relaciones. | Incluye scopes, keywords, y qué reportar. No inventes pasos fijos. |
| `plan` | Diseñar implementación/arquitectura. | Contexto del problema, restricciones, opciones a evaluar. |
| `coder` | Implementar cambios concretos. | Paths exactos, comandos de test, criterios de aceptación. |

**Reglas de oro para subagentes:**
- **No hagas que un subagente busque paths que ya conoces.** Pon los paths exactos en el prompt.
- **Resume el mismo agente** (`resume`) si continúa trabajo anterior.
- **No lances subagentes en paralelo** para tareas que comparten archivos.
- **Delega comprensión, no ciegamente.** Si el resultado depende de un número de línea, búscalo tú primero.

**Ejemplo correcto de prompt a subagente coder:**
```
Refactoriza `frontend/src/components/SystemConfig.tsx` para extraer la pestaña LDAP a un nuevo componente `LdapConfigTab.tsx` en `frontend/src/components/system-config/`. Criterios:
- Mantener el comportamiento exacto (estado, validación, prueba LDAP).
- Usar `FormGrid` y tokens CSS existentes.
- No cambiar el API backend.
- Ejecuta `cd frontend && pnpm test SystemConfig` y asegúrate de que pase.
```

**Anti-patrón:**
> "Explora y arregla los problemas de clean code en el frontend."

### 3.5 AgentSwarm

Usa AgentSwarm solo cuando tengas **muchos subagentes independientes** sobre diferentes inputs.

**Ejemplo correcto:**
> Revisar 10 archivos de componentes para eliminar colores hardcodeados, uno por agente.

**Anti-patrón:**
> Lanzar 5 subagentes para editar el mismo archivo.

### 3.6 Background tasks

Usa `run_in_background=true` para:
- `pnpm build`
- `pnpm test` (si no necesitas resultado inmediato)
- Servidores de desarrollo
- Watchers

**No uses background tasks para:**
- Editar archivos.
- Tareas que requieren tu aprobación inmediata.

## 4. Reglas de ahorro de tokens por área

### 4.1 Exploración de código

- **MCP-first:** para preguntas de arquitectura, consulta `knowledge-graph-agent` / `codebase-memory-mcp` antes de leer código fuente.
- **Lee solo lo que necesitas.** Si solo necesitas una función, usa `Read` con `line_offset` y `n_lines`.
- **No ejecutes `grep`/`find`/`rg` desde shell.** Usa `Grep` y `Glob` integrados (respetan límites y `.gitignore`).
- **Reusa aprendizajes previos.** Si un agente ya exploró, lee su `learnings.md` o `completed-tasks.md`.

### 4.2 Edición de código

- **Usa `Edit` para cambios incrementales.** No reescribas archivos completos con `Write`.
- **Lee antes de editar.** No edites de memoria.
- **No cambies lógica para que pasen tests.** Si un test falla por un cambio real, actualiza el test.

### 4.3 Entregables

- **Resumen conciso.** No pegues el contenido completo de archivos modificados.
- **Incluye solo los cambios relevantes.** Diffs, tests ejecutados, pre-conditions.
- **No repitas la SKILL.md completa.** Solo cita secciones aplicables.

### 4.4 Memoria de agentes

- **El Guardian aplica lotes.** Los agentes no escriben sus propios `active-tasks.md`, `queue.md`, `learnings.md` o `audit.log`.
- **Reporta cambios en el entregable.** El Guardian los aplica una sola vez al cerrar el swarm.
- **No crees archivos ad-hoc en `.agents/{agent}/memory/`**. Usa solo los 5 archivos autorizados.

### 4.5 UI/UX

- **Consulta `ui-ux-agent` antes de crear nuevos patrones visuales.** No reinventes modales, tablas, formularios o tokens.
- **Usa componentes `ui/` existentes.** `MobileModal`, `ResponsiveTable`, `FormGrid`, `Skeleton`, `Spinner`.
- **Sigue los tokens de `theme.css`.** No hardcodees colores, espaciados o tipografía.

## 5. Clean code = menos tokens a largo plazo

Código limpio es más barato de mantener:

- **Componentes pequeños:** menos contexto para cargar al editar.
- **Funciones con un solo propósito:** menos líneas para razonar.
- **Nombres claros:** menos comentarios necesarios.
- **Sin `any`:** menos errores de tipo que requieren re-exploración.
- **Sin números mágicos:** menos dudas sobre por qué un valor es 5000 o 30.
- **Manejo de errores consistente:** menos tiempo depurando.

Regla: **si un componente supera 250 líneas efectivas, es una señal de que debe dividirse.**

## 6. Checklist antes de pedir una tarea

Antes de enviar una solicitud al Guardian, asegúrate de que incluya:

- [ ] Scope claro (qué archivos/componentes afecta).
- [ ] Criterio de aceptación (tests, comportamiento esperado).
- [ ] Prioridad (P0/P1/P2) y justificación.
- [ ] Si es exploración, ¿qué se ya conoce y qué falta encontrar?
- [ ] Si es implementación, ¿hay un plan aprobado (si aplica)?

## 7. Checklist del Guardian al recibir una solicitud

- [ ] ¿El agente solicitante cargó L0–L3 + L3b?
- [ ] ¿El CWD es `/workspace/flujo-autentificacion`?
- [ ] ¿El modo de ejecución es el correcto (conversacional, Plan, Goal, subagente, swarm, background)?
- [ ] ¿Para preguntas de arquitectura se usó MCP/knowledge-graph-agent primero?
- [ ] ¿El agente tiene tokens disponibles (concurrency)?
- [ ] ¿Las tareas en paralelo son realmente independientes?
- [ ] ¿Al finalizar el swarm se re-indexará MCP si cambió código fuente?

## 8. Ejemplos de ahorro

| Escenario | Enfoque costoso | Enfoque eficiente | Ahorro estimado |
|-----------|-----------------|-------------------|-----------------|
| "¿Qué componentes hay en frontend?" | Leer todo `frontend/src/components/` | Consultar `README.md` o MCP | ~80% |
| Refactor de 1 componente | Plan de 10 pasos | Conversacional con subagente coder | ~50% |
| Explorar impacto de un cambio | Grep manual en 20 archivos | Query MCP + read archivo afectado | ~70% |
| Corregir tests tras refactor | Releer todo el componente | Correr tests, leer solo línea de error | ~60% |
| Swarm de 5 agentes | 5 tareas encoladas | 5 tareas independientes en paralelo | ~40% tiempo |

## 9. Referencias

- `.agents/SKILL-BASE.md` — reglas transversales, modos de trabajo, clean code, token saving.
- `.agents/guardian/SKILL.md` — políticas del Guardian para activar modos y subagentes.
- `.agents/MASTER_PROMPT.md` — orquestación completa del swarm.
- `.devhive/conventions-agents.md` — contratos de memoria y presupuestos de tokens.
- `.devhive/profile.yaml` — agentes habilitados, comandos, stack.
