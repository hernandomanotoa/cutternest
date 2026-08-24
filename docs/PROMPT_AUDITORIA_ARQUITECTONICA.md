# AUDITORÍA ARQUITECTÓNICA DEL SISTEMA AGENTIC EXISTENTE

## OBJETIVO

Auditar profundamente la arquitectura agentic existente en este proyecto.

**RESTRICCIONES DE ESTA FASE:**
- NO modificar código.
- NO instalar dependencias.
- NO eliminar archivos.
- NO cambiar configuraciones.
- NO refactorizar todavía.
- NO asumir que una tecnología debe reemplazarse.
- Primero comprender completamente lo que existe.
- Si algo no está claro, investigarlo en el propio repositorio antes de concluir.
- Priorizar reutilizar lo existente antes de proponer nuevas implementaciones.

## OBJETIVOS ESPECÍFICOS

1. Qué capacidades agentic ya tenemos.
2. Qué capacidades están duplicadas.
3. Qué capacidades están incompletas.
4. Qué problemas pueden generar loops.
5. Qué puede provocar consumo innecesario de tokens.
6. Qué información puede perderse entre agentes.
7. Cómo se comparte el contexto.
8. Cómo se comparten los resultados entre agentes.
9. Cómo están utilizando Skills.
10. Cómo está utilizando MCP.
11. Cómo se controlan herramientas y permisos.
12. Cómo se controla la ejecución.
13. Cómo se recuperan errores.
14. Cómo se pueden introducir checkpoints.
15. Cómo se puede introducir presupuesto de tokens.
16. Cómo se puede introducir observabilidad.
17. Qué debería permanecer en Kimi Code.
18. Qué debería controlar una capa externa de runtime/orquestación.
19. Qué mejoras podemos hacer SIN reconstruir innecesariamente lo que Kimi ya proporciona.

---

# FASE 1 — DESCUBRIMIENTO

Antes de emitir recomendaciones, analizar el repositorio completo.

Identificar explícitamente:

- estructura del proyecto
- agentes existentes
- subagentes
- Skills
- MCP
- configuración de Kimi
- AGENTS.md
- prompts
- workflows
- scripts
- herramientas
- servicios
- APIs
- almacenamiento de estado
- memoria
- persistencia
- logs
- manejo de errores
- mecanismos de retry
- tests
- documentación arquitectónica

Buscar especialmente archivos y configuraciones relacionados con:

- agents
- subagents
- skills
- MCP
- prompts
- workflows
- orchestration
- swarm
- goal
- plan
- context
- memory
- state
- checkpoint
- retry
- loop
- token
- budget
- tool
- permissions
- tracing
- logging
- evaluation

NO limitarse a buscar nombres obvios.
Analizar también cómo se conectan realmente los componentes.

---

# FASE 2 — MAPA REAL DE LA ARQUITECTURA

Generar un mapa de arquitectura basado ÚNICAMENTE en lo que realmente existe.

Representar:

```
USER
 ↓
ENTRYPOINT
 ↓
ORCHESTRATOR
 ↓
AGENTS
 ↓
SKILLS
 ↓
MCP
 ↓
TOOLS
 ↓
KNOWLEDGE
 ↓
FILES / DATABASE / EXTERNAL SERVICES
```

Y mostrar también:

- dónde está el estado
- dónde está el contexto
- dónde están los artefactos
- dónde están los prompts
- dónde están los resultados
- dónde se almacenan los errores
- dónde se registran las ejecuciones

Para cada componente indicar:

```
COMPONENTE
UBICACIÓN
RESPONSABILIDAD
ENTRADAS
SALIDAS
DEPENDENCIAS
RIESGOS
```

No inventar componentes que no existan.

---

# FASE 3 — MAPA DE AGENTES

Para cada agente existente generar una ficha:

```
AGENT_ID:
NOMBRE:
RESPONSABILIDAD:
MODELO:
PROMPT:
SKILLS:
MCP:
TOOLS:
INPUT:
OUTPUT:
ESTADO:
MEMORIA:
PERMISOS:
PUEDE_CREAR_SUBAGENTES:
PUEDE_MODIFICAR_ARCHIVOS:
PUEDE_EJECUTAR_COMANDOS:
PUEDE_LLAMAR_MCP:
RIESGO:
OBSERVABILIDAD:
```

Determinar también:

- qué agentes hacen funciones similares
- cuáles deberían fusionarse
- cuáles deberían separarse
- cuáles tienen demasiadas responsabilidades
- cuáles tienen demasiados permisos
- cuáles tienen acceso innecesario a herramientas

---

# FASE 4 — ANÁLISIS DE GOAL / PLAN / SWARM

Determinar si el proyecto utiliza actualmente:

- Goal
- Plan
- Swarm
- agentes individuales
- subagentes
- workflows secuenciales
- workflows paralelos

Para cada mecanismo determinar:

1. quién lo inicia
2. quién lo controla
3. cuándo termina
4. cómo sabe que terminó
5. qué pasa si falla
6. qué pasa si se repite
7. qué información se transmite
8. cuánto contexto recibe
9. qué herramientas puede utilizar
10. si existe límite de profundidad
11. si existe límite de iteraciones
12. si existe límite de llamadas a herramientas
13. si existe límite de tokens
14. si existe límite de tiempo

---

# FASE 5 — DETECCIÓN DE LOOPS

Analizar específicamente posibles loops.

Buscar:

**A) loops de agentes**
A → B → A

**B) loops de herramientas**
tool → error → retry → tool

**C) loops de planificación**
plan → execute → replan → execute

**D) loops semánticos**
el agente continúa produciendo trabajo sin generar progreso real.

**E) loops de delegación**
agent → subagent → subagent → subagent

**F) loops de recuperación**
failure → retry → failure → retry

Para cada posible loop:

- ubicación
- causa
- probabilidad
- impacto
- mecanismo actual de prevención
- recomendación

Proponer límites:

```
max_iterations
max_agent_depth
max_handoffs
max_tool_calls
max_retries
max_execution_time
```

PERO no implementarlos todavía.

---

# FASE 6 — ANÁLISIS DE CONTEXTO Y TOKENS

Este es uno de los puntos más importantes.

Determinar cómo se construye actualmente el contexto.

Identificar si estamos haciendo:

```
HISTORIAL COMPLETO → AGENTE
```

o:

```
TASK
+
STATE
+
RELEVANT CONTEXT
+
ARTIFACTS
→ AGENTE
```

Analizar:

- repetición de información
- prompts excesivamente largos
- documentos completos enviados innecesariamente
- resultados de herramientas repetidos
- contexto duplicado entre agentes
- información que debería convertirse en artefactos
- información que debería almacenarse como estado
- información que debería estar en Knowledge/MCP
- información que debería recuperarse dinámicamente

Estimar dónde está ocurriendo el mayor desperdicio de tokens.

Clasificar cada información como:

1. SYSTEM
2. PROJECT
3. TASK
4. STATE
5. KNOWLEDGE
6. ARTIFACT
7. TRANSIENT CONTEXT

Recomendar qué debe permanecer dentro del contexto del LLM y qué debe permanecer fuera.

---

# FASE 7 — ANÁLISIS DE SKILLS

Auditar todas las Skills.

Para cada Skill:

- propósito
- tamaño
- instrucciones
- dependencias
- MCP utilizados
- agentes que la utilizan
- duplicaciones
- información redundante
- instrucciones contradictorias
- información que debería convertirse en conocimiento persistente
- información que debería eliminarse del prompt

Determinar si las Skills están funcionando como:

"cómo hacer algo"

o si están siendo utilizadas incorrectamente como:

"almacenamiento de conocimiento".

---

# FASE 8 — ANÁLISIS DE MCP

Auditar todos los MCP.

Para cada MCP:

```
NOMBRE
FUNCIÓN
TOOLS
RESOURCES
PROMPTS
AGENTES QUE LO UTILIZAN
PERMISOS
DATOS QUE EXPONE
RIESGO
COSTO DE CONTEXTO
FRECUENCIA DE USO
```

Determinar:

- MCP redundantes
- herramientas duplicadas
- herramientas demasiado amplias
- herramientas que deberían dividirse
- herramientas que exponen demasiado contexto
- herramientas que deberían tener permisos de solo lectura
- herramientas que requieren aprobación
- herramientas que pueden generar loops

Evaluar si sería conveniente introducir un:

**MCP ROUTER**

que entregue únicamente las capacidades necesarias para cada tarea/agente.

---

# FASE 9 — KNOWLEDGE ARCHITECTURE

Determinar dónde está actualmente el conocimiento del proyecto.

Clasificar:

- documentación
- código
- configuraciones
- reglas
- decisiones arquitectónicas
- estándares
- ejemplos
- datos
- resultados históricos

Determinar qué debería estar en:

- AGENTS.md
- Skills
- MCP Resources
- RAG
- Knowledge Graph
- archivos
- base de datos
- artifacts
- estado de ejecución

Evitar duplicar conocimiento.

---

# FASE 10 — ESTADO Y ARTIFACTS

Determinar si los agentes se comunican mediante:

**A) texto/contexto**

o

**B) estado/artifacts/referencias.**

Identificar qué información debería convertirse en artifacts.

Ejemplos:

- requirements.json
- architecture.md
- research.json
- decision-log.json
- test-report.json
- implementation-plan.md

El objetivo es evitar pasar grandes cantidades de información entre agentes mediante tokens.

---

# FASE 11 — CONTROL DE EJECUCIÓN

Determinar si existe:

- checkpoint
- retry
- timeout
- cancellation
- rollback
- recovery
- circuit breaker
- human approval
- resumable execution

Para cada uno:

```
EXISTE:
DÓNDE:
CÓMO FUNCIONA:
LIMITACIONES:
```

---

# FASE 12 — OBSERVABILIDAD

Determinar si actualmente podemos saber:

- qué prompt se ejecutó
- versión del prompt
- qué agente lo ejecutó
- modelo utilizado
- tokens de entrada
- tokens de salida
- herramientas utilizadas
- número de llamadas
- duración
- errores
- retries
- handoffs
- costo estimado
- resultado
- checkpoint
- versión de Skill
- versión de MCP

Si algo falta, indicarlo.

---

# FASE 13 — SEGURIDAD

Analizar:

- permisos por agente
- permisos por herramienta
- acceso a filesystem
- ejecución de shell
- acceso a internet
- acceso a bases de datos
- acceso a MCP
- modificación de archivos
- acciones irreversibles

Clasificar herramientas:

- R0 = lectura
- R1 = análisis
- R2 = generación
- R3 = modificación
- R4 = ejecución externa
- R5 = acción irreversible

Recomendar qué acciones deberían requerir aprobación humana.

---

# FASE 14 — ARQUITECTURA OBJETIVO

Después de entender completamente lo existente, proponer una arquitectura mejorada.

**IMPORTANTE:**

NO reemplazar Kimi Code.
Aprovechar las capacidades existentes de:

- Goal
- Swarm
- Plan
- Agents
- Subagents
- Skills
- MCP

La capa que se proponga debe complementar Kimi Code.

Evaluar específicamente estos componentes:

- AI Gateway
- Task Router
- Agent Registry
- Prompt Registry
- Knowledge Router
- MCP Router
- Context Manager
- Token Budget Manager
- Loop Controller
- Checkpoint Manager
- Artifact Store
- Validation Engine
- Observability
- Evaluation Engine

Para cada componente indicar:

```
¿YA EXISTE?
¿PARCIAL?
¿FALTA?
¿KIMI LO RESUELVE?
¿DEBEMOS IMPLEMENTARLO?
¿DEBEMOS CONFIGURARLO?
¿DEBEMOS DELEGARLO A KIMI?
```

---

# FASE 15 — MATRIZ DE DECISIÓN

Generar una tabla:

| Capacidad | Existe | Kimi lo resuelve | Falta | Prioridad | Acción |
|---|---|---|---|---|---|

Utilizar prioridades:

- P0 = crítico
- P1 = importante
- P2 = mejora
- P3 = opcional

---

# FASE 16 — NO MODIFICAR TODAVÍA

Al finalizar NO cambiar nada.

Entregar:

1. Resumen ejecutivo.
2. Arquitectura actual.
3. Arquitectura propuesta.
4. Mapa de agentes.
5. Mapa de Skills.
6. Mapa MCP.
7. Análisis Goal.
8. Análisis Swarm.
9. Análisis Plan.
10. Análisis de loops.
11. Análisis de tokens.
12. Análisis de contexto.
13. Análisis de estado.
14. Análisis de artifacts.
15. Análisis de seguridad.
16. Análisis de observabilidad.
17. Matriz de gaps.
18. Riesgos.
19. Recomendaciones.
20. Plan de implementación por fases.

**MUY IMPORTANTE:**

No quiero una lista genérica de buenas prácticas.

Quiero que cada recomendación esté vinculada a algo REAL encontrado en este repositorio.

Para cada recomendación utilizar:

```
PROBLEMA
EVIDENCIA
IMPACTO
SOLUCIÓN
BENEFICIO
COMPLEJIDAD
PRIORIDAD
```

Finalmente responder:

"¿Qué deberíamos cambiar primero para obtener el mayor beneficio con el menor esfuerzo?"

y proporcionar los 10 cambios de mayor ROI.

FIN DE AUDITORÍA.
