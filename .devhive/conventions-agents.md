# Convenciones de agentes y memoria DevHive — CutterNest

## Lectura inicial

- Leer `.devhive/project-brief.md`, `.devhive/conventions.md` (índice), y el archivo L1b correspondiente antes de actuar.
- Antes de modificar un servicio, consultar al `knowledge-graph-agent` vía MCP para entender impacto en dependencias y flujos de datos (`.agents/knowledge-graph-agent/memory/queries.md` contiene recetas MCP hot; `.agents/knowledge-graph-agent/memory/queries.cold.md` se usa bajo demanda).

## Registro de nodos y cambios

- Cuando un agente crea un nuevo componente, notificar al `knowledge-graph-agent` para que documente el nodo y sus relaciones. Cada stub debe mantenerse ≤50 tokens.
- Actualizar `.agents/{agent}/memory/active-tasks.md` tras cada tarea. El historial completado se archiva en `.agents/{agent}/memory/completed-tasks.md`.
- Usar `.devhive/how-to-request-a-task.md` como plantilla para solicitar nuevas tareas al Guardian.
- Registrar lecciones en `.agents/{agent}/memory/learnings.md`.
- Registrar bloqueadores en `.agents/{agent}/memory/blockers.md` usando el marker `[BLOCKER]`; para errores activos usar `[ACTIVE_ERROR]`.

## Contrato de nombres de archivos de memoria

En `.agents/{agent}/memory/` solo pueden existir:

- `active-tasks.md`
- `queue.md`
- `blockers.md`
- `learnings.md`
- `completed-tasks.md`

Cualquier reporte ad-hoc (`audit-*.md`, `findings-*.md`, `*-doctor-*.md`) debe comprimirse a stub en `.agents/memory/stubs/` y archivarse en `.agents/memory/archive/YYYY-MM-DD/`, o moverse directamente a archive si ya está cerrado.

## Cierre de sesión y DCOP

Al final de cada sesión de trabajo larga (>30 minutos) o antes de cambiar de agente, ejecutar si existe:

```bash
node scripts/optimize.mjs --force
```

Antes de cambios riesgosos (auth, DB, deploy, seguridad), ejecutar un checkpoint si existe:

```bash
node scripts/checkpoint.mjs pre-cambio-riesgoso
```

Para restaurar contexto mínimo tras una pausa:

```bash
node scripts/resume.mjs
```

Estas tres operaciones son **la única forma autorizada** de comprimir/organizar memoria. No editar a mano archivos de `archive/` ni eliminar stubs sin pasar por `#optimize`.

> **Nota CutterNest**: los scripts `optimize.mjs`, `checkpoint.mjs` y `resume.mjs` pueden no existir aún en el MVP. Si no existen, documentar la intención en `learnings.md` y pedir al Guardian que los genere o adapte cuando sea necesario.

## Presupuesto de tokens

Ver tabla completa en `conventions-core.md` si existe, o en `AGENTS.md`. Resumen:

- `active-tasks.md`: ≤150 tokens
- `queries.md` (hot): ≤400 tokens
- `edges.md`: ≤300 tokens
- stubs del grafo: ≤50 tokens cada uno
- Archivos cold (`completed-tasks.md`, `queries.cold.md`): sin límite estricto, solo bajo demanda.

## Lecciones operativas: cómo ejecutar para no repetir errores

> Esta sección consolida errores reales de sesiones anteriores y las reglas de ejecución que previenen recaer en ellos.

### 1. Verificar herramientas antes de usarlas
- Antes de invocar un comando de búsqueda (`grep`, `rg`, `find`, `ag`), comprobar que la herramienta existe (`which rg`, `which pnpm`, `which pytest`).
- Usar siempre las herramientas integradas del workspace (`Grep`, `Glob`, `Read`) en lugar de `grep`/`rg`/`find` directos en shell; respetan límites, filtros y `.gitignore`.
- Si se necesita `ripgrep` fuera del entorno MCP, asegurarse de que esté instalado; de lo contrario, usar `grep` estándar o las herramientas nativas.

### 2. Preferir el package manager del proyecto
- Backend: `pip` con `requirements.txt` (y `requirements.fase2.txt`, `requirements.fase4.txt`).
- Frontend: `pnpm`. Usar `pnpm exec <bin>` en vez de `npx <bin>`, salvo que se haya verificado explícitamente que `npx` resolverá la versión correcta del workspace.
- No mezclar `npm`/`yarn` con `pnpm`; si se toca `package.json` o `pnpm-lock.yaml`, ejecutar `pnpm install` y sincronizar el lockfile.

### 3. No delegar tareas grandes sin supervisión clara
- Si se usa `Agent`, dar instrucciones exactas, rutas de archivos y comandos; evitar "explora y arregla".
- No lanzar subagentes en paralelo para tareas que comparten archivos o dependencias; serializar o dividir por componentes independientes.
- Revisar el resultado del agente antes de integrarlo; no asumir que completó la tarea.

### 4. Validar transformaciones inmediatamente después de ejecutar scripts
- Todo script que transforme código, memoria o stubs (`optimize.mjs`, `checkpoint.mjs`, `resume.mjs`, migraciones, `apply-migration-*.py`) debe ir seguido de una verificación manual de los archivos afectados y, cuando aplique, de `pytest`/`pnpm test`/`pnpm typecheck`.
- No ejecutar scripts destructivos (`--force`, `git add -A`, `rm -rf`) sin confirmar previamente el alcance.

### 5. Confirmar alcance antes de versionar
- Antes de `git add -A` o `git commit`, revisar el diff con `git status` y `git diff --cached` para evitar subir `.env`, datos de `data/`/`backups/`, o cambios no relacionados.
- Versionar en commits atómicos por área (`scope`) y ejecutar los tests correspondientes antes del push.

### 6. Ejecutar E2E solo cuando la pila Docker esté levantada
- Tests E2E con Playwright requieren backend + frontend en ejecución (post-MVP).
- Si la pila no está activa, no ejecutar Playwright; optar por tests unitarios/pytest o levantar primero `docker compose up -d --build`.

### 7. Ejecutar validaciones DevHive después de cambios riesgosos
- Tras tocar memoria de agentes, stubs, `package.json` o flujos críticos, correr si existen:
  ```bash
  node scripts/validate-devhive.mjs
  node scripts/audit-stub-tokens.mjs
  ```
- Resolver cualquier advertencia antes de continuar con el siguiente cambio.

### 8. Mantener la memoria de agentes dentro del contrato
- Solo los cinco archivos autorizados en `.agents/{agent}/memory/` (`active-tasks.md`, `queue.md`, `blockers.md`, `learnings.md`, `completed-tasks.md`).
- Lecciones como esta se registran en `.devhive/conventions-agents.md` o en el `learnings.md` del agente involucrado, pero no en archivos ad-hoc nuevos dentro de `memory/`.
- Actualizar este archivo si aparece un nuevo patrón de error con impacto transversal.

## Entregables KERNEL y handoff ticket

Cada agente valida su `SKILL.md` antes de entregar. El entregable sigue `.agents/guardian/templates/deliverable-template.md` y, si hay handoff, incluye el ticket estandarizado:

```markdown
🎫 HANDOFF TICKET:
- From: [agent]
- To: [next agent]
- Task: [one-line summary]
- Files touched:
  - [path]
- Decisions made: [2-3 bullets]
- Verification: [commands and results]
- Criterios de éxito cumplidos: [yes/no]
- Risks / blockers: [none | list]
- Context for next: [what the receiver needs to know]
```

El receptor debe leer el ticket y los archivos nombrados antes de re-explorar el proyecto.
