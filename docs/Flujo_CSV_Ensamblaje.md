# Flujo rápido: CSV → Ensamblaje paso a paso

Este tutorial usa el archivo **Ejemplo_CSV_Basico.csv** (6 piezas, 1 módulo). El objetivo es que veas claramente cómo el ensamblaje genera pasos sin confusión.

## 1. Descargar el ejemplo

El archivo ya está en:

```bash
/workspace/cutternest-kit/docs/Ejemplo_CSV_Basico.csv
```

O copia este contenido:

```csv
# CutterNest Piezas v1
# Ejemplo básico: estantería de 1 módulo con 6 piezas.
# Sin piezas globales ni submódulos. Tablero recomendado: 183x244 cm (formato Ecuador).
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
m1-base,Base,120,60,1,si,#96CEB4,18,"T,B,L,R",1
m1-tapa,Tapa,120,60,1,si,#4ECDC4,18,"T,B,L,R",1
m1-lateral-izq,Lateral Izquierdo,50,180,1,no,#FF6B6B,18,"T,B,L",1
m1-lateral-der,Lateral Derecho,50,180,1,no,#FF6B6B,18,"T,B,R",1
m1-estante,Estante,100,30,1,si,#DDA0DD,18,"T,B,L,R",1
m1-fondo,Fondo,120,180,1,no,#F8F9FA,3,,1
```

## 2. Crear un proyecto

1. Abre `http://localhost:3000/projects`.
2. Haz clic en **Nuevo proyecto**.
3. Pon un nombre, por ejemplo `Tutorial estanteria`.
4. Elige plantilla **Estantería modular** (solo para precargar dimensiones) o deja todo por defecto.

## 3. Cargar el CSV

1. Ve al **Optimizador** (puedes hacer clic en el proyecto recién creado).
2. Haz clic en **Cargar CSV**.
3. Selecciona `Ejemplo_CSV_Basico.csv`.

Verás una tabla con 6 filas:

| Nombre             | Ancho | Alto | Cant. | Rotar | Color     |
|--------------------|-------|------|-------|-------|-----------|
| Base               | 120   | 60   | 1     | si    | verde     |
| Tapa               | 120   | 60   | 1     | si    | turquesa  |
| Lateral Izquierdo  | 50    | 180  | 1     | no    | rojo      |
| Lateral Derecho    | 50    | 180  | 1     | no    | rojo      |
| Estante            | 100   | 30   | 1     | si    | lila      |
| Fondo              | 120   | 180  | 1     | no    | blanco    |

## 4. Guardar las piezas (paso clave)

**Este es el paso que probablemente te faltó.** El ensamblaje no lee el CSV local del navegador; lee las piezas guardadas en el backend.

Haz clic en **Guardar piezas**. Aparecerá un mensaje: "Piezas guardadas en el proyecto".

> No hace falta presionar **Optimizar** para ver el ensamblaje. Pero si quieres ver el layout 2D/3D, sí debes optimizar.

## 5. Ir a Ensamblaje

1. Haz clic en **Ensamblaje** (dentro del optimizador) o ve a:

```
http://localhost:3000/assembly/<id-del-proyecto>
```

2. Verás un timeline con pasos similares a estos:

```
1. Pegar cantos              (6 piezas)
2. Colocar base              (1 pieza)
3. Atornillar laterales      (2 piezas)
4. Colocar estantes          (1 pieza)
5. Colocar tapa              (1 pieza)
6. Fijar fondo               (1 pieza)
```

3. Selecciona un paso y verás las piezas resaltadas en el canvas 3D.

## 6. Cómo navegar paso a paso

- **Timeline**: haz clic en cualquier paso para saltar.
- **Siguiente / Anterior**: usa los botones de flecha.
- **Clic en una pieza**: la selecciona y muestra su nombre arriba.
- **Mover / Rotar**: cambia el modo y arrastra la pieza.
- **Ajustar pieza seleccionada**: coloca la pieza automáticamente en su lugar.
- **Completar paso**: guarda el avance y pasa al siguiente.

## 7. Si sigues sin ver nada

Abre la consola del navegador (`F12`) y revisa:

- **Network**: busca `/projects/<id>/assembly`. Si responde `404` o `500`, el backend tiene un error.
- **Console**: errores de React o de Three.js.

Causas comunes:

1. **No guardaste las piezas**: repite el paso 4.
2. **El proyecto no existe**: revisa que la URL tenga el ID correcto.
3. **IDs sin prefijo de módulo**: usa `m1-`, `m2-`, etc. Ver [Formato_CSV_Piezas.md](Formato_CSV_Piezas.md).

## Resumen visual del flujo

```
Proyectos  →  Nuevo proyecto
    ↓
Optimizador  →  Cargar CSV  →  Guardar piezas
    ↓
Ensamblaje  →  Timeline de pasos  →  Canvas 3D
```
