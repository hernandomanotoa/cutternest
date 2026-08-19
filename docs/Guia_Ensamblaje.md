# Guía de Ensamblaje — CutterNest

## Nuevo Assembly Planner (interactivo, offline)

Existe una herramienta autocontenida en HTML/CSS/JS vanilla pensada para el flujo de taller. Permite importar un CSV de piezas, editar dependencias en un grafo interactivo, analizar cargas y pandeo, calcular pasos de ensamblaje por orden topológico, simular la secuencia y generar un manual paso a paso con diagramas SVG.

### Acceso

Desde la página de ensamblaje de cualquier proyecto, haz clic en **Nuevo planner**. También puedes abrirlo directamente en:

```
http://localhost:3000/assembly-planner/
```

### Funcionalidades

| Vista | Qué hace |
|-------|----------|
| **CSV** | Importa, edita y exporta el CSV de piezas CutterNest. |
| **Estructural** | Calcula carga máxima por repisa, riesgo de pandeo y factor de seguridad contra vuelco. |
| **Grafo** | Editor SVG de dependencias con drag & drop, click-to-connect y detección de ciclos. |
| **Ensamblaje** | Timeline de pasos calculados con Kahn y simulador animado. |
| **Manual** | Manual navegable con diagramas SVG por paso, exportable a HTML/JSON e imprimible. |

El panel lateral muestra siempre el resumen de piezas, pasos, alertas y la lista de herrajes/insumos calculada automáticamente.

### Reglas del CSV para que el Manual se dibuje bien

El Assembly Planner no crea la estructura por arte de magia: espera encontrar en cada módulo las piezas que conoce. Si faltan, el diagrama quedará vacío o incompleto.

#### 1. Cada módulo debe tener su propia estructura

Para que el diagrama SVG del Manual muestre una caja completa, cada módulo que quieras ver debe incluir:

- **Base** (`nombre` contiene `base` y no `cajon`).
- **Tapa** (`nombre` contiene `tapa` o `techo` y no `cajon`).
- **Laterales** al menos uno con `lateral` y sin `cajon`.
- **Fondo / trasera** (`fondo` o `trasera` y sin `cajon`).

Ejemplo:
```csv
m1-base,Base modulo M1,450,520,1,si,#C19A6B,15,"T,B,L,R",1
m1-tapa,Tapa modulo M1,450,550,1,si,#C19A6B,15,"T,B,L,R",1
m1-lateral-izq,Lateral izquierdo M1,2300,550,1,no,#C19A6B,15,"T,B,L",1
m1-lateral-der,Lateral derecho M1,2300,550,1,no,#C19A6B,15,"T,B,R",1
m1-fondo,Fondo modulo M1,450,2300,1,no,#F2F2F2,15,,1
```

Si pones la estructura en `modulo=estructura` (global), los módulos individuales quedarán sin diagrama y solo se mostrarán como insertos (puertas, estantes, cajones) dentro del fondo global.

#### 2. Agrupación automática de módulos idénticos

Si dos módulos tienen la misma huella estructural (mismos conteos de base, tapa, lateral, fondo, cajón, puerta, estante y mismas dimensiones de base/tapa), el selector los agrupa como `Módulos 1 + 4`. El Manual los presentará secuencialmente: primero todos los pasos del módulo 1, luego los del 4.

Si **no** quieres que se agrupen, cambia ligeramente las dimensiones de la base o la tapa de uno de ellos:
```csv
m1-base,Base modulo M1,450,520,1,si,#C19A6B,15,"T,B,L,R",1
m4-base,Base modulo M4,460,520,1,si,#C19A6B,15,"T,B,L,R",4
```

#### 3. Cajones como submódulos

Para que un cajón genere su propio plan de ensamblaje y dependa del módulo padre, colócalo en un submódulo numérico (por ejemplo `21` dentro del módulo `2`):

```csv
m2-base,Base modulo M2,460,520,1,si,#8B5A2B,15,"T,B,L,R",2
...
m21-cajon-frente,Frente cajon M2,400,180,1,si,#D9C2A3,15,"T,B,L,R",21
m21-cajon-base,Base cajon M2,360,450,1,si,#D9C2A3,15,"T,B,L,R",21
```

El planner detectará que `21` empieza con `2` y creará dependencias del cajón hacia la estructura del módulo 2.

#### 4. Evita errores comunes

- Revisa que todas las piezas de un mismo módulo tengan exactamente el mismo valor en la columna `modulo`.
- No mezcles piezas del módulo `2` dentro del módulo `1`; rompe el plan y el diagrama.
- Si un módulo solo tiene puertas, estantes o tiradores sin estructura propia, el Manual solo mostrará esos elementos flotando dentro del fondo global (o nada si no hay fondo global).

#### 5. Muebles de ejemplo

El Assembly Planner incluye **10 muebles de ejemplo** diferentes. Puedes cargarlos desde el selector **Mueble** del header o importar manualmente los CSV desde `docs/`.

| Archivo en `docs/` | Vista en UI | Qué representa |
|---|---|---|
| `Ejemplo_CSV_Basico.csv` | Básico — estantería | Estantería simple de 1 módulo, sin global ni submódulos. |
| `Ejemplo_CSV_Con_Global_y_Submodulo.csv` | Con estructura global y submódulo | Estructura global + módulo de estantes + cajón en submódulo `21`. |
| `Ejemplo_CSV_Cajoneras_4_Modulos.csv` | Clóset / cajoneras 4 módulos | Clóset completo con 4 módulos, estructura global y submódulos padre-hijo. |
| `Ejemplo_CSV_Cajones_Verticales_y_Repisas.csv` | Cajones verticales + repisas | Módulos con cajones apilados verticalmente y repisas superior/inferior. |
| `Ejemplo_CSV_Cocina_Modular.csv` | Cocina modular | Bajo mesada, cajonera triple, alacena y torre horno. |
| `Ejemplo_CSV_Vanitory.csv` | Vanitory | Vanitory doble cajón, torre auxiliar y repisa abierta. |
| `Ejemplo_CSV_Comoda_Chifonier.csv` | Cómoda / chifonier | 5 cajones verticales en un solo módulo. |
| `Ejemplo_CSV_Mueble_TV.csv` | Mueble de TV | Centro abierto con estantes + laterales con cajones y puerta. |
| `Ejemplo_CSV_Escritorio.csv` | Escritorio | Tablero corrido + cajoneras laterales + repisa superior. |
| `Ejemplo_CSV_Armario_Puertas_Corredizas.csv` | Armario con puertas corredizas | Cuerpo con barra y repisas + puertas corredizas globales. |
| `Ejemplo_CSV_Librero_Alto_con_Soportes.csv` | Librero alto con soportes | Librero de 2200 mm con montantes centrales, travesaños y patas/tirantes. |

Desde la interfaz selecciona el mueble en el header y presiona **Cargar**.

#### 6. Cajones verticales y repisas superior/inferior

El diagrama reconoce las palabras `superior` e `inferior` en el nombre de la pieza:

- `Repisa Superior M1` se dibuja alineada arriba del módulo.
- `Repisa Inferior M1` se dibuja alineada abajo del módulo.
- Las repisas sin esas palabras se distribuyen en el espacio medio.

Para dos cajones apilados verticalmente dentro del mismo módulo, usa submódulos separados (por ejemplo `11` para el cajón superior e `12` para el inferior). El diagrama dibujará los frentes uno arriba y otro abajo cuando detecte exactamente dos frentes de cajón.

Ejemplo:
```csv
m1-base,Base modulo M1,450,520,1,si,#C19A6B,15,"T,B,L,R",1
m1-tapa,Tapa modulo M1,450,550,1,si,#C19A6B,15,"T,B,L,R",1
m1-lateral-izq,Lateral izquierdo M1,2300,550,1,no,#C19A6B,15,"T,B,L",1
m1-lateral-der,Lateral derecho M1,2300,550,1,no,#C19A6B,15,"T,B,R",1
m1-fondo,Fondo modulo M1,450,2300,1,no,#F2F2F2,15,,1
m1-repisa-superior,Repisa Superior M1,390,380,1,si,#D9C2A3,15,"T,B,L,R",1
m1-repisa-inferior,Repisa Inferior M1,390,380,1,si,#D9C2A3,15,"T,B,L,R",1

m11-cajon-frente,Frente cajon superior M1,400,180,1,si,#8B5A2B,15,"T,B,L,R",11
m11-cajon-base,Base cajon superior M1,360,450,1,si,#D9C2A3,15,"T,B,L,R",11
m11-cajon-lateral-izq,Lateral cajon superior M1,180,450,1,no,#D9C2A3,15,"T,B,L",11
m11-cajon-lateral-der,Lateral cajon superior M1,180,450,1,no,#D9C2A3,15,"T,B,R",11
m11-cajon-fondo,Fondo cajon superior M1,360,450,1,no,#F2F2F2,15,,11
m11-cajon-tirador,Tirador cajon superior M1,2,20,1,no,#A0A0A0,5,,11

m12-cajon-frente,Frente cajon inferior M1,400,180,1,si,#8B5A2B,15,"T,B,L,R",12
...
```

Un ejemplo completo con cuatro módulos de este tipo (módulos 1 y 2 con cajones verticales, módulos 3 y 4 con 3 repisas inferiores + 1 superior) está en `docs/Ejemplo_CSV_Cajones_Verticales_y_Repisas.csv`.

---

## Ensamblaje 3D clásico

El módulo de ensamblaje guía al operario paso a paso para armar el mueble a partir de las piezas optimizadas.

## Acceso

1. Crea o abre un proyecto.
2. Guarda las piezas y optimiza.
3. Desde los resultados del optimizador haz clic en **Ensamblaje** o navega directamente a:

```
http://localhost:3000/assembly/<projectId>
```

## Interfaz

```
┌─────────────────────────────────────────────────────────────┐
│  Paso 3/12: Colocar estantes                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    CANVAS 3D                                │
│  - piezas colocadas: atenuadas                              │
│  - pieza activa del paso: resaltada/outline                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Timeline  ·  Validar  ·  Completar  ·  Vista explotada     │
└─────────────────────────────────────────────────────────────┘
```

## Controles principales

| Control | Acción |
|---------|--------|
| **Timeline** | Avanza/retrocede entre pasos. Muestra el progreso total. |
| **Clic en una pieza** | Selecciona la pieza activa del paso. |
| **Mover / Rotar** | Cambia el modo de transformación de la pieza seleccionada. |
| **Snap** | Activa/desactiva el ajuste automático a la posición esperada. |
| **Reiniciar vista** | Vuelve la cámara al ángulo definido para el paso actual. |
| **Vista explotada** | Separa todas las piezas con un slider para ver la estructura interna. |

## Cómo seguir un paso

1. Lee el título y la descripción del paso en la parte superior.
2. Localiza la pieza resaltada en el canvas 3D.
3. Arrástrala/rodéala hasta la posición indicada.
4. Presiona **Validar paso** para ver el delta en mm y grados.
   - Verde: dentro de tolerancia (2 mm / 5°).
   - Rojo: fuera de tolerancia.
5. Si está fuera, usa **Ajustar pieza seleccionada** para colocarla automáticamente en la posición esperada.
6. Presiona **Completar paso** para guardar el progreso y avanzar al siguiente.

## Vista previa del mueble armado vs. paso a paso

- **Paso a paso**: solo se muestran las piezas hasta el paso actual. Útil para armar de forma ordenada.
- **Vista previa**: muestra el mueble completamente ensamblado. Sirve para visualización final y verificación.

Cambia entre ambos con el botón **Vista previa / Asistente**.

## Manual de ensamblaje en PDF

Haz clic en **Generar manual PDF** para crear y descargar un PDF con las instrucciones paso a paso del proyecto.

## Persistencia

El progreso se guarda en el backend llamando a `/assembly/steps/{id}/progress`. Si recargas la página, el ensamblaje restaura el último paso completado.

## Atajos visuales

- Piezas atenuadas: ya fueron colocadas en pasos anteriores.
- Pieza activa: outline más grueso y color primario.
- Cámara: se anima automáticamente al cambiar de paso (`CameraControls.setLookAt`).
