# ADR-0021: Contrato de compatibilidad de ejemplos y tipos de zapatera

## Estado

Aprobado — implementado

## Contexto

Los ejemplos de muebles (CSVs en `docs/` y `frontend/public/assembly-planner/data/`) tenían piezas que el Assembly Planner procesaba sin semántica o con geometría incoherente: laterales de cajón de 450 mm en módulos de 400 mm de fondo, frentes que no cubrían el vano, fondos de cajón 10 mm más estrechos que lo esperado, zócalos globales distintos a la suma de anchos de módulos, falsos positivos de pandeo ("Fondo estanteria" contiene el substring "estante"), y piezas con rol genérico `panel` ("Entrepaño", "Panel cabecero", "Soporte extensión"). El helper `cajon()` de ambos generadores producía estas medidas fijas sin conocer el módulo padre. Además el usuario definió tres tipos de zapatera/cajón a aplicar en los ejemplos: volquete (fondo 18.5–35 cm, apertura pivotante), módulo extraíble para clóset (correderas telescópicas) y banco zapatero (asiento + cajonera inferior a nivel de piso).

## Decisión

### Reglas de coherencia (válidas para todo ejemplo nuevo)

1. **Cajones son submódulos** (`modulo = "<padre>.<n>"`) y se generan con el helper `cajon(parent, index, opts)` de `scripts/generar-ejemplos-assembly.mjs` / `M.cajon()` de `scripts/generar-ejemplos-catalogo.py`, que calcula: `frente.ancho = W−2` (1 por fila) o `floor((W−(N−1)·3)/N)−1`; `frente.alto = vano−3`; `profCajon = D−25` (corredera) o `D−15` (volquete); laterales = `profCajon × (frente.alto−2·espBase)`; fondo/base = `frente.ancho − 2·espLat`. `W` y `D` son el ancho/profundidad interior del módulo padre.
2. **Zócalo global** = suma de anchos de los módulos con base (±2 mm, lo que valida `csvParser.js`).
3. **Pandeo**: repisas/estantes con luz >800 mm usan espesor 18 mm o divisor central (el check vive en `csvParser.js` y usa `inferRole() === 'shelf'`, no substrings de nombre).
4. **Roles**: el rol se infiere del nombre ("entrepaño" y "zapatero" son `shelf`; "respaldo" es `back_panel`; "travesaño" es `brace`; "asiento" es `seat_panel`). Nombres ambiguos caen a `panel` genérico y se consideran incompatibles.
5. **Gate obligatorio**: `node frontend/public/assembly-planner/test/validate-examples.mjs` debe reportar 0 errores / 0 warnings / 0 piezas genéricas sobre `data/ejemplo-*.csv` y `docs/Ejemplo_CSV_*.csv` antes de dar por bueno cualquier ejemplo nuevo.

### Tipos de zapatera (ejemplos 16–18 del generador)

1. **Volquete** (`ejemplo-zapatero-volquete.csv`): módulo 600×1800×300, 3 submódulos `tipo:'volquete'`. El frente se nombra "Frente cajon abatible …" y `hardware.js` genera "Bisagras abatibles para zapatera volquete" (2 por frente) en lugar de correderas. Las bandejas usan `altBandeja` (150 mm) porque el frente alto es el panel pivotante, no la bandeja.
2. **Extraíble** (`ejemplo-zapatero-extraible.csv`): módulo de clóset 800×1800×500, bandeja zapatero fija (rol `shelf`, espesor 18) + 5 cajones "extraible" en correderas telescópicas (1 par por cajón), ~40–50 pares.
3. **Banco** (`ejemplo-zapatero-banco.csv`): módulo 900×420×350 con "Asiento banco" (`seat_panel`) + 2 cajones a nivel de piso. El planner no modela ruedas; el enunciado "ruedas o rieles" se resuelve con correderas telescópicas (documentado en el header del CSV).

### Zócalo global: patín retranqueado vs cajón de zócalo (addendum 2026-09-10, ejemplos 20–22)

Dos modelos de zócalo global full-width, distinguibles solo por los datos:

1. **Patín retranqueado** (modelo clásico, ejemplos 5–10): el zócalo global es **solo el frente** (`glb-zocalo`, ancho = suma de anchos de módulos con base). Se dibuja retranqueado bajo la línea de suelo (`z < 0`) y los laterales de los módulos llegan al suelo.
2. **Cajón de zócalo** (patrón real "zócalo completo sin base global", ejemplos `*-zocalo-cajon`): el zócalo global es **un cajón sin tapa ni base**: frente (`glb-zocalo`) + 2 laterales (`glb-zocalo-lateral-izq/der`, rol `plinth_side`, ancho = profundidad del mueble) + trasero opcional ("Fondo zocalo"). La base del primer módulo hace de tapa del cajón.

Reglas del modelo cajón:

- **La base va siempre con el módulo**: cada módulo conserva su `bottom_panel` propia, **interna** (ancho ≈ módulo − 2t), apoyada a `z = zocaloHeight`. Los interiores heredan el offset automáticamente.
- **Detección**: cualquier pieza global con rol `plinth_side` (nombre `lateral`/`costado` + `zocalo`, clasificada en `classifierService.js`). Sin laterales, todo el render es idéntico al patín (los ~20 ejemplos previos y sus tests no cambian).
- **Altura total**: los laterales de los módulos se dimensionan con la altura TOTAL del mueble (zócalo incluido) y renderizan desde `z = zocaloHeight`; el zócalo ocupa `z: 0..zocaloHeight` a cara del mueble (frente y trasero como bandas, laterales a profundidad completa). La tapa corrida sigue en `z = moduleH` (altura total).
- **Validación**: `csvParser.js` compara el ancho del **frente** (rol `bottom_panel`/`plinth` con 'zocalo' en el nombre) contra la suma de anchos de módulos (±2 mm). Los laterales (`plinth_side`) y el trasero (`back_panel`) quedan excluidos de la comparación para no contaminarla.

### Correderas ocultas (addendum 2026-09-10, ejemplo 23)

`ejemplo-cajonera-correderas-ocultas.csv` (generador: helper `cajonOculto()`, ejemplo 23) aplica el contrato de riel oculto (S1/S2, `RAIL_TYPES`/`railService.js`):

- Los frentes se nombran "Frente cajon oculto …" para que `inferRailType` infiera `oculta` (keyword 'ocult').
- La caja **no descuenta holgura lateral** (laterales de 16 mm al ras del frente, rango Blum 16/19); el cajón es de **base anclada al frente sin fondo trasero** (la base hace de fondo, como la zapatera-cajón del ejemplo 17), así el check de `csvParser.js` ("fondo ≈ frente − 2×espesor lateral") no aplica: la deducción −42 mm es del ancho interior de la base (`vano − 42`), no del frente.
- `hardware.js` agrupa las 3 correderas bajo "Correderas ocultas" con especificación "vano − 42 mm" (catálogo Blum Tandem 563H / Häfele Matrix UM).

### Cambios en capas

- **`js/hardware.js`**: correderas contadas por frente de cajón (1 par por cajón, antes por pieza); detección de volquete por "abatible"/"volquete" en el frente; tiradores de cajón explícitos en la lista.
- **`js/services/classifierService.js`**: "entrepaño" clasifica como `shelf`.
- **`js/csvParser.js`**: check de pandeo basado en rol (`inferRole === 'shelf'`), eliminando falsos positivos de nombres tipo "Fondo estanteria".
- **`test/validate-examples.mjs`** (nuevo): barrido de validación reutilizable sobre todos los CSV.
- **`js/zapateras.test.js`** (nuevo): contrato end-to-end de los 3 tipos (parseo, roles, herrajes).

## Consecuencias

- Los 75 CSV de ejemplos validan en 0 errores / 0 warnings; cualquier ejemplo futuro debe pasar el mismo gate.
- Los generadores son la fuente canónica de los CSV regenerables; los pares homónimos manuales distintos (p. ej. `ejemplo-cajonera` vs `Cajoneras_4_Modulos`) quedaron consistentes pero no unificados.
- Ruedas, guías ocultas y bisagras de cazoleta siguen sin modelarse; si se necesitan, requieren nuevo rol en el clasificador y heurística en `hardware.js`.
- Las 5 plantillas precargadas del backend (`backend/app/templates.py`, botón "Cargar ejemplo" del optimizador) siguen este mismo contrato desde 2026-09-07: cajones completos como submódulos (`modulo = "1.n"`), estantes ajustados al interior del módulo y fondo obligatorio; ver `backend/tests/test_templates.py`.
- Deuda conocida: el vocabulario de tipos de `backend/app/assembly.py` (`_PIECE_KINDS`: lateral/tapa/base/fondo/estante/puerta/zapatero/zocalo/cajon/pata/division) es más pequeño que el de roles del frontend (`drawer_face/handle/plinth/brace/seat/mirror/glass` no existen en backend). Hoy no chocan porque el contrato real entre ambos es el CSV de 11 columnas, pero una futura integración planner↔ensamblaje en caliente debería unificar vocabularios.
