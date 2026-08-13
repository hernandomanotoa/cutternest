# Deuda técnica frontend — seguimiento Guardian

## Estado actual (2026-08-06, post-sprint)

La deuda crítica de inline styles en el frontend ha sido resuelta.

- ✅ `frontend/src/components/` y `frontend/src/hooks/` tienen **0** bloques `style={{...}}`, excepto `src/components/ui/Spinner.tsx` (tamaño dinámico por props, justificado).
- ✅ `pnpm typecheck` pasa sin errores.
- ✅ `pnpm test` pasa **243/243** tests en 37 archivos.
- ✅ `pnpm build` genera el bundle de producción sin errores.
- ✅ Ningún componente supera 250 líneas efectivas.
- ✅ Sin `any` injustificados en `src/components/` ni `src/hooks/`.
- ✅ MCP re-indexado tras los cambios.
- ✅ Ajuste responsive de tablas administrativas: `UserManagement`, `DocumentList`, `RoleManagement` y `AuditLog` usan `ResponsiveTable` con card mode (< 768 px), columnas ocultas progresivas (< 1024 px), y modales de detalle (`UserDetailModal`, `DocumentDetailModal`, `RoleDetailModal`).

## Resumen de cambios del sprint

- M1: refactor de `SystemConfig.tsx` en subcomponentes + hooks.
- M2: componentes admin (`UserManagement`, `AuditLog`, `RoleManagement`, `ActiveSessions`) migrados a HIG/responsive con `ResponsiveTable`, `MobileModal`, `FormGrid`.
- M3: eliminación de `any` y estilos inline; componentes grandes (`TOTPVerify`, `DocumentView`) reducidos a ≤250 líneas.
- Limpieza final de inline styles en: `Layout`, `GlobalSearch`, `SearchResults`, `DocumentList`, `MarkdownUpload`, `DocumentEditor`, `LoginLDAP`, `LoginLocal`, `UserProfile`, `LoginActivityCard`, `Dashboard`, `TOTPSetup`, `Navbar`.

## Notas

- `Spinner.tsx` mantiene `style={{ width: sizePx, height: sizePx }}` porque su tamaño es una prop dinámica (`size`). Esto es aceptable y no se considera deuda.
- Quedan warnings preexistentes de React Router v7 (`future flags`) y `act(...)` en `SearchResults.test.tsx`; no afectan la funcionalidad ni los tests, pero pueden abordarse en un sprint de polish.
- El bundle de producción tiene chunks >500 kB (principalmente Mermaid y KaTeX); esto es una oportunidad de optimización separada mediante `manualChunks` o imports dinámicos.

## Última validación

```bash
cd /workspace/flujo-autentificacion/frontend
pnpm typecheck  # OK
pnpm test       # 243/243 passed
pnpm build      # OK
```
