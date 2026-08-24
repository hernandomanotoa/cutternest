# Documentación fuente del Assembly Planner — CutterNest

Este directorio contiene la documentación técnica detallada de los archivos que leen, validan, transforman y visualizan los CSV de piezas usados en el **Assembly Planner**. Se conserva el código fuente original tal como está en el repositorio.

## Índice

| Documento | Qué contiene |
|-----------|--------------|
| [Formato_CSV.md](./Formato_CSV.md) | Especificación del formato CSV de piezas. |
| [csvParser.md](./csvParser.md) | Código fuente del parser/validador/exportador CSV. |
| [svgEngine.md](./svgEngine.md) | Motor SVG universal v3 que dibuja cada mueble. |
| [manualView.md](./manualView.md) | Vista Manual que genera el SVG de cada paso. |
| [heuristics.md](./heuristics.md) | Heurísticas que crean los pasos de ensamblaje. |
| [topologicalSort.md](./topologicalSort.md) | Orden topológico (Kahn) de las piezas. |
| [app.md](./app.md) | Coordinador principal de la aplicación. |
| [utils.md](./utils.md) | Utilidades compartidas. |
| [instructions.md](./instructions.md) | Generador de instrucciones de texto por paso. |
| [hardware.md](./hardware.md) | Cálculo de herrajes/insumos. |
| [isometricRenderer.md](./isometricRenderer.md) | Motor SVG isométrico 3D. |
| [isometricView.md](./isometricView.md) | Vista Isométrica con controles. |
| [csvView.md](./csvView.md) | Vista CSV / editor de piezas. |
| [Guia_Vista_Isometrica.md](../Guia_Vista_Isometrica_Assembly_Planner.md) | Guía completa de la vista isométrica. |
| [ejemplos/](./ejemplos/) | CSVs de ejemplo (universal, básico, escritorio, mueble TV, etc.). |

## Flujo resumido

```
CSV de piezas  →  csvParser.js  →  state.pieces
                                    ↓
              heuristics.js + topologicalSort.js  →  state.steps
                                    ↓
              manualView.js  →  svgEngine.js  →  SVG del paso
```
