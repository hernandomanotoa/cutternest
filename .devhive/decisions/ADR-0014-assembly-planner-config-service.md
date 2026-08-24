# ADR-0014: Refactorización del Assembly Planner — store, servicios y configuración centralizada

## Estado

Aprobado en curso

## Contexto

El Assembly Planner vanilla (`frontend/public/assembly-planner/`) creció orgánicamente: la lógica de módulos, normalización, clasificación de piezas y colores estaba dispersa o duplicada entre `utils.js`, `svgEngine.js`, `isometricRenderer.js` y las vistas. Esto dificultaba:

- Cambiar una paleta de color o un umbral sin tocar múltiples archivos.
- Reutilizar la lógica pura en otros contextos (tests, backend futuro).
- Detectar ciclos de dependencias y errores de importación.

## Decisión

Aplicar una arquitectura de capas dentro del Assembly Planner:

1. **`js/core/`**: infraestructura transversal.
   - `store.js`: estado global inmutable con eventos.
   - `config.js`: constantes, colores, thresholds, Z-index, estilos de dependencias.
2. **`js/utils/`**: utilidades puras sin DOM.
   - `normalize.js`: normalización de texto y búsquedas por keyword.
3. **`js/services/`**: lógica de negocio pura, testeable.
   - `classifierService.js`: inferencia de roles y familia de mueble.
   - `moduleService.js`: agrupación, filtrado y etiquetado de módulos.
   - `geometryService.js`: cálculos de dimensiones visuales, dimensiones de módulo y posiciones de repisas.
   - `isoGeometryService.js`: inferencias de posición, rotación de puertas, explosión y profundidad para el renderizador isométrico.
4. **`js/components/`**: mini-componentes reutilizables sin estado propio.
   - `graph/graphLayout.js`: layout jerárquico y estructural del grafo.
   - `manual/manualExporter.js`: exportación HTML/PDF/JSON e impresión.
   - `manual/manualSupportWarnings.js`: advertencias de soporte estructural.
5. **Tests unitarios**: Node test runner (`node --test`) sobre servicios y utilidades.

## Consecuencias

### Positivas

- Única fuente de verdad para colores, Z-index y constantes estructurales.
- Lógica pura desacoplada de renderizadores; facilita tests y reutilización.
- Menos duplicación (por ejemplo, `_isGlobalPiece` ya no existe en `isometricRenderer.js`).
- Tests rápidos sin jsdom para la lógica central.

### Negativas

- Mayor número de archivos pequeños.
- Algunos renderizadores aún mezclan geometría y presentación; requieren refactor posterior.

## Referencias

- `frontend/public/assembly-planner/js/core/config.js`
- `frontend/public/assembly-planner/js/core/store.js`
- `frontend/public/assembly-planner/js/services/classifierService.js`
- `frontend/public/assembly-planner/js/services/moduleService.js`
- `frontend/public/assembly-planner/js/utils/normalize.js`
- `frontend/public/assembly-planner/package.json`
