# docs/archive/

Documentación movida acá porque ya no forma parte del contexto activo del proyecto.
No se eliminó; se archivó para recuperar espacio en `docs/` y reducir ruido en búsquedas de contexto.

## Contenido

| Archivo/carpeta | Razón del archivado |
|-----------------|---------------------|
| `CutterNest_Paquete_Completo/` | Paquete standalone antiguo (motor JS universal + SVGs + docs). El proyecto actual usa `backend/`, `frontend/` y `assembly-planner/`. |
| `CutterNest_SVG_Generator_v2_Documentacion.md` | Documentación de prototipo/generador SVG externo. El SVG real ahora está en `backend/app/svg_generator.py` y `frontend/`. |
| `assembly-planner-prompt.md` | Prompt de implementación del módulo de ensamblaje. El módulo ya está implementado. |
| `Guia_Refactor_UI_UX_3D_CutterNest.md` | Guía de refactor probablemente ya aplicada. |
| `Guia_Vista_Isometrica_Assembly_Planner.md` | Guía de implementación de la vista isométrica; código ya implementado. |
| `Guia_Correcciones_Mejoras_Assembly_Planner.md` | Lista de correcciones; si ya fueron aplicadas, es histórico. |
| `assembly-planner-source/` | Documentación técnica del código del assembly planner. El código fuente ahora es la referencia principal. |

## Si necesitas recuperar algo

Mover de vuelta es seguro:

```bash
mv docs/archive/NOMBRE docs/
```

---

*Archivado el 2026-08-21.*
