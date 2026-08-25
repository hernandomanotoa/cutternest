# ADR-0017: Apilamiento consecutivo de estantes regulables

## Estado

Aprobado — implementado

## Contexto

En el Assembly Planner las piezas `middle` (estantes/regulables sin palabra clave de `superior`/`inferior`) se distribuían uniformemente en el espacio libre entre la zona `top` y la zona `bottom`. Esto dejaba huecos vacíos entre zapateros y estantes cuando ambos coexistían, y no respetaba un gap configurable continuo.

El usuario solicitó que los gaps de los estantes sean **consecutivos a los zapateros**: si hay zapateros, el primer estante `middle` debe comenzar justo después del último zapatero usando el mismo gap de estantes; si no hay zapateros, los estantes deben iniciar desde la base.

## Decisión

Cambiar el algoritmo de `calculateVerticalPositions` para apilar las piezas `middle` consecutivamente de abajo hacia arriba, usando `shelfMiddleGap` como gap continuo.

### Reglas de posición

1. **Zona `fixed-bottom` (zapateros)**: se apilan desde `shoeRackBottomOffset` usando `shoeRackGap` entre sí.
2. **Zona `bottom` (repisas inferiores/base)**: si existen, se apilan inmediatamente encima de los zapateros (o de la base) con el gap general `defaultGap`.
3. **Zona `middle` (estantes regulables)**:
   - Si hay piezas `bottom`, comienza después de la última pieza `bottom`.
   - Si no hay `bottom` pero hay zapateros, comienza después del último zapatero usando `shelfMiddleGap` (no `shoeRackGap`).
   - Si no hay zapateros ni `bottom`, comienza desde `thickness + fixedBottomMargin`.
4. Las piezas `middle` se apilan hacia arriba con `shelfMiddleGap` entre sí.
5. Si el apilamiento excede el límite superior disponible, se comprime uniformemente el gap para que quepan.
6. `pos_z` explícito sigue teniendo prioridad.

### Cambios en capas

- **`js/services/verticalPositionService.js`**: reescribir la sección `middle` para apilamiento consecutivo y fallback por compresión.
- **`js/services/__tests__/verticalPositionService.test.js`**: actualizar expectativas de tests anteriores y añadir test de apilamiento sobre zapateros.
- **`js/services/__tests__/geometryService.test.js`**: actualizar expectativa de orden de estantes (de arriba-abajo a abajo-arriba).

## Consecuencias

- Los estantes regulables ya no dejan huecos vacíos ni se distribuyen arbitrariamente en el alto del módulo.
- El gap visual entre zapateros y estantes es controlado por `shelfMiddleGap`, como parte de una misma secuencia de estantes.
- Los tests deben reflejar el nuevo orden ascendente (`y` creciente) de las piezas `middle`.

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A17.1 | Reimplementar apilamiento consecutivo de middle shelves | assembly-planner-agent | `js/services/verticalPositionService.js` |
| A17.2 | Actualizar tests de verticalPositionService y geometryService | test-agent | `js/services/__tests__/*.test.js` |
| A17.3 | Reconstruir y desplegar contenedor frontend | deploy-agent | `frontend/Dockerfile` |
