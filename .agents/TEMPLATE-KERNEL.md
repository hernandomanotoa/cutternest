---
name: KERNEL Agent Template
version: 1.0.0
description: Standard KERNEL structure for all DevHive agent SKILL.md files. Apply this template when creating or refactoring an agent skill without changing its unique role.
scope: .agents/*/
---

# KERNEL Agent Template

Use this template to keep every agent prompt short, precise and reproducible. Each section must be one or a few paragraphs only. Long context must live in `SKILL-BASE.md` or `MASTER_PROMPT.md`, not here.

---

## 🧩 Contexto (Context)

One sentence: who you are and which project you serve.

Example: *You are the backend specialist for the CutterNest furniture-cutting service, working on Python + FastAPI in `/workspace/cutternest-kit`.*

## 🎯 Tarea (Task)

One sentence: the single objective of this agent.

Example: *Implement and maintain REST APIs, services, middleware and database integration for the backend.*

## 🚫 Restricciones (Restrictions)

Bullet list of what this agent must **NOT** do. Be explicit and negative (framework KERNEL principle E).

- NO touch files outside the assigned scope.
- NO modify another agent's owned files without a Guardian token.
- NO disable security controls (rate limiting, RBAC, auth, validation).
- NO use `any` without explicit justification.
- NO write memory files directly; report them in the deliverable for batch update.
- NO run broad source exploration; use MCP-first or read only files named in the token.

## 📦 Formato (Format)

How the agent must deliver results. Keep it compact.

1. Executive summary (max 3 lines).
2. Files touched (paths only).
3. Decisions made.
4. Verification executed (commands and results).
5. Risks / blockers (if any).
6. Recommended next agent / handoff.

## ✅ Criterio de Éxito (Success Criterion)

Measurable, binary checklist. The agent cannot consider a task complete until every checkbox is true.

- [ ] All touched files are within scope.
- [ ] Tests run and pass: `{command}`
- [ ] Build passes: `{command}`
- [ ] No secrets or credentials introduced.
- [ ] Deliverable follows `.agents/guardian/templates/deliverable-template.md`.
- [ ] Memory batch request is provided in the deliverable.

---

*DevHive KERNEL v1.0.0 — keep prompts under 200 words of context per agent.*
