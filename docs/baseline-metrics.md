# Métricas Baseline — Sistema Agentic DevHive/CutterNest

**Fecha:** 2026-08-21  
**Propósito:** Línea base para medir la mejora de la migración incremental del sistema agentic.

## Agentes y skills

| Métrica | Valor |
|---|---|
| Agentes activos | 9 |
| Plugins declarados | 4 |
| Archivos `SKILL.md` | 10 |
| Líneas totales en `SKILL.md` | 904 |
| SKILL.md más largo | 99 líneas (`db-agent/SKILL.md`) |
| SKILL.md más corto | 71 líneas (`architect/SKILL.md`) |

### Tamaño por SKILL.md

| Agente | Líneas | Tokens estimados |
|---|---|---|
| architect | 71 | ~142 |
| auth-agent | 91 | ~182 |
| backend-agent | 94 | ~188 |
| db-agent | 99 | ~198 |
| deploy-agent | 96 | ~192 |
| docs-agent | 86 | ~172 |
| frontend-agent | 88 | ~176 |
| guardian | 97 | ~194 |
| knowledge-graph-agent | 94 | ~188 |
| test-agent | 88 | ~176 |

> Estimación de tokens: líneas × 2 (heurística conservadora para markdown estructurado).

## Infraestructura DevHive

| Métrica | Valor |
|---|---|
| Archivos en `.agents/` | 1,238 |
| Archivos en `.devhive/` | 30 |
| Archivos en `scripts/` | 30 |
| Scripts `.mjs` en `scripts/` | 17 |
| Librerías `.mjs` en `scripts/lib/` | 2 |
| Llamadas a `console.*` en scripts productivos | 61 |
| Stubs de knowledge graph | 82 |
| Stubs por encima de 50 tokens | 0 |

## Validaciones actuales

Todas las validaciones del sistema DevHive pasan:

```bash
node scripts/validate-devhive.mjs          # PASS
node scripts/audit-stub-tokens.mjs         # PASS (0 stubs > 50 tokens)
node .agents/guardian/scripts/guardrails-dry-run.mjs  # PASS
node scripts/run-tests.mjs                 # PASS (17 tests)
```

## Objetivos de mejora

1. Reducir tokens base por tarea simple a < 4,000.
2. Eliminar llamadas directas a `console.*` en scripts productivos.
3. Centralizar límites de runtime en `config/runtime-config.yaml`.
4. Tener visibilidad de costo por sesión/agente.
5. Persistir checkpoints y artifacts de trabajo.
6. Mantener 100 % de tests pasando tras cada fase.

## Notas

- `.agents/` está en `.gitignore`; las mejoras deben asumirse como infraestructura local.
- MCP (`codebase-memory-mcp`) es la fuente de verdad; no se crearán MCP servers propios.
- Kimi Code provee Goal/Plan/Swarm; no se duplicará esa capacidad.
