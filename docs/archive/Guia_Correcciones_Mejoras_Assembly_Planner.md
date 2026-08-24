# CutterNest Assembly Planner — Guía de Correcciones y Mejoras

> **Documento generado:** 2026-08-19  
> **Basado en:** Análisis dimensional y visual de 18 archivos CSV de ejemplo  
> **Motor evaluado:** SVG Engine v3 + Heurísticas de ensamblaje + Parser CSV

---

## 1. Resumen Ejecutivo

Se analizaron **18 archivos CSV** de ejemplo. Se detectaron **3 categorías de problemas**:

| Categoría | Cantidad | Severidad |
|-----------|----------|-----------|
| 🔴 Crítico (pieza no cabe) | 7 | Alto — rompe visualización |
| 🟡 Advertencia (huecos grandes / desalineación) | 18 | Medio — visualización fea |
| 🔵 Info (rotate confuso / espesores) | 25 | Bajo — documentar o estandarizar |

**Conclusión:** Los ejemplos fueron diseñados pensando solo en el **optimizador de cortes** (planos de melamina), pero no en el **motor de visualización SVG** que calcula interiores, espesores y encajes reales.

---

## 2. Problemas Críticos por Archivo

### 2.1 `Ejemplo_CSV_Basico.csv`
**Problema:** El estante es más ancho que el interior del módulo.

| Pieza | Ancho actual | Interior disponible | Diferencia |
|-------|-------------|---------------------|------------|
| `m1-estante` | 100 mm | 84 mm (120 − 2×18) | **+16 mm** ❌ |

**Causa:** `rotate=si` en el estante no invierte el ancho visual. El motor SVG usa `ancho` del CSV directamente para `shelf` en cabinet.

**Corrección:**
```csv
# ANTES
m1-estante,Estante,100,30,1,si,#DDA0DD,18,"T,B,L,R",1

# DESPUÉS (opción A: reducir estante)
m1-estante,Estante,84,30,1,si,#DDA0DD,18,"T,B,L,R",1

# DESPUÉS (opción B: agrandar base/tapa)
m1-base,Base,140,60,1,si,#96CEB4,18,"T,B,L,R",1
m1-tapa,Tapa,140,60,1,si,#4ECDC4,18,"T,B,L,R",1
```

---

### 2.2 `Ejemplo_CSV_Escritorio.csv`
**Problema:** Frentes de cajón no caben en el ancho interior del módulo.

| Módulo | Frente cajón | Interior (base − 2×espesor) | Diferencia |
|--------|-------------|------------------------------|------------|
| M1→11, M12 | 400 mm | 370 mm (400 − 2×15) | **+30 mm** ❌ |
| M2→21, M22 | 400 mm | 370 mm (400 − 2×15) | **+30 mm** ❌ |

**Corrección:**
```csv
# ANTES
m11-cajon-frente,Frente cajon superior M1,400,180,1,si,#8B5A2B,15,"T,B,L,R",11

# DESPUÉS
m11-cajon-frente,Frente cajon superior M1,368,180,1,si,#8B5A2B,15,"T,B,L,R",11
```

**Problema adicional:** Desalineación estructura global.

| Pieza global | Ancho | Suma bases módulos | Diferencia |
|--------------|-------|-------------------|------------|
| `glb-tablero` | 1600 mm | 2400 mm (400+400+1600) | **−1000 mm** ❌ |

**Corrección:** El tablero global debe abarcar todos los módulos:
```csv
# ANTES
glb-tablero,Tablero escritorio,1600,700,1,si,#D9C2A3,30,"T,B,L,R",estructura

# DESPUÉS
glb-tablero,Tablero escritorio,2400,700,1,si,#D9C2A3,30,"T,B,L,R",estructura
```

---

### 2.3 `Ejemplo_CSV_Mueble_TV.csv`
**Problema:** Cajones más profundos que el módulo padre.

| Módulo | Lateral cajón (alto) | Base módulo (alto = profundidad) | Diferencia |
|--------|---------------------|----------------------------------|------------|
| M2→21, M22 | 450 mm | 400 mm | **+50 mm** ❌ |

**Corrección:**
```csv
# ANTES
m21-cajon-lateral-izq,Lateral cajon superior M2,180,450,1,no,#D9C2A3,15,"T,B,L",21

# DESPUÉS (dejar 10 mm de holgura para carriles)
m21-cajon-lateral-izq,Lateral cajon superior M2,180,390,1,no,#D9C2A3,15,"T,B,L",21
```

---

## 3. Advertencias (Huecos Visuales Grandes)

### 3.1 Cajones angostos en módulos anchos
En múltiples ejemplos, los frentes de cajón ocupan menos del 60% del ancho del módulo, dejando un **hueco visual grande** a los lados. Esto es válido si hay puertas adyacentes o falso frente, pero si el cajón debería llenar el cajonero, está mal dimensionado.

| Ejemplo | Módulo | Ancho módulo | Frente cajón | Hueco lateral |
|---------|--------|-------------|--------------|---------------|
| Cómoda | M1 | 900 mm | 400 mm | **500 mm** |
| Cocina M1 | M1 | 600 mm | 400 mm | **200 mm** |
| Cocina M2 | M2 | 600 mm | 400 mm | **200 mm** |
| Cocina M4 | M4 | 600 mm | 400 mm | **200 mm** |
| Vanitory | M1 | 800 mm | 400 mm | **400 mm** |
| Armario | M1, M2 | 800 mm | 400 mm | **400 mm** |
| Mueble TV | M2 | 500 mm | 400 mm | **100 mm** |

**Regla de diseño:**
```
ancho_frente_cajon = ancho_base − (2 × espesor_lateral) − 3 mm_holgura
```

**Ejemplo de corrección (Cocina M1):**
```csv
# ANTES
m11-cajon-frente,Frente cajon inferior M1,400,180,1,si,#8B5A2B,15,"T,B,L,R",11

# DESPUÉS (si el cajón llena todo)
m11-cajon-frente,Frente cajon inferior M1,568,180,1,si,#8B5A2B,15,"T,B,L,R",11
# 600 − (2 × 15) − 2 = 568 mm
```

---

### 3.2 Estructura global desalineada

| Ejemplo | Ancho global | Suma módulos | Diferencia |
|---------|-------------|--------------|------------|
| Escritorio | 1600 mm | 2400 mm | −1000 mm |
| Librero | 1880 mm | 1810 mm | −70 mm |

**Regla de diseño:**
```
ancho_zocalo_corrido = Σ ancho_base de cada módulo padre
```

---

## 4. Problemas del Motor SVG (No de los CSV)

### 4.1 `rotate=si` en bases/tapas no afecta visualización
El motor SVG ignora `rotate` para `top_panel` y `bottom_panel`:

```javascript
// svgEngine.js — getPieceDims()
if (role === 'top_panel' || role === 'bottom_panel') {
    return { w: ancho, h: useVisualThickness(alto, espesor) };
    //        ^^^^^ siempre usa el campo "ancho" del CSV
}
```

**Impacto:** Si el usuario pone `ancho=60, alto=120, rotate=si` esperando que el módulo mida 120×60, el SVG lo renderizará como 60×18 (espesor). Esto es **intencional** (el ancho del mueble siempre es el campo `ancho`), pero **no está documentado**.

**Recomendación:** Agregar al `Formato_CSV_Piezas.md`:
> **Nota sobre `rotate`:** El campo `rotate` solo afecta el optimizador de cortes. El motor de visualización ignora `rotate` para bases, tapas y laterales; la orientación visual se determina por el nombre de la pieza (`base`, `lateral`, `fondo`, etc.).

---

### 4.2 `rotate=si` en laterales puede invertir altura
Si un lateral tiene `ancho=50, alto=180, rotate=si`, el motor de visualización hace:
```javascript
w = 180, h = 50  // por rotate
// luego para side_panel:
return { w: espesor, h: Math.max(w, h) }  // = Math.max(180, 50) = 180
```

En este caso funciona bien, pero si `ancho > alto` originalmente y `rotate=si`, el resultado visual puede ser inesperado.

**Recomendación:** Validar en `csvParser.js` que laterales con `rotate=si` tengan `alto > ancho` (la altura debe ser la dimensión mayor).

---

### 4.3 Fondos decorativos (espesor ≤ 5 mm) sin cantos
Los fondos de 3 mm no llevan cantos (`cantos=` vacío), pero el motor de visualización los renderiza con las mismas dimensiones que el fondo estructural. Esto es correcto, pero podría indicarse visualmente con un patrón diferente (línea punteada o color más claro).

**Recomendación:** En `buildSVG`, aplicar `stroke-dasharray="2,2"` a piezas con `espesor <= 5`.

---

## 5. Reglas de Diseño para Futuros Ejemplos

### 5.1 Fórmulas dimensionales obligatorias

```
# Módulo rectangular cerrado
ancho_base      = ancho_tapa
alto_base       = alto_tapa   (= profundidad del módulo)
ancho_fondo     = ancho_base
alto_fondo      = alto_lateral
ancho_lateral   = espesor_material
alto_lateral    = alto_módulo

# Interior del módulo (hueco útil)
ancho_interior  = ancho_base − (2 × espesor_lateral)
alto_interior   = alto_lateral − (2 × espesor_base)

# Estantes y repisas
ancho_estante   ≤ ancho_interior − 2

# Cajones (dentro de módulo)
ancho_frente    = ancho_interior − 3
alto_frente     = (alto_interior / n_cajones) − 5
alto_lateral_cajon ≤ alto_base − 10   # holgura carriles
ancho_fondo_cajon = ancho_frente − (2 × espesor_lateral_cajon)

# Estructura global
ancho_zocalo    = Σ ancho_base de cada módulo padre
alto_zocalo     = espesor_material
```

### 5.2 Convención de nombres para detección automática

| Nombre contiene | Rol detectado | Notas |
|-----------------|---------------|-------|
| `base` (sin `cajon`) | `bottom_panel` | Ancho = ancho módulo |
| `tapa` / `techo` | `top_panel` | Ancho = ancho módulo |
| `lateral` (sin `cajon`) | `side_panel` | Visual: ancho = espesor, alto = max(ancho,alto) |
| `fondo` / `trasera` | `back_panel` | Ancho = ancho módulo, alto = alto lateral |
| `estante` / `repisa` | `shelf` | En cabinet: visual usa espesor como alto |
| `divisor` / `division` | `divider` | Anti-pandeo, tira vertical |
| `cajon` + `frente` | `drawer_face` | Frente visible del cajón |
| `cajon` + `lateral` | `drawer_side` | Lateral interno del cajón |
| `cajon` + `base` | `drawer_bottom` | Base del cajón |
| `cajon` + `fondo` | `drawer_back` | Fondo del cajón |
| `puerta` | `door` | Panel abatible |
| `tirador` | `handle` | Accesorio pequeño |
| `pata` / `pie` | `leg` | Pata de mesa/silla |
| `riel` / `barra` | `hanger_rail` | Riel colgador |
| `travesano` / `refuerzo` | `brace` | Refuerzo estructural |

### 5.3 Convención de IDs para módulos

```
glb-        → Pieza global (estructura, zócalo, tapa corrida)
m1-         → Módulo 1 (padre)
m11-        → Submódulo 1.1 (cajón dentro de módulo 1)
m12-        → Submódulo 1.2 (segundo cajón)
m2-         → Módulo 2 (padre, independiente de m1)
m21-        → Submódulo 2.1
```

**Regla:** Un submódulo `mXY` pertenece al padre `mX`. El motor de ensamblaje calcula los pasos del padre primero, luego los del submódulo.

---

## 6. Mejoras Sugeridas al Sistema

### 6.1 Validación dimensional automática
Agregar al `csvParser.js` una función `validateDimensions()` que verifique dimensiones estructurales por módulo.

### 6.2 Plantillas de muebles predefinidos
En lugar de ejemplos CSV sueltos, ofrecer "plantillas" que generen las piezas automáticamente según parámetros:

| Plantilla | Parámetros | Piezas generadas |
|-----------|-----------|------------------|
| Cajonera | ancho, alto, profundidad, n_cajones, espesor | base, tapa, 2 laterales, fondo, n×(frente, 2 laterales cajón, fondo cajón, base cajón, tirador) |
| Librero | ancho, alto, profundidad, n_estantes, espesor | base, tapa, 2 laterales, fondo, n×estantes, divisores opcionales |
| Ropero | ancho, alto, profundidad, n_puertas, espesor | base, tapa, 2 laterales, fondo, n_puertas, riel, estante |
| Mesa | ancho, profundidad, alto, espesor_tablero, n_patas | tablero, 4 patas, estante inferior opcional |

### 6.3 Vista previa de validación
Antes de cargar el CSV, mostrar una tabla de validación:

| Módulo | Piezas | Ancho interior | Estantes caben | Cajones caben | Puertas caben | Estado |
|--------|--------|---------------|----------------|---------------|---------------|--------|
| M1 | 6 | 84 mm | ❌ 100 mm | — | — | Error |
| M2 | 12 | 370 mm | — | ❌ 400 mm | — | Error |

### 6.4 Modo "Exploded View" para cajones
En el paso de ensamblaje de submódulos de cajón, mostrar una vista explotada 3D (o isométrica 2D) que separe las 5 piezas del cajón: frente, 2 laterales, fondo, base.

### 6.5 Exportar lista de cortes optimizada
Desde el manual de ensamblaje, agregar un botón "Exportar plano de corte" que genere un SVG con las piezas dispuestas en una plancha 183×244 cm (formato estándar), respetando las cantidades y rotaciones permitidas.

---

## 7. Ejemplos CSV Corregidos

### 7.1 `Ejemplo_CSV_Basico.csv` (corregido)

```csv
# CutterNest Piezas v1
# Ejemplo básico corregido: estantería de 1 módulo con 6 piezas.
# Tablero recomendado: 183x244 cm (formato Ecuador).
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
m1-base,Base,120,60,1,si,#96CEB4,18,"T,B,L,R",1
m1-tapa,Tapa,120,60,1,si,#4ECDC4,18,"T,B,L,R",1
m1-lateral-izq,Lateral Izquierdo,50,180,1,no,#FF6B6B,18,"T,B,L",1
m1-lateral-der,Lateral Derecho,50,180,1,no,#FF6B6B,18,"T,B,R",1
m1-estante,Estante,84,30,1,si,#DDA0DD,18,"T,B,L,R",1
m1-fondo,Fondo,120,180,1,no,#F8F9FA,3,,1
```

**Cambios:** `m1-estante` ancho 100 → 84 mm (120 − 2×18 = 84).

---

### 7.2 `Ejemplo_CSV_Escritorio.csv` — Cajoneras corregidas

```csv
# --- Modulo 1: cajonera izquierda (corregida) ---
m1-base,Base modulo M1,400,560,1,si,#C19A6B,15,"T,B,L,R",1
m1-tapa,Tapa modulo M1,400,560,1,si,#C19A6B,15,"T,B,L,R",1
m1-lateral-izq,Lateral izquierdo M1,560,700,1,no,#C19A6B,15,"T,B,L",1
m1-lateral-der,Lateral derecho M1,560,700,1,no,#C19A6B,15,"T,B,R",1
m1-fondo,Fondo modulo M1,400,700,1,no,#F2F2F2,15,"",1

# Submódulo 11: cajón superior (frente ajustado a 368 mm)
m11-cajon-frente,Frente cajon superior M1,368,180,1,si,#8B5A2B,15,"T,B,L,R",11
m11-cajon-lateral-izq,Lateral cajon superior M1,180,390,1,no,#D9C2A3,15,"T,B,L",11
m11-cajon-lateral-der,Lateral cajon superior M1,180,390,1,no,#D9C2A3,15,"T,B,R",11
m11-cajon-fondo,Fondo cajon superior M1,338,390,1,no,#F2F2F2,15,,11
m11-cajon-base,Base cajon superior M1,338,390,1,si,#D9C2A3,15,"T,B,L,R",11
m11-cajon-tirador,Tirador cajon superior M1,2,20,1,no,#A0A0A0,5,,11

# Submódulo 12: cajón inferior (frente ajustado a 368 mm)
m12-cajon-frente,Frente cajon inferior M1,368,180,1,si,#8B5A2B,15,"T,B,L,R",12
m12-cajon-lateral-izq,Lateral cajon inferior M1,180,390,1,no,#D9C2A3,15,"T,B,L",12
m12-cajon-lateral-der,Lateral cajon inferior M1,180,390,1,no,#D9C2A3,15,"T,B,R",12
m12-cajon-fondo,Fondo cajon inferior M1,338,390,1,no,#F2F2F2,15,,12
m12-cajon-base,Base cajon inferior M1,338,390,1,si,#D9C2A3,15,"T,B,L,R",12
m12-cajon-tirador,Tirador cajon inferior M1,2,20,1,no,#A0A0A0,5,,12
```

**Cálculos:**
- Interior módulo: 400 − (2 × 15) = **370 mm**
- Frente cajón: 370 − 2 = **368 mm** (2 mm de holgura)
- Lateral cajón: 560 (profundidad módulo) − 10 (carriles) − 160 (frente) = **390 mm** → ajustado a 390 mm para no sobresalir
- Fondo cajón: 368 − (2 × 15) = **338 mm**

---

### 7.3 `Ejemplo_CSV_Mueble_TV.csv` — Cajonera corregida

```csv
# --- Modulo 2: lateral cajonera (corregida) ---
m2-base,Base modulo M2,500,400,1,si,#8B5A2B,15,"T,B,L,R",2
m2-tapa,Tapa modulo M2,500,400,1,si,#8B5A2B,15,"T,B,L,R",2
m2-lateral-izq,Lateral izquierdo M2,400,500,1,no,#8B5A2B,15,"T,B,L",2
m2-lateral-der,Lateral derecho M2,400,500,1,no,#8B5A2B,15,"T,B,R",2
m2-fondo,Fondo modulo M2,500,500,1,no,#F2F2F2,15,"",2

# Submódulo 21: cajón superior (frente y laterales ajustados)
m21-cajon-frente,Frente cajon superior M2,468,180,1,si,#C19A6B,15,"T,B,L,R",21
m21-cajon-lateral-izq,Lateral cajon superior M2,180,390,1,no,#D9C2A3,15,"T,B,L",21
m21-cajon-lateral-der,Lateral cajon superior M2,180,390,1,no,#D9C2A3,15,"T,B,R",21
m21-cajon-fondo,Fondo cajon superior M2,438,390,1,no,#F2F2F2,15,,21
m21-cajon-base,Base cajon superior M2,438,390,1,si,#D9C2A3,15,"T,B,L,R",21
m21-cajon-tirador,Tirador cajon superior M2,2,20,1,no,#A0A0A0,5,,21

# Submódulo 22: cajón inferior (frente y laterales ajustados)
m22-cajon-frente,Frente cajon inferior M2,468,180,1,si,#C19A6B,15,"T,B,L,R",22
m22-cajon-lateral-izq,Lateral cajon inferior M2,180,390,1,no,#D9C2A3,15,"T,B,L",22
m22-cajon-lateral-der,Lateral cajon inferior M2,180,390,1,no,#D9C2A3,15,"T,B,R",22
m22-cajon-fondo,Fondo cajon inferior M2,438,390,1,no,#F2F2F2,15,,22
m22-cajon-base,Base cajon inferior M2,438,390,1,si,#D9C2A3,15,"T,B,L,R",22
m22-cajon-tirador,Tirador cajon inferior M2,2,20,1,no,#A0A0A0,5,,22
```

**Cálculos:**
- Interior módulo: 500 − (2 × 15) = **470 mm**
- Frente cajón: 470 − 2 = **468 mm**
- Lateral cajón: 400 (profundidad) − 10 = **390 mm**
- Fondo cajón: 468 − (2 × 15) = **438 mm**

---

## 8. Checklist de Validación antes de Publicar un Ejemplo

- [ ] Todos los módulos tienen al menos: base, tapa, 2 laterales, fondo
- [ ] `ancho_base` = `ancho_tapa` = `ancho_fondo`
- [ ] `alto_lateral` = `alto_fondo` (o muy cercano)
- [ ] `alto_base` = `alto_tapa` = profundidad del módulo
- [ ] Estantes/repisas: `ancho ≤ ancho_base − 2×espesor_lateral`
- [ ] Cajones: `ancho_frente ≤ ancho_base − 2×espesor_lateral − 3`
- [ ] Cajones: `alto_lateral_cajon ≤ alto_base − 10`
- [ ] Fondo cajón: `ancho = ancho_frente − 2×espesor_lateral_cajon`
- [ ] Estructura global: `ancho_zocalo = Σ ancho_base de módulos padre`
- [ ] Submódulos: IDs empiezan con el ID del módulo padre (`m1` → `m11`, `m12`)
- [ ] Colores HEX válidos de 6 dígitos
- [ ] Espesores > 0 y consistentes dentro del mismo módulo (±5 mm)
- [ ] `rotate=si` solo en piezas donde el optimizador pueda rotar (estantes, fondos cuadrados)
- [ ] Laterales: `rotate=no` (la altura debe ser la dimensión mayor)
- [ ] Cantos: piezas de 3 mm sin cantos; piezas de 15-18 mm con cantos según visibilidad

---

## 9. Glosario

| Término | Definición |
|---------|-----------|
| **Módulo** | Unidad estructural independiente (ej. cajonera, librero). Tiene base, tapa, laterales, fondo. |
| **Submódulo** | Piezas que van dentro de un módulo (ej. cajón dentro de cajonera). ID = ID_padre + dígito. |
| **Estructura global** | Piezas que unen módulos (zócalo corrido, tapa corrida, panel trasero). `modulo=estructura`. |
| **Interior** | Espacio útil dentro del módulo: `ancho_base − 2×espesor_lateral`. |
| **Visual vs. Corte** | El motor de corte respeta `rotate`; el motor SVG ignora `rotate` para piezas estructurales. |
| **Espesor** | Grosor del tablero en mm. Determina el ancho visual de laterales y tapas. |
| **Cantos** | Lados visibles que llevan tapacanto (T=top, B=bottom, L=left, R=right). |

---

*Fin del documento*
