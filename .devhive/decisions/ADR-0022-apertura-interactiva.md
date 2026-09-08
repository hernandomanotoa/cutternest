# ADR-0022: Apertura interactiva de puertas, cajones y zapateras

## Estado

Aprobado — implementado

## Contexto

El Assembly Planner solo ofrecía apertura fija y aproximada: puertas con un "falso ángulo" que engrosaba el bounding box (`applyDoorRotation`, sin pivote ni lado de bisagra), cajones cuyo frente se despegaba 60 mm sin mover la caja, y ningún soporte para puertas corredizas. El usuario pidió apertura interactiva por mecanismo (bisagra o corrediza), extracción de cajones/zapateras sobre su riel, la definición de "zapatera cajón" (mínimo laterales + frente) y un control de posición 0–100% que mueve cada elemento en la dirección de su tipo.

## Decisión

### Modelo de movimiento (servicio puro `js/services/motionService.js`)

`motionConfigFor(piece)` devuelve por pieza: `hinge` (puerta no corrediza; lado por nombre: izq/der/sup/inf, default der), `slide` (puerta con "corrediza" en nombre; dirección por lado, default izq) o `rail` (familia cajón: drawer_face/side/bottom/back/part y tiradores de cajón/zapatera). `applyAperturaToGeo(geo, config, openness)` con openness 0..1: bisagra adjunta `rotation {axis, angleDeg, pivot}` (±105°; eje z para laterales, eje x para trampillas sup/inf), corrediza traslada x (±0.95·w), riel traslada +y (0.85·d, hacia el frente). `rotateCorners(boxCorners(geo), rotation)` da las 8 esquinas rotadas; z=arriba, y=profundidad.

### Integración en el pipeline común

`IsometricRenderer.computeGeometries` aplica la apertura (puertas y grupos de cajón coordinados: frente, lados, base, fondo y tirador con el mismo Δy). `Renderer3D` consume el mismo pipeline: traducciones heredadas gratis; las rotaciones se proyectan vía `pieceVertices` (geometry.js). Estado en el store (`aperturaGlobal`, `aperturas` por pieceId, evento `apertura:changed`); acciones `setAperturaGlobal`/`setAperturaPieza` en `app.js`. UI: slider "Apertura" 0–100% en vistas isométrica y 3D + slider por pieza al seleccionar una pieza abrible. `doorAngle` legacy se mapea a apertura global (doorAngle:0 ≡ cerrado).

### Zapatera cajón (definición)

Zapatera con rieles = cajón con **mínimo laterales + frente** (base recomendada; fondo y tirador opcionales). En `classifierService.js`: nombre con `zapatero/a` + `extraible/riel/corredera` → familia cajón (drawer_face/side/bottom/back). `hardware.js` cuenta sus frentes para correderas telescópicas. El ejemplo "Zapatero extraíble" usa esta definición (5 zapateras-cajón sin fondo). Una zapatera fija ("Bandeja zapatero" sin extraible) sigue siendo `shelf`.

## Consecuencias

- Ambas vistas (isométrica y 3D orbital) abren/corren con el mismo estado; el override por pieza gana sobre el global.
- Cierre de limitaciones (post-implentación):
  - El tirador de puerta ahora es una geo propia emparejada por prefijo de id/nombre (`findPairedHandle`) y recibe el transform de su puerta: la MISMA rotation (bisagra, mismo pivote) o la MISMA traslación x (corrediza). Como `inferRole` clasifica "Tirador puerta …" como `door` (regla 'puerta' antes que 'tirador'), el renderer usa `isHandlePiece` (rol handle o nombre con 'tirador') para excluir esas piezas de los paneles frontales y tratarlas solo como tirador; el emparejamiento de cajones excluye los tiradores de puerta (`_doorHandleIds`).
  - El renderer fija `pivot.y = geo.y + d/2` en la rotation devuelta por el servicio (el contrato de `motionService` entrega pivot sin y): la bisagra rota en el plano de la puerta, no alrededor del origen del módulo.
  - Orden de pintado: `getDepthKey` usa el centroide de las esquinas rotadas cuando hay `geo.rotation`, y el desempate solo aplica entre geos de mismo zIndex especial con al menos uno rotado; sin apertura el orden es idéntico al anterior.
  - `Renderer3D` anima la apertura ~300 ms (lerp/raf, patrón explode; `lerpAperturaState` interpola global y overrides), cancelable, sin re-encuadre de cámara (`load(..., { keepCamera: true })`).
  - `computeBoundingBox` (renderer3d) acota con las esquinas rotadas: explode y centro orbital correctos con puertas abiertas.
  - `hardware.js` cuenta como "Tiradores" de cajón las piezas 'tirador' + cajón/zapatera/zapatero (incluye zapateras extraíbles).
- Limitación restante: las piezas reales de cajón (laterales/base/fondo clasificadas drawer_*) no reciben geometría propia (solo el frente genera la caja sintética), así que el grupo que sale es el sintético.
- `applyDoorRotation` queda legacy sin uso del renderer (se conserva por compatibilidad de tests/imports).
