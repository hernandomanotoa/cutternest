# ADR-0012: Refactor UI/UX con componentes base y Zustand

## Estado

Aprobado

## Contexto

El frontend React creció orgánicamente durante el MVP. Las páginas principales (`Dashboard`, `QuotePage`, `InventoryPage`, `ProjectsPage`, `OptimizerPage`, `AssemblyPage`) tienen estilos y componentes locales duplicados. Para escalar y mantener consistencia, se decide introducir:

- Componentes UI base reutilizables (botones, cards, diálogos, inputs, tabs, etc.).
- Stores globales con Zustand para selección de piezas y command palette.
- Hooks reutilizables (`useTheme`, `useUndoableAction`).
- Mejoras en tipos (`frontend/src/types/index.ts`) y utilidades (`cn.ts`).

## Decisión

- Crear `frontend/src/components/ui/` con componentes estilo shadcn/ui: `Button`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Input`, `Badge`, `Select`, `ScrollArea`, `Skeleton`, `Tooltip`, `Separator`.
- Crear `frontend/src/components/layout/` (`AppLayout`, `Header`, `Sidebar`) y `frontend/src/components/providers/` (`ThemeProvider`).
- Crear `frontend/src/components/command-palette/CommandPalette.tsx` para navegación rápida.
- Crear `frontend/src/stores/` con Zustand: `selectionStore.ts`, `commandStore.ts`.
- Usar `clsx` + `tailwind-merge` via `frontend/src/utils/cn.ts`.
- Añadir dependencias: `zustand`, `recharts`, `jspdf`, `html2canvas`.
- Mantener Tailwind como única fuente de estilos; no CSS-in-JS ad hoc.

## Consecuencias

### Positivas

- Consistencia visual y menor duplicación de código.
- Estado global simple sin boilerplate de Context.
- Mejor soporte para dark mode y theming.
- Recharts habilita dashboards con gráficos.

### Negativas

- Nuevas dependencias aumentan tamaño de bundle y requieren `pnpm-lock.yaml`.
- Build offline bloqueado hasta instalar dependencias.
- Mayor cantidad de archivos y convenciones que documentar.

## Referencias

- `frontend/src/components/ui/`
- `frontend/src/components/layout/`
- `frontend/src/components/providers/`
- `frontend/src/components/command-palette/`
- `frontend/src/stores/`
- `frontend/src/utils/cn.ts`
- `frontend/package.json`
