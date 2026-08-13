# Memoria Compartida DevHive - Wiki DITIC

Este directorio contiene la **memoria compartida** del equipo de agentes DevHive para el proyecto **Flujo de Autentificación - Wiki DITIC**.

## Propósito

La memoria compartida reduce el uso de tokens al cargar solo el contexto necesario por capas. Cada agente debe leer estos archivos antes de actuar.

## Archivos

| Archivo | Capa | Contenido | Audiencia |
|---------|------|-----------|-----------|
| `profile.yaml` | L0 | Fuente única de verdad: metadatos, stack, comandos, agentes | Todos los agentes + renderer |
| `profile.schema.json` | L0 | Esquema JSON de validación para `profile.yaml` | Guardian, tooling |
| `project-brief.md` | L0 | Visión, stack, estado actual, convenciones críticas | Todos los agentes |
| `conventions.md` | L1 | Estructura de archivos, reglas de código, API, Git, Docker | Todos los agentes |
| `current-sprint.md` | L2 | Tareas del sprint, bloqueadores, métricas | Todos los agentes |
| `architecture.md` | L3 | Diagramas de componentes, flujo de auth, modelo de datos | Architect, backend, db, auth |
| `decisions/*.md` | L5 | ADRs (Architecture Decision Records) | Bajo demanda |
| `sessions/*.md` | L6 | Logs de sesiones diarias | Referencia histórica |

## Perfil genérico

`profile.yaml` hace que DevHive sea portable entre proyectos. Las plantillas en `.agents/templates/*.hbs` usan placeholders como `{{project.workspace_path}}`, `{{project.name}}`, `{{stack.backend.framework}}` y `{{commands.test_backend}}`. El renderer `scripts/render-devhive-templates.mjs` las sustituye a partir de `profile.yaml`.

Para regenerar plantillas y el prompt maestro renderizado:

```bash
node scripts/render-devhive-templates.mjs
```

## Cómo actualizar

- **profile.yaml**: actualizar cuando cambien metadatos del proyecto, stack, comandos o agentes. Volver a renderizar plantillas después.
- **profile.schema.json**: actualizar cuando se añadan o cambien campos del perfil.
- **project-brief.md**: actualizar cuando cambie el stack, el alcance o el estado general del proyecto.
- **conventions.md**: actualizar cuando cambien las reglas de código, la estructura o los estándares.
- **current-sprint.md**: actualizar diariamente con el progreso de tareas y bloqueadores.
- **architecture.md**: actualizar cuando cambien componentes, flujos o modelo de datos.
- **decisions/*.md**: crear un nuevo ADR para cada decisión arquitectónica importante.
- **sessions/*.md**: crear un archivo por día de trabajo con resumen de actividades.

## Reglas

- Mantener cada archivo enfocado y conciso.
- No duplicar información entre archivos; referenciar cuando sea necesario.
- Usar inglés para nombres de agentes, archivos y decisiones técnicas.
- No incluir credenciales reales ni secrets.

## Relación con otras memorias

- `.kimi-memory.md`: índice maestro del proyecto y registro histórico de sesiones.
- `.agents/{agent}/memory/`: memorias individuales de cada agente (tareas, lecciones, bloqueadores).
- `.agents/guardian/`: permisos, políticas y auditoría de decisiones.
