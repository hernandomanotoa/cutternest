# ADR-0015: Posicionamiento vertical de repisas, zapatero y piezas por zona

## Estado

Aprobado — implementado

## Contexto

En el Assembly Planner y en el backend se posicionan repisas y zapatero usando reglas genéricas:

- `frontend/public/assembly-planner/js/services/geometryService.js::calculateShelfPositions` distribuye las repisas uniformemente en el alto del módulo, ordenándolas por `shelfRank`.
- `frontend/public/assembly-planner/js/views/manualView.js` sí separa visualmente repisas `superior`, `inferior` y `medio`, pero esa lógica no es reutilizable por `isometricRenderer.js` ni por `geometryService.js`.
- `backend/app/assembly.py::_position_for_kind` coloca repisas (`repisa`) y zapatero (`zapatero`) siempre a la mitad de la altura del módulo.

Esto genera inconsistencias: una repisa marcada como "inferior" o un zapatero no quedan abajo, y una repisa "superior" no queda arriba, en las vistas 3D, el manual SVG y el backend de ensamblaje.

## Decisión

Crear un único servicio de posicionamiento vertical en el Assembly Planner y replicar la misma semántica en el backend.

### Reglas de posición

Para cada pieza con rol `shelf` o nombres relacionados, se determina una **zona vertical** según su nombre:

| Palabras en nombre / id | Zona | Posición dentro del módulo |
|---|---|---|
| `zapatero` | `fixed-bottom` | Justo encima del zócalo/base; no comparte espacio con repisas inferiores. |
| `superior`, `sup`, `alto`, `top` | `top` | Cerca de la tapa (parte superior interna). |
| `inferior`, `inf`, `bajo`, `bottom`, `base` (cuando es repisa) | `bottom` | Cerca de la base/zócalo (parte inferior interna). |
| `medio`, `central`, `centro` | `middle` | Distribuido en el espacio restante. |
| sin palabra clave | `middle` | Distribuido en el espacio restante. |

### Algoritmo de distribución

1. Determinar la zona de cada pieza.
2. Reservar espacio en `top` y `bottom` según el espesor/altura de las piezas que caigan allí.
3. El espacio restante se asigna a las piezas `middle` distribuidas equidistantemente.
4. Si hay `fixed-bottom` (zapatero), se ubica lo más abajo posible, con un pequeño margen sobre la base, y se dibuja/aplica independientemente de las repisas `bottom`.

### Cambios en capas

- **`js/services/verticalPositionService.js`** (nuevo): funciones puras `determineVerticalZone(piece)` y `calculateVerticalPositions(moduleH, thickness, pieces)`.
- **`js/services/geometryService.js`**: reescribir `calculateShelfPositions` para delegar en `verticalPositionService`.
- **`js/isometricRenderer.js`**: usar directamente `calculateVerticalPositions`.
- **`js/views/manualView.js`**: reemplazar la lógica inline de `drawRepisaGroup` por `calculateVerticalPositions`.
- **`backend/app/assembly.py`**: actualizar `_position_for_kind` para `repisa` y `zapatero`, usando la misma semántica de nombres.
- **Tests**: añadir tests en `frontend/public/assembly-planner/js/services/__tests__/verticalPositionService.test.js` y `backend/tests/test_assembly.py`.

## Consecuencias

- Un zapatero siempre se verá en la parte inferior de la vista isométrica y del manual.
- Repisas superior/inferior se renderizarán coherentemente en todas las vistas.
- El backend y el frontend compartirán la misma semántica de nombres para posicionamiento vertical.
- Se reduce la lógica duplicada entre `manualView.js` e `isometricRenderer.js`.

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A13.1 | Crear `verticalPositionService.js` con `determineVerticalZone` y `calculateVerticalPositions` | assembly-planner-agent | `js/services/verticalPositionService.js`, tests |
| A13.2 | Refactorizar `calculateShelfPositions` para usar `verticalPositionService` | assembly-planner-agent | `js/services/geometryService.js` |
| A13.3 | Actualizar `isometricRenderer.js` para usar `calculateVerticalPositions` | assembly-planner-agent | `js/isometricRenderer.js` |
| A13.4 | Refactorizar `manualView.js` para reutilizar `verticalPositionService` | assembly-planner-agent | `js/views/manualView.js` |
| A13.5 | Actualizar backend `_position_for_kind` para repisa/zapatero | backend-agent | `backend/app/assembly.py`, `backend/tests/test_assembly.py` |
| A13.6 | Validar con ejemplos CSV (zapatero, repisas superior/inferior) | test-agent | `frontend/public/assembly-planner/data/*.csv` |
