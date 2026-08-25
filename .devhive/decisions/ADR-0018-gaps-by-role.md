# ADR-0018: Offsets configurables por rol para todos los tipos de mueble

## Estado

Aprobado — implementado

## Contexto

El Assembly Planner tenía offsets verticales solo para estantes, zapateros, repisas superior/inferior, asiento y riel colgador. Otros roles críticos usaban valores fijos o distribución uniforme:

- `drawer_face`: posicionado por rank fijo.
- `door`: posicionada por altura total o ancho dividido sin gap configurable.
- `brace` (travesaño/tirante): centrado por defecto.
- `mirror` (espejo): a altura de ojos fija.
- `leg` (pata): margen desde el lateral fijo en 20 mm.

Esto generaba renders poco realistas y una discrepancia entre el Assembly Planner (frontend) y el ensamblaje 3D del backend (`backend/app/assembly.py`).

## Decisión

Extender `VERTICAL_POSITIONS` con offsets por rol y aplicarlos en `verticalPositionService.js`, `isoGeometryService.js`, `isometricRenderer.js`, `manualView.js` y `backend/app/assembly.py`.

### Nuevos offsets

```js
export const VERTICAL_POSITIONS = {
  // ... existentes ...
  drawerFaceGap: 20,
  drawerBottomOffset: 80,
  doorGap: 2,
  doorTopOffset: 0,
  doorBottomOffset: 0,
  braceTopOffset: 120,
  braceBottomOffset: 80,
  mirrorOffset: 120,
  legOffsetX: 20,
};
```

### Reglas de posición por rol

| Rol | Regla |
|---|---|
| `drawer_face` | `drawerBottomOffset` como altura base; `drawerFaceGap` entre frentes consecutivos. |
| `door` | `doorTopOffset`/`doorBottomOffset` según keyword; `doorGap` entre puertas dobles. |
| `brace` | `braceTopOffset`/`braceBottomOffset` según keyword; centrado por defecto. |
| `mirror` | `mirrorOffset` desde la tapa. |
| `leg` | `legOffsetX` como margen desde laterales/frontal/trasero. |

### Cambios en capas

- **`js/core/config.js`**: nuevos offsets.
- **`js/services/verticalPositionService.js`**: `getDefaultVerticalPosition` usa funciones específicas por rol (`getDrawerDefaultPosition`, `getDoorDefaultPosition`, `getBraceDefaultPosition`) y espejo.
- **`js/services/isoGeometryService.js`**: `inferDoorZ`, `inferBraceZ`, `inferLegX`, `inferLegY` aceptan overrides.
- **`js/isometricRenderer.js`**: pasa `this.verticalPositionOverrides` a helpers; aplica `doorGap` en puertas globales; aplica `drawerFaceGap` en `_buildDrawerGeometries`; aplica `mirrorOffset` al espejo.
- **`js/views/manualView.js`**: posiciona travesaños con `getDefaultVerticalPosition` convertido a SVG.
- **`js/views/settingsView.js` e `js/components/inlineVerticalConfig.js`**: UI con nuevos campos.
- **`backend/app/assembly.py`**: constante `_VERTICAL_OFFSETS` duplicada; `_position_for_kind` y bucles de estantes/zapateros/cajones usan index/count y los offsets.

## Consecuencias

- Todos los renders (isométrico, manual y backend) comparten los mismos offsets configurables.
- El usuario puede ajustar gaps desde Settings o el panel inline sin editar código.
- El backend requiere mantener `_VERTICAL_OFFSETS` sincronizado con el frontend hasta que exista un mecanismo compartido (JSON/API).

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A18.1 | Extender `VERTICAL_POSITIONS` y UI | frontend-agent | `js/core/config.js`, `js/views/settingsView.js`, `js/components/inlineVerticalConfig.js` |
| A18.2 | Aplicar offsets en posicionamiento vertical | assembly-planner-agent | `js/services/verticalPositionService.js`, `js/services/isoGeometryService.js` |
| A18.3 | Aplicar offsets en renderizador isométrico | assembly-planner-agent | `js/isometricRenderer.js` |
| A18.4 | Aplicar offsets en manual SVG | assembly-planner-agent | `js/views/manualView.js` |
| A18.5 | Sincronizar backend | backend-agent | `backend/app/assembly.py` |
| A18.6 | Actualizar tests y documentar | test-agent | `js/services/__tests__/*.test.js`, `.devhive/decisions/ADR-0018*.md` |
