# ADR-0020: Leyenda de ejes fuera del área del módulo

## Estado

Aprobado — implementado

## Contexto

La leyenda de ejes X/Y/Z en el SVG isométrico se dibujaba dentro del `viewBox`, en la esquina inferior izquierda. En muebles grandes o con proyecciones que llegaban al borde, la leyenda tapaba parte del dibujo o quedaba encima de piezas.

## Decisión

Reservar un espacio adicional en la parte inferior del `viewBox` y dibujar la leyenda allí, completamente por debajo del contenido del módulo.

### Reglas

1. `_calculateViewport` añade `axesSpace = 70` píxeles al alto del `viewBox` cuando `showAxes` es `true`.
2. `_drawAxes` posiciona el origen de los ejes dentro de ese espacio inferior.
3. El contenido del módulo sigue comenzando en `originY = -minY + padding + titleSpace`.
4. `_buildSVG` recibe `axesSpace` y lo pasa a `_drawAxes`.

### Cambios en capas

- **`js/isometricRenderer.js`**:
  - `_calculateViewport` devuelve `axesSpace`.
  - `_buildSVG` recibe y usa `axesSpace`.
  - `_drawAxes` recibe `axesSpace` y posiciona la leyenda en el área inferior reservada.

## Consecuencias

- La leyenda nunca se superpone al módulo.
- El SVG es ligeramente más alto cuando `showAxes` está activo.
- Los tests existentes siguen pasando.

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A20.1 | Reservar espacio inferior para ejes | assembly-planner-agent | `js/isometricRenderer.js` |
| A20.2 | Desplegar contenedor frontend | deploy-agent | `frontend/Dockerfile` |
