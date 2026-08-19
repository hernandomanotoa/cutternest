# Galería de renders SVG v3

Cada SVG fue generado automáticamente por `svgEngine.js` a partir de los CSVs de ejemplo ubicados en `frontend/public/assembly-planner/data/`.

## Ver en el navegador

Con el stack levantado:

```text
http://localhost:3000/assembly-planner/test/renders/
```

## Estado

- Todos los renders se generan sin solapamientos no intencionales.
- El viewBox indica las dimensiones reales del módulo en mm.
- Los ejemplos universales (M1–M6) son los de referencia principal.

## Regenerar

```bash
cd frontend/public/assembly-planner
node test/test_svg_engine.mjs
```

Para regenerar toda la galería, ejecutar el script que generó `index.html`.
