# ADR-0016: Campo `pos_z` con posición vertical por defecto según tipo de pieza

## Estado

Aprobado — implementado

## Contexto

ADR-0015 resolvió el posicionamiento vertical de repisas y zapatero usando heurísticas de nombre. Sin embargo, el usuario no tiene control directo sobre dónde queda una pieza horizontal; todo se infiere del nombre. Esto es frágil para piezas como:

- Asientos (altura de asiento ~450 mm).
- Rieles / barras colgantes (altura de closet ~1700 mm).
- Cajones superiores e inferiores.
- Puertas altas o bajas.
- Travesaños de refuerzo.

Además, familias como `seating`, `table` y `wardrobe` tienen piezas horizontales cuya posición vertical no sigue las reglas de repisa/zapatero.

## Decisión

Añadir un campo opcional `pos_z` al modelo de pieza del Assembly Planner:

- `pos_z` es la **posición vertical preferida en mm desde la base del módulo**.
- Si está vacío (`null` / `undefined`), `verticalPositionService` calcula un valor por defecto según el rol y el nombre.
- Si el usuario lo edita, ese valor tiene prioridad.
- Se guarda en CSV como columna adicional al final, manteniendo compatibilidad con CSVs anteriores.

### Defaults por rol/keyword

| Rol / keyword | Default `pos_z` | Descripción |
|---|---|---|
| `zapatero` | `20.0` | justo encima del zócalo |
| `bottom_panel` (zócalo/base) | `0.0` | en la base |
| `top_panel` (tapa) | `moduleH - thickness` | en la tapa |
| `shelf` + `superior/sup/alto/top` | `moduleH - thickness - 120` | cerca de la tapa |
| `shelf` + `inferior/inf/bajo/bottom` | `thickness + 80` | cerca de la base |
| `shelf` (sin keyword) | distribuido | espacio restante |
| `hanger_rail` | `1700.0` | altura estándar de closet |
| `seat_panel` | `450.0` | altura estándar de asiento |
| `drawer_face` / `drawer_bottom` | según `drawerRank` | distribuidos verticalmente |
| `door` + `superior` | `moduleH - doorH - thickness` | puerta alta |
| `door` + `inferior` | `thickness` | puerta baja |
| `brace` + `superior` | `moduleH - thickness - braceH` | refuerzo superior |
| `brace` + `inferior` | `thickness` | refuerzo inferior |
| otros | `moduleH / 2` | centro por defecto |

### Regla de prioridad

1. Si `piece.pos_z` es un número finito → usarlo.
2. Si no, inferir zona desde el nombre/rol con `verticalPositionService`.
3. Si la zona es `top`/`bottom`/`fixed-bottom`, aplicar el offset por defecto.
4. Si la zona es `middle`, distribuir uniformemente en el espacio libre.

### Cambios en capas

- **`js/services/verticalPositionService.js`**: añadir `getDefaultVerticalPosition(piece, moduleH, thickness)` y refactorizar `calculateVerticalPositions` para respetar `piece.pos_z`.
- **`js/csvParser.js`**: añadir `pos_z` a `EXPECTED_HEADERS` (al final), parsear y exportar. `createEmptyPiece` inicia `pos_z: null`.
- **`js/views/csvView.js`**: columna editable `Pos. Z (mm)` con placeholder que muestra el default calculado. Si el input queda vacío, no se persiste (`null`).
- **`js/isometricRenderer.js`** y **`js/views/manualView.js`**: ya usan `calculateVerticalPositions`; solo validar que `pos_z` se respete.
- **Tests**: `js/services/__tests__/verticalPositionService.test.js` y test de carga CSV con `pos_z`.

| A18 | Panel inline de configuración de offsets en vista isométrica | assembly-planner-agent | `js/components/inlineVerticalConfig.js`, `js/views/isometricView.js` |

## Consecuencias

- El usuario puede ajustar la altura de cualquier pieza horizontal desde la tabla CSV sin renombrarla.
- Los CSVs antiguos siguen funcionando: `pos_z` será opcional y se rellena con defaults.
- El backend (`backend/app/assembly.py`) no se toca en este ciclo; se mantiene la semántica de nombres ya implementada.

### Panel de configuración de offsets (A16.7)

Para permitir que el usuario final ajuste los offsets sin tocar código fuente, se añadirá:

- **`js/services/userConfigService.js`**: lee/escribe configuración de usuario en `localStorage` (clave `cn-assembly-config`).
  - `loadUserConfig()` devuelve un merge de `VERTICAL_POSITIONS` con lo guardado.
  - `saveUserConfig(config)` persiste solo los overrides.
- **`js/core/store.js`**: añade campo `userConfig` al estado inicial.
- **`js/views/settingsView.js`**: nueva vista con inputs numéricos para cada offset de `VERTICAL_POSITIONS`.
- **`js/app.js`**: acciones `updateUserConfig(key, value)` y navegación a la vista de ajustes.
- Los servicios `verticalPositionService` aceptarán un objeto `overrides` (o leerán `store.get().userConfig`) al calcular posiciones.

De esta forma los defaults siguen versionados en `config.js`, pero el usuario puede sobreescribirlos desde la interfaz y persistirlos localmente.

### Panel inline en vista isométrica (A18)

Para mejorar la experiencia de usuario, se añadirá un panel flotante dentro de la **vista isométrica 3D** que permita editar los mismos offsets verticales sin salir de la vista.

- **`js/components/inlineVerticalConfig.js`** (nuevo): componente reutilizable con inputs para cada offset de `VERTICAL_POSITIONS`.
  - Importa `VERTICAL_POSITIONS` desde `core/config.js`.
  - Lee `store.get().userConfig` para mostrar valores actuales.
  - Llama a `updateUserConfig(key, value)` al cambiar un input.
  - Incluye botón para restaurar defaults.
- **`js/views/isometricView.js`**:
  - Renderiza `inlineVerticalConfig` en un panel lateral o flotante (p. ej. esquina superior derecha).
  - Se suscribe a `userConfig:changed` para re-renderizar la escena isométrica automáticamente.
- **`js/core/store.js`**:
  - Emite evento `userConfig:changed` cuando cambia `state.userConfig`.

De esta forma el usuario ajusta la posición vertical mientras ve el resultado en 3D, sin cambiar de pantalla.

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A16.1 | Añadir `pos_z` al modelo y CSV parser/export | assembly-planner-agent | `js/csvParser.js`, `js/app.js` |
| A16.2 | Extender `verticalPositionService.js` con defaults por rol y respetar `pos_z` | assembly-planner-agent | `js/services/verticalPositionService.js`, tests |
| A16.3 | Añadir columna editable en `csvView.js` con placeholder del default | assembly-planner-agent | `js/views/csvView.js` |
| A16.4 | Validar que `isometricRenderer.js` y `manualView.js` usen el nuevo servicio | assembly-planner-agent | `js/isometricRenderer.js`, `js/views/manualView.js` |
| A16.5 | Añadir tests de integración y servicio | assembly-planner-agent | tests |
| A16.6 | Centralizar offsets de posición vertical en `js/core/config.js` | assembly-planner-agent | `js/core/config.js`, `js/services/verticalPositionService.js`, tests |
| A16.7 | Panel de configuración de offsets verticales editable por el usuario | assembly-planner-agent | `js/core/store.js`, `js/services/userConfigService.js`, `js/views/settingsView.js`, `js/app.js` |
