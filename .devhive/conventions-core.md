# Convenciones core — Flujo de Autentificación

Este documento agrupa las convenciones transversales del proyecto. Para detalles por área, ver:

- [Backend](./conventions-backend.md)
- [Frontend](./conventions-frontend.md)
- [Base de datos](./conventions-db.md)
- [Despliegue / Infraestructura](./conventions-deploy.md)
- [Tests](./conventions-test.md)
- [Auth / Seguridad](./conventions-auth.md)
- [Agentes y memoria DevHive](./conventions-agents.md)

## Estructura de repositorio

- Código backend: `backend/src/`
- Código frontend: `frontend/src/`
- Schema canónico: `init-scripts/01-init.sql`
- Documentación de contexto: `.devhive/`
- Configuración y agentes: `.agents/`
- Infraestructura: `docker-compose*.yml`, `nginx/`, `certs/`, `data/`

> **Nota:** las rutas legacy `src/` están obsoletas; el código backend real vive en `backend/src/`.

## Git

- Commits: `tipo(scope): descripción`
  - Ej: `feat(auth): add TOTP backup codes`
  - Ej: `fix(db): correct migration order`
- Branch: `feature/nombre-tarea` o `fix/bug-descripcion`
- PR requiere: tests pasando + review

## Reglas de memoria y agentes (resumen)

- Leer `.devhive/project-brief.md`, `.devhive/conventions.md` (índice), y el archivo L1b correspondiente antes de actuar.
- Antes de modificar un servicio, consultar al `knowledge-graph-agent` vía MCP para entender impacto.
- Cuando un agente crea un nuevo componente, notificar al `knowledge-graph-agent` para documentar el nodo.
- Actualizar `.agents/{agent}/memory/active-tasks.md` tras cada tarea.
- El Guardián debe autorizar cambios fuera del scope del agente.
- Ver detalles de DCOP, stubs, nombres de archivos y presupuesto en [conventions-agents.md](./conventions-agents.md).

## Presupuesto de tokens por archivo de memoria

| Archivo | Capa | Presupuesto aproximado |
|---|---|---|
| `active-tasks.md` | L4 | ≤150 tokens |
| `completed-tasks.md` | Cold | sin límite estricto, solo se carga bajo demanda |
| `queries.md` (hot) | L5/L6 | ≤400 tokens |
| `queries.cold.md` | Cold | sin límite estricto, solo se carga bajo demanda |
| `edges.md` | L6 | ≤300 tokens |
| `memory/graph/*.md` stubs | L6 | ≤50 tokens cada uno |

> **Regla de oro:** la memoria activa (hot) debe caber en el contexto de un solo prompt. Lo que no es necesario en cada turno se mueve a archivos cold o se consulta vía MCP.

## Checklist antes de empezar a tocar código

Para evitar errores operacionales recurrentes, validar lo siguiente **antes** de escribir o modificar archivos:

1. **Working directory correcto.** Confirmar que los paths absolutos apuntan a `/workspace/flujo-autentificacion` (o el root del proyecto en el host del usuario). No asumir que el CWD del agente coincide con el repo del proyecto.
2. **Entorno de paquetes disponible.** Si se va a modificar `package.json`/`pnpm-lock.yaml`, verificar que `pnpm` funciona en el host. Si el host tiene problemas con pnpm (timeouts, corepack, firma), usar el contenedor `frontend` o `auth` **solo si** monta el código fuente como bind mount. De lo contrario, editar archivos en el host y reconstruir la imagen después.
3. **Bind mounts de Docker.** Antes de ejecutar `pnpm add`, `npm install` o cualquier operación de escritura dentro de un contenedor, verificar que el contenedor monta el proyecto:
   ```bash
   docker inspect -f '{{ json .Mounts }}' <nombre-contenedor>
   ```
   Si no hay bind mount del source, los cambios solo persisten en el overlay del contenedor y se perderán al reiniciar. En ese caso, editar en el host y ejecutar `docker compose build --no-cache <servicio>`.
4. **Dependencias de hooks/contextos en tests.** Si un componente o hook usa `useTheme`, `useAuth`, `useRouter` o cualquier contexto, verificar si los tests necesitan un mock o un wrapper. Preferir mockear el hook (ej. `vi.mock('../../hooks/useTheme')`) antes de envolver cada test con múltiples providers, para mantener los tests unitarios aislados.
5. **Type-check inmediato.** Después de cada cambio significativo en TypeScript, ejecutar el type-check del paquete correspondiente **antes** de correr tests:
   ```bash
   # frontend
   docker exec flujo-autentificacion-frontend pnpm --filter flujo-autentificacion-frontend typecheck
   # backend
   docker exec flujo-autentificacion-auth pnpm --filter @flujo/backend typecheck
   ```
   No introducir variables no utilizadas ni dejar funciones sin importar sus dependencias.
6. **Herramientas Docker disponibles.** Antes de recomendar comandos de `docker compose`, verificar que el plugin está instalado en el entorno donde se ejecutarán. En este entorno de agente puede no estarlo; el usuario debe ejecutarlos en su WSL/host.
7. **Impacto MCP antes de cambios cross-cutting.** Para cambios que toquen más de un archivo o más de un paquete, consultar el grafo de `knowledge-graph-agent` antes de decidir el plan.

## Checklist antes de cerrar una tarea

- [ ] Tests pasan (`pnpm test`, `pnpm jest --coverage`, `pnpm build` raíz y frontend).
- [ ] No quedan tablas, servicios, utilidades ni tests huérfanos.
- [ ] El schema canónico y los scripts legacy están alineados.
- [ ] El `knowledge-graph-agent` tiene los nodos y relaciones actualizados.
- [ ] `README.md`, `.kimi-memory.md`, `TASKS.md` y `CHANGELOG.md` reflejan el cambio si afectan al usuario o al equipo.
- [ ] Existe una migración para bases de datos existentes si el schema cambió.
