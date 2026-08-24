# How to Request a Task from the DevHive Agent Team

This guide is project-agnostic and can be reused in any DevHive-enabled repository. It explains how to ask the agent swarm for a new development task so that the request is understood, routed, and executed efficiently.

> **Project-specific practical guide (Spanish / Kimi Code):** `docs/AGENT-WORKFLOW.md`  
> **Current project**: `CutterNest`  
> **DevHive version**: `2.2.0`  
> **MCP project name**: `cutternest-kit`

---

## 1. Before you ask

1. **Check the current sprint**  
   Read `.devhive/current-sprint.md` to confirm the request aligns with active priorities.

2. **Check existing tasks**  
   Look at `.agents/{agent}/memory/active-tasks.md` and `.agents/guardian/memory/queue.md` to avoid duplicates.

3. **Use MCP-first discovery**  
   If the task touches existing code, ask the Guardian to route an impact question to `knowledge-graph-agent` before filing the request. Example:

   ```markdown
   [USER] → [Guardian]
   Request: impact analysis before changing user roles
   Target: backend/src/services/roleService.ts
   Please route to knowledge-graph-agent for a trace_path query.
   ```

---

## 2. What to include in a task request

A good request has **six parts**. The more precise you are, the fewer clarification rounds the swarm needs.

| Part | Description | Example |
|---|---|---|
| **Goal** | One-line outcome | Add CSV export to the audit log report |
| **Scope** | Files, components, or agent domain | `backend/src/services/reportService.ts`, `backend/src/routes/reports.ts` |
| **Context** | Why this is needed and what already exists | Auditors need raw data; current endpoint only returns JSON/PDF |
| **Acceptance criteria** | Verifiable finish line | `GET /api/reports/audit/csv` returns RFC-4180 CSV with same filters as JSON endpoint; tests pass; typecheck OK |
| **Priority / urgency** | P0–P3 or deadline | P2, needed before end of sprint |
| **Constraints** | Security, compatibility, or policy rules | Must reuse existing `reportService.ts`; no new npm deps without approval |

---

## 3. Generic request template

Copy and fill in the brackets:

```markdown
## Task Request

**Goal:** [one sentence]

**Scope:**
- Backend: [files or services]
- Frontend: [components or pages]
- DB: [migrations or schema changes]
- Infra: [docker/nginx changes if any]

**Context:**
[2–3 sentences explaining the business/technical reason]

**Acceptance criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
- [ ] All existing tests still pass
- [ ] Type-check and build pass

**Priority:** [P0/P1/P2/P3]

**Estimated agent owner:** [backend-agent | frontend-agent | db-agent | deploy-agent | auth-agent | test-agent | docs-agent | other]

**Constraints / notes:**
- [e.g., "Reuse existing `reportService.ts`"]
- [e.g., "No new dependencies without Guardian approval"]
- [e.g., "Must work with current role-based permissions"]

**MCP context already loaded?** [yes / no / please route to knowledge-graph-agent]
```

---

## 4. How to send the request

Address the **Guardian** directly. The Guardian is the only entry point for new work.

### Example 1: backend feature

```markdown
[USER] → [Guardian]

Task: Add CSV export to audit reports
Scope: backend/src/services/reportService.ts, backend/src/routes/reports.ts
Acceptance:
- Add GET /api/reports/audit/csv
- Reuse filters from GET /api/reports/audit
- Return text/csv with RFC-4180 escaping
- Tests and typecheck pass
Priority: P2
Please route to backend-agent after impact analysis.
```

### Example 2: frontend fix

```markdown
[USER] → [Guardian]

Task: Show loading skeleton in DocumentView while content loads
Scope: frontend/src/components/DocumentView.tsx, frontend/src/components/ui/Skeleton.tsx
Acceptance:
- Replace "Cargando..." text with theme-aware skeleton
- Skeleton disappears once content_html is ready
- Existing DocumentView tests still pass
Priority: P1
Please route to frontend-agent.
```

### Example 3: cross-cutting change

```markdown
[USER] → [Guardian]

Task: Rename `identityOrigin` to `authProvider` across the stack
Scope: backend types/services/routes + frontend types/services/components + DB column
Acceptance:
- All references updated consistently
- API contract remains backward-compatible for one release
- Migration script provided
- Tests pass on backend and frontend
Priority: P0
This is cross-cutting: please involve architect, backend-agent, frontend-agent, and db-agent with a coordinated token plan.
```

---

## 5. What happens after you send the request

1. **Guardian triage**
   - Validates the request against current sprint, policies, and queue.
   - Routes to the right agent(s).
   - If architecture/impact is unclear, asks `knowledge-graph-agent` via MCP first.

2. **Token emission**
   - The Guardian emits one token per scoped action.
   - The agent records the task as `IN_PROGRESS` in its `active-tasks.md` and `queue.md`.

3. **Execution**
   - The agent loads L0–L4 memory, consults MCP when needed, implements, tests, and reports.
   - You may receive clarifying questions if acceptance criteria are ambiguous.

4. **Closure**
   - The agent delivers a standard DevHive deliverable.
   - The Guardian updates memories in batch.
   - If source code changed, `knowledge-graph-agent` re-indexes MCP and refreshes stubs.
   - `integration-validator` runs final checks.

5. **Result**
   - You get a deliverable with: what changed, why, tests/build status, security review, and next steps.

---

## 6. Dos and don'ts

### ✅ Do

- Be specific about scope and acceptance criteria.
- Mention files or components you already suspect will change.
- Ask for MCP impact analysis for risky or cross-cutting changes.
- Provide examples or edge cases.
- Indicate priority honestly.

### ❌ Don't

- Send multiple unrelated tasks in one message.
- Skip the scope and say "just make it work".
- Ask an individual worker agent directly for new work; always go through the Guardian.
- Request changes outside the current sprint without explaining why.

---

## 7. Quick reference

| If you want... | Ask... |
|---|---|
| A new feature or bug fix | Guardian |
| Impact analysis before a change | Guardian → knowledge-graph-agent (MCP) |
| A schema change | Guardian → db-agent (with architect approval) |
| A UI component | Guardian → frontend-agent or frontend-template-agent |
| Security review | Guardian → auth-agent |
| Tests for an existing change | Guardian → test-agent |
| Documentation update | Guardian → docs-agent |
| Deployment / Docker change | Guardian → deploy-agent |
| Dependency audit | Guardian → dependency-checker (plugin) |
| Final integration validation | Guardian → integration-validator (plugin) |

---

## 8. References

- `docs/AGENT-WORKFLOW.md` — Spanish-language practical guide for the current project, including Kimi Code examples and common mistakes.
- `docs/AGENTS.md` — agent team overview and responsibilities.
- `.agents/guardian/SKILL.md` — full Guardian prompt.
- `.agents/guardian/policies.json` — permissions, concurrency and guardrails.

---

## 9. Glossary

- **Guardian**: orchestrator that owns the token lifecycle and agent routing.
- **Token**: authorization to perform one specific action on one specific resource.
- **MCP**: `codebase-memory-mcp`, the AST-based graph engine queried via `docker exec`.
- **Hot memory**: files loaded by default (`active-tasks.md`, `queries.md`, `edges.md`).
- **Cold memory**: files loaded only on demand (`completed-tasks.md`, `queries.cold.md`).
- **Stub**: a slim node description in `.agents/knowledge-graph-agent/memory/graph/`.

---

*DevHive v2.2.0 — Generic task request guide.*
