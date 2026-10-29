# Security Check Skill

Use this checklist before finishing any task.

- [ ] No `.env*` files, certificates, or secret stores were read or written.
- [ ] No credentials, tokens, or keys appear in logs, code, or deliverables.
- [ ] Auth/crypto changes were reviewed by `@auth-agent`.
- [ ] Rate limiting, RBAC, and audit logging remain intact.
- [ ] User input is validated and sanitized.
- [ ] SQL queries use parameters; no string concatenation.
- [ ] No dangerous commands (`rm -rf /`, `DROP DATABASE`, etc.) were executed.

If any item fails, stop and escalate to the Guardian.
