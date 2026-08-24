# Inventario de Skills y Memoria — DevHive/CutterNest

**Fecha:** 2026-08-21  
**Propósito:** Visibilidad de la carga de contexto que cada agente introduce.

## Skills principales

| Agente | SKILL.md | Líneas | Tokens estimados | Rol principal |
|---|---|---|---|---|
| architect | `.agents/architect/SKILL.md` | 71 | ~142 | Diseño y ADRs |
| auth-agent | `.agents/auth-agent/SKILL.md` | 91 | ~182 | Autenticación y crypto |
| backend-agent | `.agents/backend-agent/SKILL.md` | 94 | ~188 | APIs y lógica de negocio |
| db-agent | `.agents/db-agent/SKILL.md` | 99 | ~198 | Esquema y migraciones |
| deploy-agent | `.agents/deploy-agent/SKILL.md` | 96 | ~192 | Docker y compose |
| docs-agent | `.agents/docs-agent/SKILL.md` | 86 | ~172 | Documentación |
| frontend-agent | `.agents/frontend-agent/SKILL.md` | 88 | ~176 | UI React/TS |
| guardian | `.agents/guardian/SKILL.md` | 97 | ~194 | Orquestación y permisos |
| knowledge-graph-agent | `.agents/knowledge-graph-agent/SKILL.md` | 94 | ~188 | Grafo de arquitectura |
| test-agent | `.agents/test-agent/SKILL.md` | 88 | ~176 | Tests |

**Total:** 10 skills, 904 líneas, ~1,808 tokens estimados.

## Skills compartidas / base

| Archivo | Líneas | Tokens estimados | Descripción |
|---|---|---|---|
| `.agents/SKILL-BASE.md` | ~175 | ~350 | Reglas genéricas para todos los agentes |
| `.agents/TOKEN-SAVING-GUIDE.md` | ~30 | ~60 | Guía de ahorro de tokens |
| `.agents/TEMPLATE-KERNEL.md` | ~15 | ~30 | Plantilla KERNEL para skills |
| `.agents/templates/rendered/MASTER_PROMPT.md` | ~220 | ~440 | Protocolo completo del Guardian |

## Memoria por agente

Cada agente tiene un directorio `.agents/{agent}/memory/` con archivos estándar:

- `active-tasks.md` — tareas en curso
- `queue.md` — cola de tareas
- `blockers.md` — bloqueos activos
- `learnings.md` — aprendizajes
- `completed-tasks.md` — tareas completadas

### Resumen de archivos de memoria

| architect | 5 | 61 |
| auth-agent | 5 | 86 |
| backend-agent | 4 | 45 |
| db-agent | 5 | 64 |
| deploy-agent | 5 | 88 |
| docs-agent | 5 | 46 |
| frontend-agent | 5 | 75 |
| guardian | 5 | 41 |
| knowledge-graph-agent | 9 | 548 |
| test-agent | 5 | 86 |

## Stubs del knowledge graph

| Ubicación | Archivos | Tokens totales estimados |
|---|---|---|
| `.agents/knowledge-graph-agent/memory/graph/*.md` | 82 | ~2,794 |

> Valor exacto medido por `scripts/audit-stub-tokens.mjs`.

## Contexto base cargado por un agente típico

Para cualquier agente, el contexto base incluye:

1. L0: `.devhive/project-brief.md`
2. L1: `.devhive/conventions.md`
3. L2: `.devhive/current-sprint.md`
4. L3: `.agents/{agent}/SKILL.md`
5. L3b: `.agents/SKILL-BASE.md`
6. L4: `.agents/{agent}/memory/active-tasks.md`
7. L5 (bajo demanda): `.devhive/security-policy.md`, `.devhive/domain-rules.md`

**Carga base estimada:** 1,500–2,500 tokens por agente antes de leer código fuente.

## Oportunidades de optimización

1. **Lazy loading L5:** `.devhive/security-policy.md` y `.devhive/domain-rules.md` solo cargar cuando la tarea lo requiera.
2. **Selección dinámica de skills:** no cargar skills de agentes no involucrados en la tarea.
3. **Resumen de memorias largas:** `learnings.md` y `completed-tasks.md` pueden resumirse cuando exceden 50 líneas.
4. **Eliminar stubs obsoletos:** algunos stubs en `memory/graph/` hacen referencia a componentes del proyecto anterior (LDAP, SMS, WhatsApp) que no aplican al MVP CutterNest.

## Notas

- Tokens estimados = líneas × 2 (heurística conservadora).
- El objetivo de la migración es reducir la carga base de tareas simples a < 4,000 tokens.
