# Guía de Cotización — CutterNest

La página de cotización calcula el precio de un proyecto en tiempo real combinando material, hardware y mano de obra.

## Acceso

1. Crea o abre un proyecto.
2. Guarda las piezas y optimiza.
3. Desde los resultados del optimizador haz clic en **Cotizar** o navega a:

```
http://localhost:3000/quote/<projectId>
```

## Parámetros

| Campo | Descripción |
|-------|-------------|
| **Costo material por m²** | Precio del tablero por metro cuadrado. El sistema sugiere el precio del catálogo según material y espesor. |
| **Área material m²** | Superficie total del tablero base. Se carga automáticamente desde el proyecto. |
| **Costo hora MO** | Tarifa por hora de mano de obra. |
| **Horas MO** | Tiempo estimado de trabajo. |
| **Margen** | Multiplicador de ganancia. Por defecto `1.3` (30 %). |

## Hardware

La tabla de hardware permite agregar insumos adicionales:

| Columna | Descripción |
|---------|-------------|
| **Item** | Nombre del insumo (bisagras, tornillos, patas, etc.). |
| **Cantidad** | Unidades. |
| **P/U USD** | Precio unitario. |
| **Subtotal** | Calculado automáticamente. |

- Usa el botón **Agregar item** para añadir una fila.
- Presiona el ícono de basura para eliminar una fila.

## Desglose en vivo

Cambiar cualquier campo actualiza el desglose instantáneamente:

```
Material:        $XX.XX
Hardware:        $XX.XX
Mano de obra:    $XX.XX
───────────────────────
Subtotal:        $XX.XX
Margen (30%):    $XX.XX
───────────────────────
Total:           $XX.XX
```

El total se calcula como:

```
total = (material + hardware + mano_obra) * margen
```

## Precio sugerido

Si el catálogo tiene un precio registrado para el material y espesor del proyecto, aparece un botón **"Sugerido: $X.XX"** junto al campo de costo por m². Haz clic para aplicarlo.

## Plantillas de hardware

Haz clic en **Cargar plantilla** para elegir una lista predefinida de insumos (bisagras, tornillos, correderas, patas, etc.). El sistema llena automáticamente la tabla con los precios unitarios del catálogo.

## Historial de cotizaciones

Cada vez que guardas una cotización, queda registrada en el historial del proyecto. Puedes consultar cotizaciones anteriores desde la misma página y descargar su PDF.

## Generar PDF

Presiona **Generar PDF** para crear la cotización oficial del proyecto. Si el backend devuelve una ruta (`pdf_path`), se abrirá en una nueva pestaña.

## Flujo recomendado

1. Revisa que el proyecto tenga el material y dimensiones correctas.
2. Ajusta el costo por m² (o usa el sugerido).
3. Agrega el hardware necesario.
4. Define las horas de mano de obra.
5. Ajusta el margen según el negocio.
6. Genera el PDF.

## Ejemplo rápido

| Concepto | Valor |
|----------|-------|
| Costo m² | $12.50 |
| Área material | 4.46 m² |
| Hardware | $8.00 |
| Mano de obra | 2 h × $5.00/h = $10.00 |
| Margen | 1.3 |
| **Total** | **$80.99** |

> `(12.50 × 4.46 + 8.00 + 10.00) × 1.3 = 80.99`
