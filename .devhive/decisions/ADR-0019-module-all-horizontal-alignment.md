# ADR-0019: Alineación horizontal de módulos en vista "Todos"

## Estado

Aprobado — implementado

## Contexto

En el ejemplo "Sistema Armario Abierto" (y otros muebles formados por varios módulos) la vista "Todos" (`ALL_MODULE_ID`) superponía todas las piezas en el origen, porque `_buildModuleGeometries` asumía un único módulo. El usuario necesitaba ver los módulos `M1`, `M2`, `M3`... alineados uno al lado del otro, con las piezas globales (zócalo, tapa, puertas) extendidas sobre el ancho total.

## Decisión

Cuando `target === ALL_MODULE_ID`, agrupar las piezas no-globales por módulo, ordenar los módulos (`M1`, `M2`...) y renderizarlos secuencialmente sumando offsets en el eje X. Las piezas globales se renderizan al final con `moduleW = suma de anchos`.

### Reglas

1. Los módulos se agrupan por el campo `modulo`. Los submódulos con prefijo (`M1-Cajon`) se agrupan bajo su módulo padre (`M1`).
2. El orden es: prefijo alfabético (`M`, `S`...), luego número numérico, luego sufijo (`M1` antes que `M1-Sub`).
3. Cada módulo se renderiza con `_buildModuleGeometries` usando su propio ancho/alto/espesor.
4. Tras renderizar un módulo, se incrementa `offsetX` en su ancho.
5. Las piezas globales se renderizan con `offsetX` como ancho total disponible.

### Cambios en capas

- **`js/isometricRenderer.js`**:
  - Rama `target === ALL_MODULE_ID` en `render()`.
  - Métodos privados `_groupByModule(pieces)` y `_sortModuleIds(ids)`.
  - `_buildGlobalGeometries` recibe `moduleW = offsetX` (ancho total acumulado).

## Consecuencias

- Vista "Todos" muestra el mueble completo con módulos alineados secuencialmente.
- Las piezas globales se estiran o centran según sus dimensiones propias sobre el ancho total.
- La vista de módulo individual sigue centrada en su propio sistema de coordenadas.

## Tareas asignadas

| ID | Tarea | Agente | Archivos |
|---|---|---|---|
| A19.1 | Agrupar y ordenar módulos en vista "Todos" | assembly-planner-agent | `js/isometricRenderer.js` |
| A19.2 | Validar tests y desplegar | test-agent | `js/isometricRenderer.test.js` |
