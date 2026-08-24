# Formato CSV de piezas — Assembly Planner

> Copia de `docs/Formato_CSV_Piezas.md` para referencia offline.

# Formato CSV de piezas — CutterNest

Este documento describe el archivo CSV que usa el **Optimizador de cortes** para importar y exportar piezas.

## Cómo obtener una plantilla

Desde la página **Optimizador → Piezas** haz clic en **"Formato CSV"**. El navegador descargará un archivo con la cabecera correcta y las piezas actuales. También puedes copiar el ejemplo de abajo.

## Cabecera obligatoria

La primera línea útil del archivo debe contener exactamente estas columnas:

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos
```

Opcionalmente puedes agregar la columna `modulo` al final:

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
```

> El archivo también puede incluir dos líneas de metadatos al inicio con el formato de CutterNest (se generan automáticamente al descargar). Si editas a mano, al menos la fila de encabezados debe estar presente.

## Descripción de columnas

| Columna   | Tipo      | Obligatoria | Descripción |
|-----------|-----------|-------------|-------------|
| `id`      | texto     | No          | Identificador único. Si se deja vacío, se genera a partir del nombre. Para agrupar módulos en ensamblaje usa prefijos como `m1-`, `m2-`, `mod1-`, `module1-` o `glb-` (global). Ver [Ejemplo_CSV_Basico.csv](Ejemplo_CSV_Basico.csv). |
| `nombre`  | texto     | Sí          | Nombre descriptivo de la pieza (ej. `Base`, `Lateral izq`). |
| `ancho`   | número    | Sí          | Ancho de la pieza en **centímetros**. Debe ser mayor a 0. |
| `alto`    | número    | Sí          | Alto de la pieza en **centímetros**. Debe ser mayor a 0. |
| `cantidad`| entero    | Sí          | Cantidad de piezas iguales. Mayor a 0. |
| `rotate`  | `si`/`no` | Sí          | `si` permite rotar la pieza 90° para optimizar; `no` mantiene la orientación. |
| `color`   | hex       | Sí          | Color en formato HEX de 6 dígitos (ej. `#FF6B6B`). Se usa en el layout 2D/3D. |
| `espesor` | número    | Sí          | Espesor del material en **milímetros**. Mayor a 0. |
| `cantos`  | texto     | No          | Lados que llevan canteado. Letras separadas por coma: `T` (top), `B` (bottom), `L` (left), `R` (right). Ejemplo: `T,B,L,R`. |
| `modulo`  | texto     | No          | Nombre del módulo al que pertenece la pieza, útil para ensamblaje. |

## Ejemplo mínimo

```csv
# CutterNest Piezas v1
# Ejemplo mínimo: estantería de 1 módulo con 5 piezas.
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos
base,Base,120,60,1,si,#FF6B6B,18,T,B,L,R
tapa,Tapa,120,60,1,si,#4ECDC4,18,T,B,L,R
lateral-izq,Lateral Izq,50,180,1,no,#45B7D1,18,T,B,L
estante-1,Estante 1,100,30,1,si,#96CEB4,18,T,B,L,R
fondo,Fondo,60,180,1,no,#DDA0DD,3,
```

## Ejemplo con módulo

```csv
# CutterNest Piezas v1
# Ejemplo con módulos: cuerpo y frente.
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
cuerpo-base,Base cuerpo,120,60,1,si,#8B5A2B,18,T,B,L,R,Cuerpo
cuerpo-tapa,Tapa cuerpo,120,60,1,si,#8B5A2B,18,T,B,L,R,Cuerpo
puerta-izq,Puerta izquierda,58,175,1,si,#FFFFFF,18,T,B,L,R,Frente
```

## Reglas de validación

Antes de cargarse, cada fila se valida:

1. **Nombre vacío** → error.
2. **Ancho o alto ≤ 0** → error.
3. **Ancho o alto mayores que el tablero configurado** → la pieza se marca con advertencia `"Excede tablero"` en la tabla, pero se permite importar.
4. **Cantidad no es un entero positivo** → error.
5. **Espesor ≤ 0** → error.
6. **Color no es HEX de 6 dígitos** → error.
7. **`rotate` no es `si` ni `no`** → error.
8. **Número de columnas incorrecto** → error.

## Pegar desde Excel / Google Sheets

Puedes copiar directamente desde una hoja de cálculo con el botón **"Pegar CSV"** en el optimizador. El formato que se pega debe cumplir:

- Primera fila: encabezados exactos (`id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos`).
- Filas siguientes: datos separados por comas o tabulaciones.
- No incluir metadatos si lo pegas desde Excel; solo encabezado + datos.

Ejemplo de texto copiado válido:

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos
base,Base,120,60,1,si,#FF6B6B,18,T,B,L,R
```

8. **`rotate=si` solo afecta el optimizador de cortes.** El motor de visualización ignora `rotate` para piezas estructurales (bases, tapas, laterales, fondos). La orientación visual se determina por el nombre de la pieza. Usa `rotate=no` en laterales (`alto` debe ser la dimensión mayor).

## Buenas prácticas

- Usa nombres consistentes para piezas similares ( facilita el ensamblaje posterior).
- Define el `color` con el código HEX de la melamina real; así el layout 2D/3D se verá fiel.
- Deja `cantos` vacío para piezas que no se cantean (ej. fondos de 3 mm).
- Si no necesitas `id`, déjalo vacío; el sistema lo generará automáticamente.
