# ADR-0013: Catálogo de materiales y herrajes en JSON estático

## Estado

Aprobado

## Contexto

La cotización y el Assembly Planner requieren datos de materiales (tableros, espesores, precios) y herrajes (tornillos, correderas, bisagras, patas) que no cambian frecuentemente. Guardarlos en la base de datos añade complejidad innecesaria para el MVP.

## Decisión

- Almacenar catálogo de materiales y herrajes en archivos JSON estáticos bajo `backend/app/config/`:
  - `catalog.json`: formatos de tablero, materiales, espesores, precios por m² y colores.
  - `hardware_templates.json`: plantillas de herrajes con precios unitarios y categorías.
- El backend los sirve a través de los routers existentes (`catalog.py`, `quotes.py`).
- El frontend puede consumirlos via API o, en el caso del Assembly Planner vanilla, calcular hardware a partir de heurísticas locales.
- Actualizar estos JSON es un cambio de configuración, no requiere migración de base de datos.

## Consecuencias

### Positivas

- Sin migraciones ni queries complejas para datos estáticos.
- Fácil de editar por un administrador técnico.
- Reutilizable entre backend y frontend.

### Negativas

- Cambios requieren deploy del contenedor backend.
- No hay UI de administración del catálogo en esta iteración.

## Referencias

- `backend/app/config/catalog.json`
- `backend/app/config/hardware_templates.json`
