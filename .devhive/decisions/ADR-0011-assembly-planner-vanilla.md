# ADR-0011: Assembly Planner vanilla offline en frontend/public/assembly-planner/

## Estado

Aprobado

## Contexto

El módulo de ensamblaje React existente (`frontend/src/components/mueble/AssemblyPage.tsx` + `backend/app/assembly.py`) cubre grafo de dependencias, niveles topológicos, vista 3D y manual PDF. Sin embargo, el flujo de taller requiere una herramienta que:

- Funcione sin conexión a internet ni backend.
- Sea portable: abrir directamente desde un CSV o un enlace.
- Ofrezca análisis estructural (cargas, pandeo, vuelco), grafo editable, pasos de ensamblaje, simulador y manual auto-generado.
- No dependa de React, Three.js ni build de Vite.

## Decisión

Crear un **Assembly Planner autocontenido** en `frontend/public/assembly-planner/`:

- HTML5 + CSS3 + JavaScript vanilla ES6.
- Módulos separados: `csvParser.js`, `heuristics.js`, `structural.js`, `topologicalSort.js`, `hardware.js`, `instructions.js` y vistas en `js/views/`.
- Punto de entrada: `index.html` con `<script type="module">`.
- Servido como asset estático por nginx; también usable abriendo el archivo HTML directamente.
- Integración opcional con el backend mediante endpoint `/api/v1/assembly-planner/examples` para guardar CSVs como ejemplos.
- El ensamblaje React existente se mantiene intacto hasta que se decida deprecarlo.

## Consecuencias

### Positivas

- Cumple el requisito de offline/portabilidad.
- No rompe el build del frontend React: los archivos en `public/` se copian tal cual.
- Fácil de iterar y mantener gracias a módulos ES6.
- Permite empaquetar todo en un único HTML en el futuro si es necesario.

### Negativas

- Hay dos sistemas de ensamblaje en paralelo hasta la deprecación del React.
- No hay persistencia en base de datos ni autenticación dentro del planner.
- Exportación a PDF nativo no está incluida; se usa impresión del navegador o jsPDF desde el manual.

## Alternativas consideradas

- **Opción A (elegida)**: módulos ES6 separados en `public/assembly-planner/`.
- **Opción B**: un único HTML inline. Rechazada por dificultad de mantenimiento.

## Referencias

- `frontend/public/assembly-planner/`
- `backend/app/routers/assembly_planner.py`
- `docs/Guia_Ensamblaje.md`
