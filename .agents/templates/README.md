# Plantillas DevHive (`*.hbs`)

Este directorio contiene las plantillas [Handlebars-style](https://handlebarsjs.com/) usadas por el renderizador `scripts/render-devhive-templates.mjs`. Cada plantilla lee valores de `.devhive/profile.yaml` y produce un archivo renderizado en su ubicación runtime correspondiente.

## Renderizador

```bash
node scripts/render-devhive-templates.mjs
```

El script:
1. Lee `.devhive/profile.yaml`.
2. Construye un mapa de variables (`{{project.name}}`, `{{stack.frontend.framework}}`, etc.).
3. Recorre todos los archivos `*.hbs` bajo `.agents/templates/`.
4. Sustituye los placeholders y escribe el output en su destino.

> **Nunca edites los archivos renderizados a mano** (por ejemplo `.agents/backend-agent/SKILL.md`). Edita el template `.hbs` y vuelve a correr el renderizador. Los cambios manuales se perderán en la siguiente renderización.

## Convención de variables

Usamos placeholders de doble llave:

```markdown
{{project.name}}
{{project.workspace_path}}
{{stack.backend.framework}}
{{commands.test_backend}}
{{paths.backend_src}}
{{agent.id}}
```

- Notación con punto recorre objetos anidados.
- Variables de nivel superior también están disponibles sin prefijo (por ejemplo `{{devhive_version}}`).
- Si una variable no existe, el renderizador emite una advertencia: `[render] Unknown variable: {{foo.bar}}`.

Para ver el mapa completo de variables disponibles, lee `.devhive/profile.yaml`.

## Índice de plantillas

| Plantilla | Destino renderizado | Propósito |
|-----------|---------------------|-----------|
| `agent-skill.md.hbs` | `.agents/templates/rendered/agent-skill.md` | Esqueleto genérico para crear un nuevo `SKILL.md` de agente. |
| `architect-skill.md.hbs` | `.agents/architect/SKILL.md` | Rol del arquitecto: diseño, ADRs, convenciones, asignación de tareas. |
| `backend-agent-skill.md.hbs` | `.agents/backend-agent/SKILL.md` | Implementación backend Node.js/Express/TypeScript. |
| `frontend-agent-skill.md.hbs` | `.agents/frontend-agent/SKILL.md` | Implementación frontend React/Vite/TypeScript. |
| `frontend-template-agent-skill.md.hbs` | `.agents/frontend-template-agent/SKILL.md` | Componentes UI reutilizables, tokens, hooks genéricos. |
| `db-agent-skill.md.hbs` | `.agents/db-agent/SKILL.md` | Schema PostgreSQL, migraciones, queries. |
| `auth-agent-skill.md.hbs` | `.agents/auth-agent/SKILL.md` | Seguridad, JWT, TOTP, criptografía. |
| `deploy-agent-skill.md.hbs` | `.agents/deploy-agent/SKILL.md` | Docker, Compose, nginx, scripts WSL/host. |
| `test-agent-skill.md.hbs` | `.agents/test-agent/SKILL.md` | Tests Jest/Vitest/Playwright. |
| `docs-agent-skill.md.hbs` | `.agents/docs-agent/SKILL.md` | Documentación técnica. |
| `knowledge-graph-agent-skill.md.hbs` | `.agents/knowledge-graph-agent/SKILL.md` | Grafo de arquitectura, MCP-first, impact analysis. |
| `guardian-skill.md.hbs` | `.agents/guardian/SKILL.md` | Orquestador, tokens, aprobaciones, cierre de swarm. |
| `integration-validator-skill.md.hbs` | `.agents/plugins/integration-validator/SKILL.md` | Gate final de swarm: tests + entregables. |
| `code-reviewer-skill.md.hbs` | `.agents/plugins/code-reviewer/SKILL.md` | Revisión de código bajo demanda. |
| `dependency-checker-skill.md.hbs` | `.agents/plugins/dependency-checker/SKILL.md` | Auditoría de dependencias npm. |
| `ldap-agent-skill.md.hbs` | `.agents/plugins/ldap-agent/SKILL.md` | OpenLDAP de desarrollo. |
| `tunnel-agent-skill.md.hbs` | `.agents/plugins/tunnel-agent/SKILL.md` | Túneles Cloudflare/Tailscale/ngrok para SMS Gateway. |
| `ui-ux-agent-skill.md.hbs` | `.agents/plugins/ui-ux-agent/SKILL.md` | Apple HIG + responsive + accessibility advisor. |
| `deliverable.md.hbs` | `.agents/guardian/templates/deliverable-template.md` | Plantilla de entregable estándar para todos los agentes. |

> `.agents/MASTER_PROMPT.md` no es un `.hbs`, pero el renderizador lo renderiza a `.agents/templates/rendered/MASTER_PROMPT.md` para referencia. El runtime del Guardian usa `.agents/guardian/SKILL.md` (renderizado desde `guardian-skill.md.hbs`), no `MASTER_PROMPT.md` directamente.

## Cómo añadir una nueva plantilla

1. Crea el archivo `.agents/templates/{nombre}.md.hbs`.
2. Usa placeholders `{{...}}` para cualquier valor que venga de `.devhive/profile.yaml`.
3. Si el archivo debe renderizarse a un agente o plugin, sigue la convención de nombre `{agent-id}-skill.md.hbs`. El renderizador detecta automáticamente:
   - Core agents: lo escribe en `.agents/{agent-id}/SKILL.md`.
   - Plugins: lo escribe en `.agents/plugins/{agent-id}/SKILL.md`.
   - Esqueletos genéricos: lo escribe en `.agents/templates/rendered/`.
4. Corre el renderizador:
   ```bash
   node scripts/render-devhive-templates.mjs
   ```
5. Valida:
   ```bash
   node scripts/validate-devhive.mjs
   ```

### Ejemplo mínimo

```markdown
---
name: "{{agent.name}}"
version: "1.0.0"
description: "{{agent.description}}"
scope: "{{agent.scope}}"
---

## IDENTITY

You are the {{agent.role}} for the {{project.name}} project.
```

## Cómo modificar una plantilla existente

1. Edita el archivo `.hbs` correspondiente, **no** el renderizado.
2. Si agregas un placeholder nuevo, asegúrate de que exista en `.devhive/profile.yaml` (o agrégalo allí).
3. Corre el renderizador y validador:
   ```bash
   node scripts/render-devhive-templates.mjs
   node scripts/validate-devhive.mjs
   ```
4. Revisa el diff del archivo renderizado para confirmar que no hay variables sin resolver.

## Buenas prácticas

- **Mantén los templates en inglés**, incluso si el proyecto opera en español. Los placeholders son más fáciles de mantener y el parser YAML no tiene problemas con caracteres ASCII planos.
- **No hardcodees paths ni nombres de proyecto** en los templates; siempre usa `{{project.workspace_path}}`, `{{project.name}}`, etc.
- **No pongas lógica de runtime** en los templates; solo valores, scopes y reglas estáticas.
- **Si un agente necesita una regla transversal**, ponla en `.agents/SKILL-BASE.md`, no en el template del agente. Los templates de agente deben contener solo reglas específicas de su rol.
- **Corre `validate-devhive.mjs` siempre** después de cambiar un template, para detectar variables desconocidas.

## Referencias

- `.devhive/profile.yaml` — fuente única de verdad de variables.
- `scripts/render-devhive-templates.mjs` — renderizador de plantillas.
- `.agents/README-GENERIC.md` — guía genérica de bootstrap de DevHive.
- `.agents/SKILL-BASE.md` — reglas transversales para todos los agentes.
