# Convenciones de archivos CSV para el Assembly Planner

Formato: `CutterNest Piezas v1` (CSV con cabecera obligatoria).

## Columnas

| Columna    | Significado                                                                 |
|------------|------------------------------------------------------------------------------|
| `id`       | Identificador único de la pieza.                                            |
| `nombre`   | Nombre legible. Determina el rol por palabras clave.                        |
| `ancho`    | Dimensión principal horizontal (mm).                                          |
| `alto`     | Dimensión perpendicular a `ancho` en el plano de la pieza (mm).             |
| `cantidad` | Número de instancias idénticas.                                               |
| `rotate`   | `si` / `no`. Indica si la pieza puede rotar 90° para optimizar el corte.      |
| `color`    | Color en hexadecimal, ej. `#C19A6B`.                                          |
| `espesor`  | Espesor real del tablero (mm).                                                |
| `cantos`   | Bordes a encintar: `T` (top), `B` (bottom), `L` (left), `R` (right).          |
| `modulo`   | ID del módulo al que pertenece la pieza.                                    |
| `pos_z`    | Posición vertical opcional (mm). Si está vacío, se calcula automáticamente. |

## Convención de dimensiones según rol

El rol se infiere del `nombre`. Estas convenciones son importantes para que el render y las validaciones funcionen bien.

### Base / Tapa (`bottom_panel` / `top_panel`)

- `ancho` = ancho del módulo (para pieza externa) o ancho interior `ancho_módulo − 2t` (para pieza interna).
- `alto` = profundidad del módulo (externa) o profundidad interior `profundidad_módulo − 2t` (interna).
- `rotate = si` (suelen ser tableros anchos y poco altos; el optimizador los puede rotar).

El tipo de montaje se detecta automáticamente:

| Tipo      | Condición                              | Ejemplo (módulo 800×550, t=15) |
|-----------|----------------------------------------|--------------------------------|
| Externa   | base/tapa ≈ `W × D`                    | `800 × 550`                    |
| Interna   | base/tapa ≈ `(W−2t) × (D−2t)`          | `770 × 520`                    |
| Custom    | cualquier otra medida                  | a medida                       |

Tolerancia: ±2 mm.

Para que el algoritmo infiera correctamente el ancho/profundidad **externos** de la caja cuando la base o la tapa son internas, incluye al menos una pieza de referencia externa (tapa o fondo externo, o un zócalo/corona global cuyo ancho sea la suma de los módulos).

Ejemplo con base interna, tapa externa y zócalo global:

```csv
m1-base,Base módulo 1,770,520,1,si,#C19A6B,15,"T,B,L,R",1,
m1-tapa,Tapa módulo 1,800,550,1,si,#C19A6B,15,"T,B,L,R",1,
glb-zocalo,Zócalo corrido,3200,100,1,si,#C19A6B,15,"T,B,L,R",estructura,
```

### Comportamiento en el render

- Base **externa**: se dibuja desde el suelo (`z = 0`) y cubre todo el ancho/profundidad del módulo.
- Base **interna**: se dibuja embutida (`x = y = espesor`) y **sobre el zócalo global** (`z = alto_del_zócalo`). Los laterales bajan hasta el suelo (`z = 0`).
- Tapa **externa**: se dibuja sobre los laterales (`z = alto_módulo − espesor`).
- Tapa **interna**: se dibuja embutida por debajo de la cara superior del módulo.
- Base/tapa **custom**: se respetan sus medidas reales y se centran en el módulo.

### Offset, Gap e Inset verticales

El render usa tres tipos de medidas verticales, con nombres estandarizados:

| Tipo    | Significado                                                                 | Ejemplo |
|---------|------------------------------------------------------------------------------|---------|
| `Offset` | Distancia desde un borde de referencia hasta el inicio de una pieza.        | `bottomPanelOffset`: suelo → cara inferior de la base. |
| `Gap`    | Espacio libre entre dos piezas.                                              | `shelfMiddleGap`: separación entre repisas regulables. |
| `Inset`  | Distancia hacia adentro desde un borde superior o frontal.                   | `shelfTopInset`: distancia desde la cara inferior de la tapa hasta la repisa superior. |

#### Pares Offset + Gap

Algunos grupos de piezas se apilan usando un par de valores: un offset desde la base y un gap entre elementos consecutivos.

| Grupo                  | Offset                                | Gap                          |
|------------------------|----------------------------------------|------------------------------|
| Estantes regulables    | `shelfMiddleBaseOffset`               | `shelfMiddleGap`             |
| Zapateros              | `shoeRackBaseOffset`                  | `shoeRackGap`                |

Ambos valores se pueden editar en el panel **Offsets verticales** de la vista isométrica. El panel se puede colapsar o expandir con el botón ▼/▶ de su cabecera.

Cuando `showDimensions` está activo, el SVG en vista normal muestra **cotas de offsets verticales** en la arista derecha-trasera del módulo, a la derecha de la cota de altura total.

### Laterales (`side_panel`)

- `ancho` = profundidad del módulo.
- `alto` = altura del módulo.
- `rotate = no`.

```csv
m1-lateral-izq,Lateral izquierdo 1,550,2400,1,no,#C19A6B,15,"T,B,L",1,
```

### Fondo (`back_panel`)

- `ancho` = ancho del fondo.
- `alto` = alto del fondo.
- `rotate = no`.

El tipo de montaje se detecta automáticamente comparando el fondo con la caja del módulo:

| Tipo       | Condición                                   | Ejemplo (módulo 830×2400, t=15) |
|------------|---------------------------------------------|---------------------------------|
| Externo    | fondo ≈ `ancho_módulo × alto_módulo`        | `830 × 2400`                    |
| Interno    | fondo ≈ `(W−2t) × (H−2t)`                   | `800 × 2370`                    |
| Custom     | cualquier otra medida                       | `800 × 1200` (parcial)          |

Tolerancia: ±2 mm.

### Repisas / Estantes / Zapateros (`shelf`)

- `ancho` = ancho interior disponible (generalmente `ancho_módulo − 2t`).
- `alto` = **profundidad real de la repisa**, nunca mayor que `profundidad_módulo − espesor_fondo`.
- `rotate = no`.

Ejemplo para un módulo de 550 mm de profundidad con fondo de 15 mm:

```csv
m1-repisa-sup,Repisa superior 1,800,535,1,no,#C19A6B,15,"T,B,L,R",1,
```

Si `alto` se omite o supera la profundidad interior, el render lo recorta a la profundidad interior.

### Zapateros

Se clasifican como `shelf`. El `alto` es la longitud del panel inclinado (no la profundidad del módulo). El render respeta el límite de profundidad interior automáticamente.

Palabras clave reconocidas (en nombre o `id`): `zapatero`, `zapatera`, `zapateros`, `zapateras`. Una pieza con cualquiera de estas palabras se trata como **zapatero fijo inferior**: se apila justo encima de la base usando `shoeRackBaseOffset` y `shoeRackGap`, y su etiqueta en el SVG muestra "Zapatero".

Si quieres que una repisa inferior se comporte como zapatero, incluye la palabra clave en el nombre o id, por ejemplo:

```csv
m2-zapatera-inferior,Zapatera inferior M2,740,300,3,si,#D9C2A3,15,"T,B,L,R",2,
m2-repisa-zapatera-inferior,Repisa zapatera inferior M2,740,350,3,si,#D9C2A3,15,"T,B,L,R",2,
```

### Divisores (`divider`)

- Divisores verticales: `alto` > `ancho` × 1.5.
- Divisores horizontales: se colocan automáticamente en la zona entre estantes.
- Su profundidad siempre se recorta a la profundidad interior del módulo.

## Profundidad interior

Las piezas interiores (repisas, estantes, zapateros y divisores) se dibujan desde la **cara interior del fondo** hasta el frente del módulo. Si el módulo tiene:

- profundidad `D`
- fondo con espesor `tf`

entonces la profundidad interior útil es:

```
profundidad_interior = D − tf − t
```

Siendo `tf` el espesor del fondo y `t` el espesor de los laterales. Esto evita que las repisas atraviesen el fondo o se salgan por delante de los laterales.

## Advertencias comunes

- `CRÍTICO: ... requiere soporte central o divisor`: la pieza tiene una luz mayor a 800 mm y espesor ≤ 15 mm.
- `ALTO: ... recomienda soporte intermedio`: la pieza tiene una luz entre 600 y 800 mm. Si el módulo incluye un soporte, montante o divisor, esta advertencia se suprime.
- `... excede ancho interior`: la repisa es más ancha que el espacio entre laterales.
- `... excede profundidad interior disponible`: la repisa es más profunda que `D − tf`.
- `fondo externo/interno no coincide con caja`: las medidas del fondo no corresponden al tipo de montaje detectado.

## Ejemplos de referencia

- Fondo externo: `ejemplo-fondo-externo.csv`
- Fondo interno: `ejemplo-fondo-interno.csv` y `ejemplo-closet-modular-abierto.csv`
- Fondo custom: `ejemplo-fondo-custom.csv`
- Base interna con zócalo global: `ejemplo-armario.csv` y `ejemplo-closet-modular-abierto.csv`
