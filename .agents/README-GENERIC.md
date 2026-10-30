# DevHive Generic Bootstrap Guide

This guide explains how to reuse the DevHive agent framework in a new software project. The goal is to keep `.agents/` and `.devhive/` as generic as possible: project-specific values live in `.devhive/profile.yaml`, and templates are rendered from that single source of truth.

## What makes DevHive generic?

- **`.devhive/profile.yaml`** describes the project metadata, stack, paths, commands, agents and security settings.
- **`.devhive/profile.schema.json`** validates the profile shape.
- **`.agents/templates/*.hbs`** are generic Handlebars-style templates that use `{{variable.path}}` placeholders.
- **`scripts/render-devhive-templates.mjs`** renders templates from the profile without external dependencies.
- **`.agents/guardian/policies.*.json`** splits permissions into universal, stack and project layers.

## Bootstrap a new project

### 1. Copy the skeleton

From an existing DevHive project, copy these directories into your new repository root:

```bash
cp -r .agents .devhive scripts/render-devhive-templates.mjs /path/to/new-project/
```

### 2. Customize `.devhive/profile.yaml`

Edit `.devhive/profile.yaml` to match the new project:

```yaml
devhive_version: "2.2.0"
project:
  id: my-new-project
  name: "My New Project"
  workspace_path: /workspace/my-new-project
  repo_root: .
stack:
  languages: [typescript]
  backend:
    framework: express
    runtime: node
    version: "22"
  frontend:
    framework: react
    bundler: vite
  database:
    engine: postgres
    version: "16"
  package_manager: pnpm
commands:
  install: pnpm install
  test_backend: pnpm test
  test_frontend: cd frontend && pnpm test
  build_backend: pnpm build
  build_frontend: cd frontend && pnpm build
agents:
  enabled:
    - architect
    - backend-agent
    - frontend-agent
    - db-agent
    - test-agent
```

Keep the variable convention in mind:

- `{{project.workspace_path}}`
- `{{project.name}}`
- `{{stack.backend.framework}}`
- `{{commands.test_backend}}`
- Top-level keys like `{{devhive_version}}`

### 3. Render templates

Run the renderer from the project root:

```bash
node scripts/render-devhive-templates.mjs
```

Rendered files appear in `.agents/templates/rendered/`:

- `agent-skill.md` — skeleton for a new agent `SKILL.md`.
- `deliverable.md` — generic deliverable template.
- `MASTER_PROMPT.md` — rendered Guardian master prompt.

> **Template index:** see `.agents/templates/README.md` for the full list of templates, their runtime outputs, and conventions for adding or modifying a template.

You can copy the rendered skeleton to create concrete agent skills:

```bash
mkdir -p .agents/backend-agent/memory
cp .agents/templates/rendered/agent-skill.md .agents/backend-agent/SKILL.md
# Replace {agent_id} with `backend-agent` and fill in scope/rules.
```

### 4. Adapt the policy layers

DevHive permissions are split into three JSON files that merge into the runtime `.agents/guardian/policies.json`:

| File | Purpose |
|------|---------|
| `.agents/guardian/policies.base.json` | Universal rules: token format, audit log, memory layers, concurrency rules. |
| `.agents/guardian/policies.stack.json` | Stack-specific file patterns (e.g. Node/Express/React/PostgreSQL). |
| `.agents/guardian/policies.project.json` | Project-specific approvals and overrides. |

After editing any layer, regenerate the runtime policy:

```bash
node .agents/guardian/scripts/merge-policies.js
```

Then verify it is valid JSON:

```bash
node -e "JSON.parse(require('fs').readFileSync('.agents/guardian/policies.json','utf8')); console.log('OK')"
```

### 5. Create per-agent skills and memories

For each agent in `agents.enabled`:

1. Create `.agents/{agent}/SKILL.md` from the rendered skeleton.
2. Create `.agents/{agent}/memory/` with `active-tasks.md`, `queue.md`, `learnings.md`, `blockers.md`.
3. Ensure `SKILL.md` references `{{project.workspace_path}}` if it uses the renderer.

### 6. Update Guardian orchestration

The Guardian reads `.agents/guardian/SKILL.md` as its runtime prompt. That file is rendered from `.agents/templates/guardian-skill.md.hbs` and contains the project-specific orchestration rules.

`.agents/MASTER_PROMPT.md` is kept as a legacy/generic orchestrator template and is rendered to `.agents/templates/rendered/MASTER_PROMPT.md` for reference only; do not copy it back over `.agents/guardian/SKILL.md`.

```bash
node scripts/render-devhive-templates.mjs
```

> In a fully generic setup, the orchestrator itself can run the renderer before loading the prompt.

## Variable convention

Templates use double-mustache placeholders:

```markdown
Project: {{project.name}}
CWD:     {{project.workspace_path}}
Backend: {{stack.backend.framework}}
Tests:   {{commands.test_backend}}
```

Dot notation walks nested objects. Top-level scalar keys are also available directly.

## Adding a new template

1. Create `.agents/templates/my-template.md.hbs`.
2. Add any new values to `.devhive/profile.yaml`.
3. Run `node scripts/render-devhive-templates.mjs`.
4. The rendered file appears at `.agents/templates/rendered/my-template.md`.

## Keeping the framework in sync

- **Always** edit `.devhive/profile.yaml` instead of hardcoding project names or paths in templates.
- **Always** edit policy layers instead of editing `.agents/guardian/policies.json` directly.
- Run the renderer after any profile or template change.
- Run the policy merge after any policy layer change.

## Migration plan for existing projects

If you are migrating an existing project to the generic framework:

1. Extract all hardcoded project names, paths and stack values into `.devhive/profile.yaml`.
2. Replace hardcoded values in `.agents/templates/guardian-skill.md.hbs` (or keep `.agents/MASTER_PROMPT.md` as the legacy generic orchestrator template) and agent `SKILL.md` files with `{{...}}` placeholders, or keep them as rendered runtime files.
3. Split `.agents/guardian/policies.json` into `policies.base.json`, `policies.stack.json` and `policies.project.json`.
4. Run the merge script to regenerate `policies.json`.
5. Add `scripts/render-devhive-templates.mjs` and render all templates.
6. Update `.agents/README.md` and create `.agents/README-GENERIC.md`.

## Migrating existing per-agent SKILL.md files

When an existing project already has concrete `SKILL.md` files, migrate them one agent at a time using the rendered generic skeleton.

### Step-by-step migration

1. Render the generic skeleton:

   ```bash
   node scripts/render-devhive-templates.mjs
   ```

2. Copy the rendered skeleton to the agent directory:

   ```bash
   cp .agents/templates/rendered/agent-skill.md .agents/{agent}/SKILL.md.new
   ```

3. Replace every `{agent_id}` placeholder with the concrete agent id (e.g. `backend-agent`).
4. Port the project-specific rules from the old `SKILL.md` into the new file, replacing hardcoded values with `{{...}}` placeholders wherever it makes sense.
5. Replace hardcoded workspace paths such as `/workspace/cutternest-kit` with `{{project.workspace_path}}`.
6. Replace hardcoded project names such as `Wiki DITIC` with `{{project.name}}`.
7. Replace hardcoded stack descriptions such as `Node.js 24 + Express` with `{{stack.backend.runtime}} {{stack.backend.version}} + {{stack.backend.framework}}`.
8. Replace hardcoded commands such as `pnpm test` with `{{commands.test_backend}}`.
9. Re-run the renderer and verify there are no `Unknown variable: {{...}}` warnings.
10. Move the new file into place:

    ```bash
    mv .agents/{agent}/SKILL.md.new .agents/{agent}/SKILL.md
    ```

### Concrete example: backend-agent

Before:

```yaml
---
name: Backend Agent
version: 1.0.0
description: Implements APIs, services and business logic for the Wiki DITIC auth service with Node.js, Express and TypeScript
scope: src/services/, src/routes/, src/utils/, src/middleware/
---
```

After:

```yaml
---
name: Backend Agent
version: 1.0.0
description: Implements APIs, services and business logic for the {{project.name}} auth service with {{stack.backend.runtime}} {{stack.backend.version}}, {{stack.backend.framework}} and {{stack.backend.language}}
scope: {{paths.backend_src}}/services/, {{paths.backend_src}}/routes/, {{paths.backend_src}}/utils/, {{paths.backend_src}}/middleware/
---
```

### Migration checklist pattern

Use a table like the one below to track progress. Mark each agent as completed only after its `SKILL.md` has been migrated, rendered without warnings, and reviewed.

| Agent | Status | Notes |
|-------|--------|-------|
| `architect` | ✅ Completed | Migrated in the initial swarm. |
| `backend-agent` | ⏳ Pending | Contains hardcoded project name, stack and paths. |
| `frontend-agent` | ⏳ Pending | Contains hardcoded React/Vite stack and paths. |
| `db-agent` | ⏳ Pending | Contains hardcoded PostgreSQL and SQL script references. |
| `auth-agent` | ⏳ Pending | Contains project-specific security rules and auth flows. |
| `deploy-agent` | ⏳ Pending | Contains hardcoded Docker Compose and certificate references. |
| `test-agent` | ⏳ Pending | Contains hardcoded test commands and frameworks. |
| `docs-agent` | ⏳ Pending | Contains hardcoded project name and deliverable references. |
| `knowledge-graph-agent` | ⏳ Pending | Contains hardcoded graph memory paths. |

### Warnings

- Do not edit `.agents/MASTER_PROMPT.md` directly; change the template and re-render.
- Do not edit `.agents/guardian/policies.json` directly; edit the policy layers and merge them.
- Keep agent memory files (`.agents/{agent}/memory/*`) intact during migration.

## References

- `.devhive/profile.yaml` — project source of truth.
- `.devhive/profile.schema.json` — schema for the profile.
- `.agents/templates/` — generic templates.
- `.agents/templates/rendered/` — rendered outputs.
- `scripts/render-devhive-templates.mjs` — template renderer.
- `.agents/guardian/scripts/merge-policies.js` — policy merger.
