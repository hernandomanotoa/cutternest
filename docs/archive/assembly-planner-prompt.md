# Prompt: Implementar Módulo de Ensamblaje Visual e Interactivo en CutterNest

> **Fecha:** 2026-08-17  
> **Proyecto:** CutterNest — Módulo de Ensamblaje Inteligente  
> **Objetivo:** Mejorar la experiencia de usuario con herramientas automatizadas de generación de ayudas en ensamblaje y simulación visual.

---

## 1. Contexto del Proyecto

**CutterNest** es un sistema de optimización de corte de tableros (nested cutting / nesting) para muebles.  
Actualmente genera un CSV de piezas con dimensiones, cantidad, rotación, color, espesor, cantos y módulo.

### Ejemplo de entrada (CSV)

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
m1-base,Base,120,60,1,si,#96CEB4,18,"T,B,L,R",1
m1-tapa,Tapa,120,60,1,si,#4ECDC4,18,"T,B,L,R",1
m1-lateral-izq,Lateral Izquierdo,50,180,1,no,#FF6B6B,18,"T,B,L",1
m1-lateral-der,Lateral Derecho,50,180,1,no,#FF6B6B,18,"T,B,R",1
m1-estante,Estante,100,30,1,si,#DDA0DD,18,"T,B,L,R",1
m1-fondo,Fondo,120,180,1,no,#F8F9FA,3,,1
```

**Problema actual:** El usuario tiene las piezas cortadas pero **NO** tiene un sistema que le diga:
- En qué orden ensamblarlas.
- Cuántos pasos mínimos necesita.
- Qué piezas son paralelizables.
- Una guía visual paso a paso.

---

## 2. Objetivos del Módulo

### Objetivo Principal
Crear un **módulo de "Ensamblaje Inteligente"** dentro de CutterNest que, a partir del CSV de piezas, genere automáticamente:
1. Un **grafo de dependencias** visual e interactivo (drag & drop o click-to-connect).
2. Un **calculador de pasos mínimos** usando orden topológico (Kahn's algorithm).
3. Un **simulador animado** del ensamblaje paso a paso.
4. Un **manual de ensamblaje auto-generado** (visual, no solo texto).

### Objetivos de UX
- **Zero-config:** al importar el CSV, el sistema debe sugerir dependencias por defecto basadas en reglas heurísticas (ej: laterales → base/tapa → divisiones → fondo).
- Permitir al usuario **redefinir dependencias** visualmente (click en pieza A → click en pieza B = flecha de dependencia).
- Detectar **ciclos** en tiempo real y alertar visualmente.
- Mostrar **paralelismo**: piezas del mismo "nivel" deben resaltar juntas.
- Exportar el resultado como JSON/HTML/SVG para imprimir o enviar al taller.

---

## 3. Referencias Visuales (Ejemplos Validados)

Ya se validaron dos prototipos interactivos con el usuario. Usar como referencia de estilo y funcionalidad.

### Prototipo A: Manual de Ensamblaje Paso a Paso
- pasos con navegación (anterior/siguiente).
- Diagramas SVG por paso mostrando la estructura.
- Colores de piezas mapeados al CSV (`#96CEB4`, `#FF6B6B`, etc.).
- Tips de herramientas y advertencias por paso.
- Barra de progreso superior.

### Prototipo B: Calculador Visual Topológico
- Canvas con nodos (piezas) posicionados como bloques de colores.
- Flechas SVG dirigidas para definir dependencias.
- Lista de dependencias activas con botón de eliminación.
- Botón **"Calcular & Animar"** que ejecuta Kahn's algorithm.
- Timeline de pasos con indicación de paralelismo vs. secuencial.
- Animación de nodos resaltándose por nivel (escala + glow).
- Validación de ciclos en tiempo real.

**Estilo visual:** Dark theme (`#0f172a` fondo), acentos `#4ECDC4`, nodos con colores del CSV, bordes redondeados, sombras suaves, tipografía Inter.

---

## 4. Funcionalidades Requeridas

### 4.1 Importador de Piezas
- Parsear el CSV CutterNest.
- Generar nodos automáticos con:
  - ID, nombre, dimensiones (ancho×alto), color, espesor.
  - Visualización proporcional (escalada al canvas).
  - Etiqueta con nombre y medidas.

### 4.2 Editor de Dependencias (Grafo Interactivo)

#### Modo click-to-connect
- Primer click = seleccionar pieza origen (borde glow cian).
- Segundo click = seleccionar pieza destino → crea flecha `origen → destino`.
- Si crea ciclo: flash rojo en el nodo destino + mensaje de error.

#### Modo drag-and-drop (opcional pero deseable)
- Permitir reordenar nodos en el canvas para organizar el grafo manualmente.
- Las flechas deben recalcular posiciones dinámicamente (SVG paths).

#### Heurísticas automáticas
Al cargar CSV, sugerir dependencias por defecto:
- Laterales son raíces (nivel 0).
- Base y Tapa dependen de laterales.
- Estantes y fondos dependen de la estructura cerrada.
- Puertas/cajones dependen de la estructura completa.

#### Panel lateral
Lista de dependencias con botón **×** para eliminar.

### 4.3 Calculador de Secuencia (Motor Topológico)
- Implementar **Kahn's Algorithm** (BFS topological sort).
- Salida:
  - Número de pasos mínimos.
  - Piezas por nivel (paso).
  - Indicador de paralelismo (si un nivel tiene >1 pieza).
  - Validación: si hay ciclo, mostrar qué nodos forman el ciclo.
- **Visualización de resultado:** Timeline horizontal con cards por paso.

### 4.4 Simulador de Ensamblaje

#### Animación secuencial
- Por cada paso (nivel), resaltar las piezas activas (scale 1.15 + glow cian + border).
- Desvanecer piezas inactivas (opacity 0.3 + grayscale).
- Mostrar tooltip/flotante con instrucción textual del paso.
- Duración configurable por paso (ej: 1.5s).

#### Vista 3D simplificada (nice-to-have)
- Representación isométrica o 2.5D de las piezas ensamblándose.
- Alternativa: mantener 2D pero con "exploded view" que se contrae paso a paso.

### 4.5 Generador de Manuales
Exportar la secuencia calculada a:
- **HTML interactivo:** Página auto-contenida con navegación paso a paso (como Prototipo A).
- **PDF / Imagen:** Captura del grafo + timeline + lista de herramientas.
- **JSON:** Estructura con pasos, piezas, herramientas, tiempos estimados.

#### Formato JSON de salida sugerido
```json
{
  "proyecto": "CutterNest v1",
  "modulo": 1,
  "total_pasos": 5,
  "total_piezas": 6,
  "pasos": [
    {
      "paso": 1,
      "tipo": "preparar",
      "paralelo": true,
      "piezas": ["m1-lateral-izq", "m1-lateral-der"],
      "accion": "Colocar laterales de pie, verificar orientación de cantos",
      "herramientas": ["destornillador", "nivel"],
      "tiempo_estimado_min": 3
    }
  ]
}
```

### 4.6 Herramientas de Ajuste (Drag & Drop)
- **Reordenar piezas en el canvas:** Permitir al usuario arrastrar nodos para organizar el grafo de forma más legible.
- **Reordenar pasos en el timeline:** Si el usuario quiere forzar un orden diferente al calculado, permitir drag & drop en la timeline (con validación de que no rompe dependencias).
- **Snap-to-grid:** Opcional, para alinear nodos limpiamente.
- **Zoom y pan:** En el canvas del grafo (scroll wheel + drag background).

---

## 5. Stack Tecnológico Sugerido

| Capa | Tecnología | Notas |
|------|-----------|-------|
| **Frontend** | HTML5 Canvas / SVG + JS/TS | Vanilla o framework ligero según stack actual de CutterNest |
| **Motor de grafos** | Implementación propia | Kahn's Algorithm en JS/TS (sin dependencias pesadas) |
| **Animaciones** | CSS Transitions + WAAPI | O GSAP si ya está en el proyecto |
| **Drag & Drop** | HTML5 DnD API o interact.js | Para precisión en el canvas |
| **Exportación** | html2canvas / dom-to-image | Capturas; jsPDF para PDFs |
| **Estilos** | CSS Custom Properties | Variables con tema dark ya definido |

---

## 6. Reglas de Negocio / Heurísticas

| Regla | Interpretación |
|-------|----------------|
| **Espesor 3mm** | Pieza de fondo (no estructural, no soporta carga directa). |
| **Cantos en 4 lados** | Generalmente horizontales: base, tapa, estante. |
| **Cantos en 3 lados** | Generalmente verticales: laterales. El lado sin canto va contra el fondo. |
| **rotate = si** | Pieza rotatable en corte, pero en ensamblaje debe respetar orientación final. |
| **Regla de oro** | Estructura antes de divisiones; divisiones antes de frentes/puertas; fondo antes o durante el cierre de caja. |

---

## 7. Entregables Esperados

1. **Componente/Vista principal:** `AssemblyPlanner` (o nombre acorde al proyecto).
2. **Servicio/Utilidad:** `TopologicalSorter.js` con Kahn's algorithm + detección de ciclos.
3. **Componente de Grafo:** `DependencyGraph` (canvas SVG interactivo).
4. **Componente de Simulación:** `AssemblyAnimator` (timeline + resaltado de nodos).
5. **Componente de Manual:** `AssemblyManual` (vista paso a paso exportable).
6. **Tests unitarios:** Al menos para el sorter y el validador de ciclos.
7. **Documentación:** README con cómo agregar nuevas heurísticas de dependencia.

---

## 8. Criterios de Aceptación

- [ ] Al importar el CSV de ejemplo, el sistema sugiere al menos 4 dependencias por defecto.
- [ ] El usuario puede agregar/quitar dependencias con clicks y el grafo se actualiza en <100ms.
- [ ] Al presionar "Calcular", el sistema muestra el número correcto de pasos mínimos (3 para la estantería de ejemplo).
- [ ] La animación recorre todos los niveles sin saltarse piezas.
- [ ] Si el usuario crea un ciclo (A→B→C→A), el sistema lo detecta y muestra alerta antes de calcular.
- [ ] El manual exportado en HTML se puede abrir en un navegador sin conexión y navegar paso a paso.
- [ ] El diseño visual respeta la paleta de colores del CSV y el dark theme de referencia.

---

## 9. Notas Adicionales

- Priorizar **funcionalidad sobre perfección visual** en la primera iteración, pero mantener el dark theme y los colores del CSV desde el inicio.
- Si el proyecto CutterNest ya tiene un sistema de estados/JSON para piezas, integrar con ese modelo en lugar de crear uno paralelo.
- Considerar que en el futuro se podría tener **múltiples módulos** (módulo 1, módulo 2...) ensamblándose en secuencia o paralelo. El diseño debe escalar a eso.
- Los prototipos validados (Manual Paso a Paso y Calculador Visual Topológico) deben usarse como **benchmark de UX** para el módulo final.
