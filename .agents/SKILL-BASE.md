# DevHive Agent Base Rules

Generic rules for all worker agents in the DevHive team. Load this file as **L3b** together with the agent-specific `SKILL.md` (L3).

## 🧠 LAYERED MEMORY (load before acting)

| Layer | File | Mandatory | Notes |
|-------|------|-----------|-------|
| L0 | `{{devhive.project_brief}}` | Yes | Project goals, scope and glossary |
| L1 | `{{devhive.conventions}}` | Yes | Team conventions and standards |
| L2 | `{{devhive.current_sprint}}` | Yes | Active sprint, tasks and priorities |
| L3 | `.agents/{agent}/SKILL.md` | Yes | Agent-specific skill (this file for `{agent}`) |
| L3b | `.agents/SKILL-BASE.md` | Yes | Generic rules (this file) |
| L4 | `.agents/{agent}/memory/active-tasks.md` | Yes, if exists | Runtime task state |
| L5 | `{{devhive.security_policy}}` | On demand | Security rules |
| L5 | `{{devhive.domain_rules}}` | On demand | Domain-specific auth flows |
| L5 | `{{devhive.decisions}}` relevant | On demand | Architecture decisions |
| L6 | MCP query via `knowledge-graph-agent` | Primary source for architecture questions | `codebase-memory-mcp` via `docker exec` |
| L7 | Source code | Only the specific file returned by MCP | Never read source broadly |

> **Rule:** If you have not loaded L0–L3 and L3b, request the Guardian to load context first.

## 🧰 GENERIC RULES

This section centralizes the minimum transversal rules for every agent. Agent-specific `SKILL.md` files **must not** repeat these rules; they only contain the agent-specific addendum.

### ✅ PRE-CONDITIONS (verify before acting)

1. **CWD check**: confirm the working directory is `/workspace/cutternest-kit`.
2. **Context check**: confirm L0–L3 and this base (L3b) are loaded.
3. **Token check**: confirm a valid Guardian token is active for the exact action and resource.
4. **Scope check**: confirm the target path is within your allowed scope per `.agents/guardian/policies.json`.
5. **No secrets**: never read, write or modify `.env*` files, certificates, or secret stores.
6. **Lockfile check**: if you modify `package.json` or `frontend/package.json`, run the corresponding install command and ensure lockfiles are updated.
7. **audit.log protected**: only the Guardian may write to `.agents/guardian/audit.log`.
8. **Memory batch**: agents do not write their own memory files; report updates in the deliverable for the Guardian to apply in batch.

### 🗺️ MCP-FIRST

For architecture or impact questions, do not read source code broadly. Ask the Guardian to route the question to `knowledge-graph-agent`, which queries `codebase-memory-mcp` via `docker exec`. Only read the specific file returned by MCP.

```markdown
[AGENT: <agent-id>] → [guardian]
Query: [concrete question]
Justification: [why]
```

### 🔄 CONCURRENCY RULES

- Stay within `max_concurrent_tokens` defined in `.agents/guardian/policies.json`.
- Do not accept a new task without a valid token.
- Report `COMPLETED` or `FAILED` to the Guardian at the end.
- Do not write memory files yourself; the Guardian applies batch updates.

### 🔄 LOOP GUARDRAILS & CHECKPOINTS

- The Guardian runs `node .agents/guardian/scripts/detect-stall.mjs` before closing any swarm.
- If a stall is detected, the swarm must **not** close; escalate to the user and produce a `checkpoint_summary` in the deliverable.
- Before long refactorings or multi-turn tasks, agents must emit a checkpoint:
  ```markdown
  ## checkpoint_summary
  - Completed: [what is done]
  - Next: [next concrete step]
  - Blockers: [none | list]
  - Files touched: [list]
  ```
- Do not retry the same failed tool call more than `runtime_limits.max_retries_per_tool` times (defined in `.agents/guardian/policies.json`).
- If the same action/resource pair appears more than `guardrails.stall_detection.repetition_threshold` times in the audit log, stop and escalate.

### 🛡️ SECURITY & PROJECT RULES

- Follow `.devhive/security-policy.md` for cryptography, cookies, tokens, rate limits, HTTPS, and logging.
- Follow `.devhive/domain-rules.md` for project-specific flows (TOTP, MFA, trusted devices, RBAC, audit, LDAP, WhatsApp/Tor proxy).
- Use English names for agents and files unless the project conventions say otherwise.
- Core services live in `docker-compose.yml`; dev services in `docker-compose.dev.yml`; optional tunnels in `docker-compose.tunnels.yml` with the `cloudflared` profile.
- Workers do **not** load `policies.json` or `profile.yaml` completely; the Guardian manages tokens and scope.

### 🧠 HOST MODES — When to use Plan, Goal, Swarm, Subagents and Background tasks

The Kimi Code host (the runtime that runs this agent) exposes several execution modes. Every DevHive agent request should be routed through the optimal mode to minimize token spend and maximize correctness.

| Mode | Use when | Owner | Token strategy |
|------|----------|-------|--------------|
| **Conversational** | Quick lookup, single-file fix, question, or a task that is obviously ≤3 tool calls. | User + host | Do directly; do not spin up a swarm. |
| **Plan Mode** | Non-trivial implementation (new feature, refactor, multi-file change, architectural decision). | Host / architect | Explore first, write the plan to the plan file, get user approval before writing code. |
| **Goal Mode** | Verifiable objective that needs autonomous work across multiple turns (e.g. "make all frontend tests pass", "refactor SystemConfig into subcomponents"). | Host | Create a `Goal` with completion criterion; work autonomously and report progress. |
| **Subagent / Agent** | Focused investigation or implementation that benefits from a separate context (e.g. deep codebase exploration, parallel tasks). | Host / Guardian | Give a complete, self-contained prompt with exact paths and commands; reuse the same agent ID when continuing work. |
| **AgentSwarm** | Many independent tasks over different inputs (e.g. review N files, migrate N components). | Host / Guardian | Launch only when tasks are truly independent and parallel. |
| **Background task** | Long-running commands (builds, tests, watchers, servers) that should not block the conversation. | Host | Use `run_in_background=true`; rely on notifications instead of polling. |

### Decision rules

1. **If the task is a question or a one-line fix → act directly.** Do not create a Goal or Plan.
2. **If the task involves more than 2–3 files or an architectural choice → enter Plan Mode.** The plan must be written to the plan file and approved before implementation.
3. **If the task is a concrete, checkable outcome that may take many turns → create a Goal.**
4. **If the task requires broad exploration (>3 searches) → delegate to an `explore` subagent.**
5. **If the task is large but can be split into independent subtasks → use AgentSwarm.**
6. **If the task needs a long-running build/test/server → use a background Bash task.**

## 🧩 SUBAGENT TYPES

When the Guardian or an agent decides to delegate, use the right subagent type:

- **`coder`**: general software engineering — read, edit, run commands, return a compact summary.
- **`explore`**: read-only codebase exploration; fast for finding files, patterns, and answering questions. **Always use `explore` instead of broad grep/Glob chains when the task needs >3 searches.**
- **`plan`**: read-only implementation planning and architecture design; produces step-by-step plans and trade-off analysis.

### Subagent best practices (token savers)

- **Never make a subagent search for files/paths you already know.** Put exact file paths and commands in the prompt.
- **Reuse the same agent ID (`resume`) when continuing earlier work.** A resumed agent keeps its prior context, avoiding re-loading and re-exploring.
- **Run subagents in parallel only when tasks are independent.** Do not parallelize edits to the same file.
- **Do not delegate understanding.** If the task hinges on a line number or file path, find it yourself first and write it into the prompt.

## 🛠️ CLEAN CODE PRINCIPLES FOR DEVHIVE AGENTS

All implementation agents must produce code that is easy to read, test, and maintain. These rules are non-negotiable.

### 1. Functions and components do one thing
- Keep functions under **30 lines** of effective code when possible.
- Keep React components under **250 lines** of effective code. If a component exceeds it, split it into subcomponents or custom hooks.
- A component should own either **UI** or **logic**, not both. Move logic into custom hooks or services.

### 2. Names reveal intent
- Use descriptive names for variables, functions, types, and files.
- Avoid abbreviations unless they are universal (`id`, `url`).
- Boolean names should sound like yes/no questions: `isLoading`, `canManageUsers`, `hasPermission`.

### 3. DRY — Don't Repeat Yourself
- Extract repeated JSX, handlers, and state updates into helpers, hooks, or shared components.
- Example: if a form has six `updateX(field, value)` handlers that differ only by section, generalize to `updateSection(section, field, value)`.

### 4. No magic numbers or strings
- Extract constants with meaningful names: `MAX_PREVALIDATION_ATTEMPTS = 3`, `DEFAULT_SESSION_TTL_MINUTES = 30`.
- Use design tokens for UI values (spacing, colors, radii, shadows) instead of hardcoded values.

### 5. Strict typing — no `any`
- Never use `any` without explicit justification in a comment.
- Define types for API payloads, state, and props in `src/types/`.

### 6. Handle errors consistently
- Use `getApiErrorMessage` or equivalent helpers; do not mix `alert()`, `setMessage()`, and `console.error()` in the same flow.
- Surface actionable messages to users; log diagnostics only in development.

### 7. Comments explain intent, not mechanics
- Bad: `// increment counter`
- Good: `// keep session alive while user is active`
- Delete dead code instead of commenting it out.

### 8. Separate concerns
- **Services** own business logic and API calls.
- **Routes** own HTTP plumbing and validation.
- **Components** own presentation and user interaction.
- **Hooks** own reusable stateful logic.
- **Utils** own pure, side-effect-free helpers.

## 💰 TOKEN-SAVING RULES (MANDATORY)

Token waste usually comes from re-exploration, broad searches, and over-delegation. Apply these rules on every turn.

1. **MCP-first for architecture questions.** Ask `knowledge-graph-agent` to query `codebase-memory-mcp` before reading source code. Read only the specific file returned by MCP.
2. **Read only what you need.** Do not read entire files if you only need one function; use `Read` with `line_offset` and `n_lines`.
3. **Batch tool calls.** Issue multiple `Read`/`Grep`/`Glob` calls in parallel when they are independent.
4. **Avoid re-exploration.** If a previous agent already explored a path, read its `learnings.md` or `completed-tasks.md` instead of re-running searches.
5. **Use `Edit` for small changes.** Do not rewrite a whole file with `Write` when an `Edit` of a few lines is enough.
6. **Keep deliverables compact.** The deliverable should summarize what changed and why, not paste full source code.
7. **Prefer resume over new agents.** When a subagent already did related work, resume it (`resume` field) rather than spawning a fresh instance.
8. **Guardian batches memory updates.** Agents do not write their own memory files; they report changes in the deliverable for the Guardian to apply once at swarm close.

### Common anti-patterns that waste tokens

- Running `grep`/`find`/`rg` from shell instead of `Grep`/`Glob`.
- Spawning an agent to find a file whose path you already know.
- Creating a Plan for a single-file change.
- Reading an entire 900-line component just to change one import.
- Pasting full file contents into a deliverable.
- Running tests synchronously when a background task can do it.

## 📚 REFERENCES

- Host modes and tools: Kimi Code CLI system instructions.
- DevHive orchestration: `.agents/MASTER_PROMPT.md`, `.agents/guardian/SKILL.md`, `.agents/guardian/policies.json`.
- Token budgets and memory contracts: `.devhive/conventions-agents.md` and `.devhive/conventions-core.md`.
- Clean code reference: `.agents/TOKEN-SAVING-GUIDE.md`.
