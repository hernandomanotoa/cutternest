# Estándar de nomenclatura de piezas — Assembly Planner

> Documento de propuesta. El estándar aplica principalmente al campo `id` de cada pieza; el campo `nombre` sigue siendo legible en español para la interfaz y los manuales.

---

## 1. Estructura del `id`

```
{módulo}-{código}-{lado}-{índice}
```

| Parte | Descripción | Ejemplo |
|---|---|---|
| `{módulo}` | `m1`, `m2`, … | Módulo al que pertenece la pieza. |
| `{código}` | 3 letras según el rol. Ver tablas abajo. | `est`, `zap`, `div`. |
| `{lado}` | Opcional. `izq`, `der`, `cen` o `ctr`. | Solo para piezas laterales. |
| `{índice}` | Opcional. `1`, `2`, `3`… | Para diferenciar piezas repetidas. |

Ejemplos:

- `m1-bas` → Base del módulo 1.
- `m1-lat-izq` → Lateral izquierdo del módulo 1.
- `m1-est-izq-1` → Estante regulable izquierdo 1 del módulo 1.
- `m1-zap-der-2` → Zapatero inclinado derecho 2 del módulo 1.
- `m1-div-cen` → Divisor central del módulo 1.
- `m1-rin` → Repisa inferior corrida del módulo 1.

---

## 2. Opciones de códigos de 3 letras

### Opción A — Español (3 letras, cortos)

Códigos derivados del español. Más cercanos al lenguaje de la interfaz, pero con algunas colisiones (por ejemplo, repisa y respaldo).

| Rol | Código | Ejemplo de `id` |
|---|---|---|
| Zócalo / plinth | `ZOC` | `m1-zoc` |
| Base / bottom_panel | `BAS` | `m1-bas` |
| Tapa / top_panel | `TAP` | `m1-tap` |
| Lateral / side_panel | `LAT` | `m1-lat-izq` |
| Fondo / back_panel | `FON` | `m1-fon` |
| Divisor / divider | `DIV` | `m1-div-cen` |
| Repisa inferior / bottom shelf | `RIN` | `m1-rin` |
| Repisa superior / top shelf | `RSU` | `m1-rsu` |
| Estante / middle shelf | `EST` | `m1-est-izq-1` |
| Zapatero / shoe rack | `ZAP` | `m1-zap-der-1` |
| Barra colgadora / hanger rail | `BAR` | `m1-bar` |
| Puerta / door | `PUE` | `m1-pue-1` |
| Frente de cajón / drawer_face | `FCA` | `m1-fca-1` |
| Lateral de cajón / drawer_side | `LCA` | `m1-lca-1` |
| Base de cajón / drawer_bottom | `BCA` | `m1-bca-1` |
| Fondo de cajón / drawer_back | `FOC` | `m1-foc-1` |
| Travesaño / brace | `TRA` | `m1-tra-sup` |
| Pata / leg | `PTA` | `m1-pta` |
| Tirador / handle | `TIR` | `m1-tir` |
| Espejo / mirror | `ESP` | `m1-esp` |
| Vidrio / glass | `VID` | `m1-vid` |
| Asiento / seat_panel | `ASI` | `m1-asi` |

**Pros**: intuitivo para equipos hispanohablantes.
**Contras**: algunos códigos chocan (`RIN` vs respaldo; `ESP` espejo vs estante); `FCA`/`FOC`/`LCA` son menos memorables.

---

### Opción B — Inglés técnico (3 letras, semántico)

Códigos en inglés, ampliamente usados en software de mobiliario/CNC. Desambigua mejor roles similares.

| Rol | Código | Ejemplo de `id` |
|---|---|---|
| Zócalo / plinth | `PLI` | `m1-pli` |
| Base / bottom_panel | `BOP` | `m1-bop` |
| Tapa / top_panel | `TOP` | `m1-top` |
| Lateral / side_panel | `SID` | `m1-sid-izq` |
| Fondo / back_panel | `BAK` | `m1-bak` |
| Divisor / divider | `DIV` | `m1-div-cen` |
| Repisa inferior / bottom shelf | `SBT` | `m1-sbt` |
| Repisa superior / top shelf | `STP` | `m1-stp` |
| Estante / middle shelf | `SHF` | `m1-shf-izq-1` |
| Zapatero / shoe rack | `SHR` | `m1-shr-der-1` |
| Barra colgadora / hanger rail | `HGR` | `m1-hgr` |
| Puerta / door | `DOR` | `m1-dor-1` |
| Frente de cajón / drawer_face | `DRF` | `m1-drf-1` |
| Lateral de cajón / drawer_side | `DRS` | `m1-drs-1` |
| Base de cajón / drawer_bottom | `DRB` | `m1-drb-1` |
| Fondo de cajón / drawer_back | `DRK` | `m1-drk-1` |
| Travesaño / brace | `BRA` | `m1-bra-sup` |
| Pata / leg | `LEG` | `m1-leg` |
| Tirador / handle | `HAN` | `m1-han` |
| Espejo / mirror | `MIR` | `m1-mir` |
| Vidrio / glass | `GLA` | `m1-gla` |
| Asiento / seat_panel | `SEA` | `m1-sea` |

**Pros**: sin colisiones, escala bien a sistemas internacionales.
**Contras**: requiere aprenderse los códigos si el equipo solo habla español.

---

### Opción C — Híbrida recomendada (corta en español + desambiguación)

Combina códigos cortos en español con sufijos técnicos para evitar colisiones. Es la opción recomendada para CutterNest.

| Rol | Código | Ejemplo de `id` |
|---|---|---|
| Zócalo / plinth | `ZOC` | `m1-zoc` |
| Base / bottom_panel | `BAS` | `m1-bas` |
| Tapa / top_panel | `TAP` | `m1-tap` |
| Lateral / side_panel | `LAT` | `m1-lat-izq` |
| Fondo / back_panel | `FON` | `m1-fon` |
| Divisor / divider | `DIV` | `m1-div-cen` |
| Repisa inferior / bottom shelf | `RIN` | `m1-rin` |
| Repisa superior / top shelf | `RSU` | `m1-rsu` |
| Estante / middle shelf | `EST` | `m1-est-izq-1` |
| Zapatero / shoe rack | `ZAP` | `m1-zap-der-1` |
| Barra colgadora / hanger rail | `BAR` | `m1-bar` |
| Puerta / door | `PUE` | `m1-pue-1` |
| Frente de cajón / drawer_face | `FRC` | `m1-frc-1` |
| Lateral de cajón / drawer_side | `LCA` | `m1-lca-1` |
| Base de cajón / drawer_bottom | `BCA` | `m1-bca-1` |
| Fondo de cajón / drawer_back | `FOC` | `m1-foc-1` |
| Travesaño / brace | `TRA` | `m1-tra-sup` |
| Pata / leg | `PTA` | `m1-pta` |
| Tirador / handle | `TIR` | `m1-tir` |
| Espejo / mirror | `MIR` | `m1-mir` |
| Vidrio / glass | `VID` | `m1-vid` |
| Asiento / seat_panel | `ASI` | `m1-asi` |

**Recomendación**: usar la **Opción C**. Mantiene la mayoría de códigos en español (`BAS`, `TAP`, `LAT`, `EST`, `ZAP`) y solo desambigua los casos conflictivos (`FRC` para frente de cajón, `MIR` para espejo).

---

## 3. Indicadores de lado (en `id` y `nombre`)

| Lado | Código | Palabras en `nombre` |
|---|---|---|
| Izquierdo | `izq` | `izquierdo`, `izq` |
| Derecho | `der` | `derecho`, `der` |
| Central | `cen` | `central`, `centro` |
| Sin lado | omitir | omitir |

> El algoritmo busca las palabras clave en `nombre` o `id`. Si no las encuentra, trata la pieza como corrida (spanning).

---

## 4. Indicadores de zona vertical (en `id` y `nombre`)

| Zona | Código en `id` | Palabras en `nombre` | Offset/gap por defecto |
|---|---|---|---|
| Superior | `sup` | `superior`, `sup`, `alto`, `top` | `topInset` |
| Inferior | `inf` | `inferior`, `inf`, `bajo`, `bottom` | `lowerShelfBaseOffset` |
| Medio | omitir o `med` | `medio`, `central` (sin ser divisor), `centro` | `baseTopGap` |
| Zapatero | `zap` | `zapatero`, `zapatera` | `baseTopGap` + `stackGap` |

---

## 5. Ejemplos completos (Opción C)

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo,pos_z
m1-zoc,Zócalo módulo 1,800,100,1,no,#8B5A2B,15,"T,B,L,R",1,
m1-bas,Base módulo 1,770,520,1,si,#8B5A2B,15,"T,B,L,R",1,
m1-tap,Tapa módulo 1,800,550,1,si,#8B5A2B,15,"T,B,L,R",1,
m1-lat-izq,Lateral izquierdo 1,550,2400,1,no,#8B5A2B,15,"T,B,L",1,
m1-lat-der,Lateral derecho 1,550,2400,1,no,#8B5A2B,15,"T,B,R",1,
m1-fon,Fondo módulo 1,770,2370,1,no,#F2F2F2,15,,1,
m1-div,Divisor vertical M1,520,2370,1,no,#C19A6B,15,"T,B,L,R",1,
m1-rin,Repisa inferior M1,770,520,1,no,#C19A6B,15,"T,B,L,R",1,
m1-rsu,Repisa superior M1,770,520,1,no,#C19A6B,15,"T,B,L,R",1,
m1-est-izq-1,Estante regulable izquierdo 1 M1,377.5,520,3,no,#C19A6B,15,"T,B,L,R",1,
m1-est-der-1,Estante regulable derecho 1 M1,377.5,520,3,no,#C19A6B,15,"T,B,L,R",1,
m1-zap-izq-1,Zapatero inclinado izquierdo 1 M1,377.5,330,3,no,#C19A6B,15,"T,B,L,R",1,
m1-bar,Barra colgadora M1,770,25,1,no,#A0A0A0,25,,1,
```

---

## 5bis. Piezas globales (`glb-` / módulo `estructura`)

Las piezas compartidas por todo el mueble (zócalo corrido, tapa corrida, fondo corrido, corona, puertas corredizas) van en el módulo `estructura` (o `global`) con prefijo de id `glb-`. El clasificador las distingue de las piezas de módulo y el renderer las dibuja a lo ancho del mueble completo.

### Zócalo global: dos modelos distinguibles por los datos

| Modelo | Piezas | Convención de nombres |
|---|---|---|
| **Patín retranqueado** (clásico) | Solo frente | `glb-zocalo`, "Zocalo corrido …" |
| **Cajón de zócalo** (sin base global) | Frente + 2 laterales (+ trasero opcional) | `glb-zocalo` + `glb-zocalo-lateral-izq/der` ("Lateral zocalo izquierdo/derecho") |

Reglas del modelo **cajón de zócalo** (patrón real "zócalo completo full-width sin base global"):

- El zócalo es un **cajón sin tapa ni base**: frente (ancho total × alto del zócalo) + laterales (profundidad × alto del zócalo, clasificados como rol `plinth_side`). La **base del primer módulo hace de tapa** del cajón.
- **La base va siempre con el módulo**: cada módulo conserva su `bottom_panel` propia, interna (ancho ≈ módulo − 2·espesor), apoyada sobre el zócalo. No existe base global.
- **Altura total**: los laterales de los módulos se dimensionan con la altura TOTAL del mueble (zócalo incluido) y el frente del zócalo debe medir la suma de anchos de los módulos (±2 mm, lo que valida `csvParser.js`). Los laterales del zócalo no entran en esa suma.
- Ejemplos de referencia: `ejemplo-closet-zocalo-cajon.csv`, `ejemplo-comoda-zocalo-cajon.csv`, `ejemplo-mueble-tv-zocalo-cajon.csv`.

---

## 6. Reglas que hay que respetar

1. **No mezclar códigos de módulo**: si la pieza es del módulo 1, su `id` debe empezar con `m1-` y su nombre debe decir `M1`.
2. **No usar palabras estructurales en piezas que no lo sean**: `base`, `tapa`, `lateral`, `fondo` y `zócalo` tienen prioridad en el clasificador. No usarlos como descriptores de un zapatero o una repisa.
3. **Ser explícito con el lado**: si una pieza es lateral, incluir `izquierdo`/`izq` o `derecho`/`der`. Si no, se dibujará como corrida.
4. **Ser explícito con la zona vertical**: `superior`/`sup` o `inferior`/`inf` son necesarios para que se aplique el offset/inset correcto. Sin ellas, la pieza se trata como zona media.
5. **Mantener `id` y `nombre` alineados**: el `id` no es solo decorativo; los algoritmos de SVG (`inferShelfBayIndex`, `inferDividerX`, `sortByDepth`) lo usan como fallback cuando el nombre no es concluyente.

---

## 8. Archivos afectados si se implementa

- `frontend/public/assembly-planner/data/ejemplo-closet-modular-abierto.csv`
- `docs/Ejemplo_CSV_Universal.csv`
- `docs/Ejemplo_CSV_*.csv` (si usan nombres/IDs de piezas)
- Tests en `frontend/public/assembly-planner/js/**/*.test.js` que referencian IDs o nombres de ejemplo
- Opcional: añadir tests en `classifierService.test.js` para validar el estándar

---

*Última actualización: propuesta inicial sin implementación de código.*
