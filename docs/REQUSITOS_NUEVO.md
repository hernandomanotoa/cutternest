# Requisitos del Sistema — CutterNest

> Documento de requisitos y especificación funcional del sistema CutterNest.
> **Versión:** 1.1 · **Última actualización:** agosto 2026 · **Estado:** Vigente

---

## Tabla de contenido

1. [Alcance y objetivo](#1-alcance-y-objetivo)
2. [Definiciones y glosario](#2-definiciones-y-glosario)
3. [Flujos de usuario principales](#3-flujos-de-usuario-principales)
4. [Arquitectura general](#4-arquitectura-general)
5. [Modelos de datos](#5-modelos-de-datos)
6. [API Endpoints](#6-api-endpoints)
7. [Reglas de negocio](#7-reglas-de-negocio)
8. [Seguridad](#8-seguridad)
9. [Interfaz de usuario](#9-interfaz-de-usuario)
10. [Requisitos no funcionales](#10-requisitos-no-funcionales)
11. [Testing](#11-testing)
12. [Despliegue](#12-despliegue)
13. [Criterios de aceptación](#13-criterios-de-aceptación)
14. [Supuestos y restricciones](#14-supuestos-y-restricciones)
15. [Fuentes](#15-fuentes)
16. [Historial de cambios](#16-historial-de-cambios)

---

## 1. Alcance y objetivo

**CutterNest** es una aplicación web autocontenida para talleres de fabricación de muebles que permite:

- Optimizar el corte de tableros (MDF melamina, MDF crudo, aglomerado / SuperPan) en formatos estándar del mercado ecuatoriano.
- Visualizar los layouts de corte en 2D y 3D.
- Cotizar proyectos con precios de material referenciales.
- Gestionar un inventario simple de tableros y sobrantes (offcuts).
- Generar documentación de taller: cotización en PDF, cut list y etiquetas.
- Guiar el ensamblaje de muebles con instrucciones 3D paso a paso.
- Autenticar usuarios principales (TOTP) e invitados (PIN temporal).

**Público objetivo:** talleres de carpintería y diseñadores de muebles en el mercado ecuatoriano. El sistema soporta genéricamente cualquier tipo de mueble y tablero rectangular.

### 1.1 Fuera de alcance (MVP)

- Integración con ERP, facturación electrónica o contabilidad.
- Optimización de cortes con sierra CNC (exportación G-code).
- Multi-sucursal o gestión de bodegas múltiples.
- Aplicación móvil nativa (la web es responsive).

---

## 2. Definiciones y glosario

| Término | Definición |
|---------|------------|
| **Kerf** | Ancho de corte de la hoja de sierra (mm). Se descuenta de cada pieza al calcular el layout. |
| **Sobrante / offcut** | Fragmento de tablero reutilizable que queda tras una optimización. |
| **Layout** | Distribución de piezas sobre un tablero, con coordenadas y porcentaje de utilización. |
| **Cut list** | Lista de cortes ordenada para operario de taller. |
| **Canteado (edge banding)** | Cinta de canto aplicada a los bordes de una pieza. |
| **TOTP** | *Time-based One-Time Password*: segundo factor de autenticación (apps tipo Google Authenticator). |
| **Usuario principal** | Usuario registrado con cuenta completa (roles `admin` o `principal`). |
| **Invitado** | Usuario temporal que accede con PIN, en modo solo lectura. |

Las palabras clave **DEBE**, **DEBERÍA** y **PUEDE** se interpretan según RFC 2119.

---

## 3. Flujos de usuario principales

### 3.1 Autenticación

1. **Registro:** el usuario crea una cuenta (usuario, email, contraseña), recibe un QR para configurar TOTP y 10 códigos de respaldo de un solo uso. La cuenta queda activa solo tras verificar el primer código TOTP.
2. **Login en dos pasos:**
   - Paso 1: usuario + contraseña.
   - Paso 2: código TOTP (6 dígitos) o código de respaldo.
3. **Sesión:** tokens JWT en cookies `httpOnly`; *access token* de 15 minutos, *refresh token* de 7 días con rotación en cada uso.
4. **Invitado:** un usuario principal genera un PIN de 6 dígitos válido por 5 minutos. El invitado accede por un máximo de 4 horas, únicamente en modo lectura, a las optimizaciones y ensamblajes del proyecto compartido.

> **Corrección respecto a v1.0:** el PIN de invitado pasa de 4 a 6 dígitos. Un PIN de 4 dígitos (10 000 combinaciones) con validez de 5 minutos es susceptible de fuerza bruta; con 6 dígitos y rate limiting (§8) el riesgo queda mitigado.

### 3.2 Optimización rápida (sin proyecto)

1. El usuario ingresa al optimizador.
2. Selecciona **material**, **espesor** y **formato de placa** del catálogo ecuatoriano.
3. Agrega piezas manualmente o carga un CSV / plantilla paramétrica.
4. Puede guardar las piezas en un proyecto nuevo o directamente optimizar.
5. El sistema calcula la distribución de piezas sobre tableros.
6. El usuario visualiza el resultado en 2D o 3D y puede cotizar, generar cut list/etiquetas o ir al ensamblaje.

### 3.3 Proyecto completo

1. Crear proyecto (nombre, formato de placa, material y espesor).
2. Agregar piezas manualmente, desde CSV o desde plantilla paramétrica.
3. Optimizar → generar layouts y sobrantes.
4. Cotizar → PDF con desglose de costos.
5. Ensamblar → guía 3D interactiva con pasos y validación.
6. Exportar → cut list PDF y etiquetas.

### 3.4 Inventario

1. Registrar tableros y sobrantes (dimensiones, espesor, estado).
2. Marcar el consumo de un ítem.
3. Al optimizar con `use_offcuts=true`, el sistema prioriza los sobrantes de inventario cuyas dos dimensiones superan el umbral configurado (§7.2).

---

## 4. Arquitectura general

### 4.1 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Python 3.11, FastAPI, Uvicorn, SQLAlchemy, SQLite (MVP) |
| Optimización | `rectpack` (GuillotineBssfSasf / MaxRects) |
| PDF / SVG | ReportLab, cairosvg |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| 3D | `@react-three/fiber`, `@react-three/drei`, Three.js |
| Estado | Zustand (auth), React hooks |
| Autenticación | pyotp, qrcode, PyJWT, bcrypt, Fernet (cryptography) |
| Rate limiting | slowapi |
| Contenedores | Docker + nginx |

> **Nota:** todas las dependencias DEBEN estar fijadas con versión exacta (`requirements.txt` / `pnpm-lock.yaml`) para garantizar builds reproducibles y ejecución offline (§13, criterio 8).

### 4.2 Estructura de directorios relevante

```
backend/app/
  main.py              # Punto de entrada FastAPI
  auth.py              # Lógica de autenticación
  security.py          # JWT, bcrypt, Fernet, QR
  dependencies.py      # Dependencias de seguridad
  config.py            # Configuración por entorno
  database.py          # SQLAlchemy + SQLite
  models.py            # Modelos de datos
  schemas.py           # Pydantic request/response
  optimizer.py         # Algoritmo de nesting
  inventory.py         # Inventario y sobrantes
  projects.py          # Proyectos, layouts, PDFs
  quotes.py            # Cálculo de cotización
  assembly.py          # Motor de ensamblaje 3D
  templates.py         # Plantillas paramétricas
  catalog.py           # Catálogo de materiales, formatos y colores
  svg_generator.py     # SVG/PNG de layouts
  pdf_generator.py     # PDFs de cotización/cut list/etiquetas
  routers/             # Endpoints agrupados

frontend/src/
  components/
    auth/              # Login, registro, verificación
    optimizer/         # Optimizador y visualización
    projects/          # CRUD de proyectos
    cotizacion/        # Cotización
    taller/            # Inventario
    mueble/            # Ensamblaje 3D
  utils/               # CSV, conteo, plantillas, catálogo
  types/               # Tipos TypeScript
```

---

## 5. Modelos de datos

### 5.1 Usuarios y sesiones

| Entidad | Campos clave |
|---------|--------------|
| `User` | id, username, email, password_hash, totp_secret_encrypted, role (`admin` \| `principal` \| `guest`), is_active |
| `BackupCode` | id, user_id, code_hash, used_at |
| `Session` | id, user_id, refresh_token_hash, ip, user_agent, created_at, expires_at, revoked_at |
| `GuestSession` | id, pin_hash, project_id, created_by, created_at, used_at, expires_at, revoked_at |

> **Corrección respecto a v1.0:** `GuestSession.pin` se renombra a `pin_hash` (el PIN nunca se almacena en texto plano) y se añade `project_id` para delimitar el alcance de acceso del invitado (§7.1).

### 5.2 Proyectos y piezas

| Entidad | Campos clave |
|---------|--------------|
| `Project` | id, name, description, owner_id, board_width_mm, board_height_mm, board_thickness_mm, kerf_mm, margin_mm, material_type, use_offcuts |
| `Piece` | id, project_id, external_id, name, width_mm, height_mm, quantity, rotate (bool), color, thickness_mm, edge_banding |
| `Layout` | id, project_id, board_index, board_width_mm, board_height_mm, utilization, svg_path, png_path, placements (JSON) |

### 5.3 Inventario y cotización

| Entidad | Campos clave |
|---------|--------------|
| `Inventory` | id, tipo (`tablero` \| `sobrante`), espesor_mm, ancho_mm, alto_mm, cantidad, estado (`disponible` \| `consumido`), proyecto_origen, area_m2, consumed_at |
| `Quote` | id, project_id, hardware (JSON), material_cost, hardware_cost, labor_cost, subtotal, margin, total, pdf_path, created_at |

### 5.4 Ensamblaje

| Entidad | Campos clave |
|---------|--------------|
| `AssemblyModule` | id, project_id, code, category, name, position, dimensions, order_index |
| `AssemblyPiece` | id, project_id, module_id, piece_id, code, category, piece_type, expected/current position/rotation, tolerances, status, dependencies |
| `AssemblyConnector` | id, project_id, code, connector_type, position, direction, piece_codes, step_id |
| `AssemblyStep` | id, project_id, step_number, code, title, description, module_id, piece_codes, connector_ids, tool_ids, dependencies, camera, animation, status |
| `AssemblyState` | id, project_id, current_step_id, completed_step_ids, started_at, updated_at |

---

## 6. API Endpoints

Prefijo base: `/api/v1`. Todas las rutas, salvo `/health` y las de autenticación, requieren sesión válida. Las rutas marcadas con 🔒 requieren rol `admin` o `principal`.

### 6.1 Salud y catálogo

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| GET | `/catalog` | Materiales, formatos de placa y colores |

### 6.2 Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro con TOTP |
| POST | `/auth/login` | Paso 1 de login |
| POST | `/auth/verify` | Verificación TOTP / código de respaldo |
| POST | `/auth/refresh` | Rotación de refresh token |
| POST | `/auth/logout` | Cerrar sesión (revoca refresh) |
| POST | `/auth/guest/pin` 🔒 | Generar PIN de invitado |
| POST | `/auth/guest/login` | Login con PIN |
| GET | `/auth/users/me` | Perfil actual |
| GET | `/auth/session` | Información de sesión |

### 6.3 Optimización directa

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/optimize` 🔒 | Optimizar sin persistir proyecto |

### 6.4 Inventario

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory` 🔒 | Listar inventario |
| GET | `/inventory/offcuts` 🔒 | Listar sobrantes disponibles |
| POST | `/inventory` 🔒 | Crear ítem |
| PATCH | `/inventory/{id}/consume` 🔒 | Marcar consumo |

### 6.5 Proyectos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/projects` | Listar proyectos del usuario |
| POST | `/projects` 🔒 | Crear proyecto |
| GET | `/projects/{id}` | Detalle |
| DELETE | `/projects/{id}` 🔒 | Eliminar |
| POST | `/projects/{id}/pieces` 🔒 | Guardar/reemplazar piezas |
| POST | `/projects/{id}/optimize` 🔒 | Optimizar y guardar layouts |
| GET | `/projects/{id}/layouts` | Layouts generados |
| POST | `/projects/{id}/quote` 🔒 | Generar cotización |
| POST | `/projects/{id}/cutlist` 🔒 | PDF cut list |
| POST | `/projects/{id}/labels` 🔒 | PDF etiquetas |
| GET | `/projects/{id}/assembly` | Ensamblaje generado |
| POST | `/projects/{id}/assembly/generate` 🔒 | Regenerar ensamblaje |
| POST | `/projects/{id}/assembly/steps/{step_id}/validate` | Validar paso |
| POST | `/projects/{id}/assembly/steps/{step_id}/progress` | Actualizar progreso |

> Las rutas sin 🔒 son accesibles también por invitados, siempre que el `project_id` coincida con el de su `GuestSession`.

### 6.6 Plantillas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/templates` | Listar plantillas |
| POST | `/templates/{id}/generate` 🔒 | Generar piezas desde plantilla |

### 6.7 Respuestas de error

Toda la API DEBE responder errores con formato uniforme:

```json
{ "detail": "mensaje legible", "code": "PIECE_TOO_LARGE", "status": 422 }
```

Códigos HTTP: `400` validación de negocio · `401` no autenticado · `403` sin permiso · `404` no encontrado · `422` payload inválido · `429` rate limit · `500` error interno.

---

## 7. Reglas de negocio

### 7.1 Autenticación y autorización

- El primer usuario registrado obtiene rol `admin`; los siguientes, rol `principal`.
- Solo usuarios principales (`admin` o `principal`) pueden crear, editar o eliminar proyectos, inventario y cotizaciones.
- Los invitados (`guest`) solo pueden **ver** las optimizaciones y ensamblajes del proyecto asociado a su `GuestSession`.
- Cada proyecto pertenece a un `owner_id`; el middleware `require_project_owner` impide accesos cruzados entre usuarios.

> **Corrección respecto a v1.0:** se unifica la nomenclatura de roles (antes aparecía `principal` como único rol con permisos, ignorando `admin`).

### 7.2 Optimización

- Las piezas pueden rotar 90° salvo que `rotate=false`.
- El corte se modela con `kerf_mm` y `margin_mm` configurables por proyecto (por defecto: kerf 3 mm, margen 5 mm).
- Si `use_offcuts=true`, se priorizan sobrantes con **ambas** dimensiones ≥ `OFFCUT_THRESHOLD_CM` (30 cm por defecto, configurable por variable de entorno).
- Una pieza que exceda las dimensiones útiles del tablero DEBE rechazarse con error `PIECE_TOO_LARGE` indicando la pieza.
- La salida incluye tableros con porcentaje de utilización y coordenadas (x, y, rotación) de cada pieza.

### 7.3 Clasificación y codificación de piezas

- El sistema infiere el tipo de pieza por palabras clave en el nombre: base, tapa, lateral, estante, repisa, fondo, puerta, zapatero, zócalo, cajón, pata, división.
- Si no hay coincidencia, se usa la proporción de dimensiones como *fallback*.
- El código canónico generado es `[CAT]-[MOD]-[TIPO]-[SEQ]`, por ejemplo `GLOBAL-M01-BAS-I`.
- Si no se indica módulo, se asigna `M01`.

### 7.4 Ensamblaje

- Se genera automáticamente a partir de las piezas del proyecto.
- Las piezas se agrupan en módulos y se generan pasos en este orden: canteado, base, laterales, estantes, tapa, fondo, puertas/acabados y piezas restantes.
- Cada pieza tiene posición y rotación esperadas, con tolerancias por defecto de 2 mm y 5°.
- El usuario puede validar pasos y actualizar el progreso; el estado persiste en `AssemblyState`.

### 7.5 Cotización

- **Material:** área total de tableros usados × costo por m² × 1.15 (merma).
- Si no se envía `costo_m2_mdf`, se consulta el catálogo según material y espesor del proyecto.
- **Hardware:** suma de `cantidad × precio_unit`.
- **Mano de obra:** (`total_cortes` × 2 min + 30 min de setup) × costo hora.
- **Total:** subtotal × margen (por defecto 1.3).
- Todos los montos se calculan en USD con redondeo a 2 decimales.

### 7.6 Catálogo de materiales

**Formatos de placa disponibles (cm):**

| Nombre | Dimensiones (ancho × alto) |
|--------|----------------------------|
| Estándar Ecuador | 183 × 244 |
| Extendido Provemadera | 185 × 275 |
| Madecentro Artiko | 215 × 244 |
| Moldyport SuperPan | 285 × 210 |
| Moldyport SuperPan XL | 366 × 210 |
| Europeo | 244 × 122 |

**Materiales y espesores (mm):**

| Material | Espesores disponibles |
|----------|------------------------|
| MDF Crudo | 3, 6, 9, 12, 15, 18, 25, 31, 37 |
| MDF Melamina | 6, 9, 12, 15, 18, 22, 25, 30 |
| Aglomerado / SuperPan | 3, 10, 16, 18, 22, 25, 30 |

Los precios son referenciales, en USD/m², y se almacenan en `backend/app/catalog.py`. DEBEN poder actualizarse sin cambios de código (variable de entorno o archivo de configuración).

### 7.7 Colores de melamina

El catálogo incluye colores sólidos, texturas madera y acabados especiales/premium: Blanco, Negro, Gris, Nogal, Roble, Cedro, Caoba, Mármol Carrara, Cemento, High Gloss, Antihuella, entre otros.

---

## 8. Seguridad

- Variables secretas (`JWT_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`) solo en `.env`; longitud mínima de 32 caracteres. El arranque DEBE fallar si faltan o son débiles.
- No se versionan archivos `.env`, credenciales ni URLs internas (`.gitignore` + escaneo en CI).
- Cookies `httpOnly`; flags `Secure` y `SameSite=Lax/Strict` configurables según entorno.
- Rate limiting con `slowapi` en endpoints sensibles (`/auth/*`, `/optimize`): por defecto 5 req/min en login y verificación.
- El secreto TOTP se almacena cifrado con Fernet.
- Códigos de respaldo hasheados con bcrypt y de un solo uso.
- PIN de invitado de 6 dígitos generado con `secrets.randbelow(1_000_000)`, almacenado hasheado, expira en 5 min y no se transmite por canales externos.
- Validación con Pydantic en **todos** los inputs de API; límites de tamaño en payloads y archivos CSV (máx. 1 MB / 5 000 piezas).
- Contraseñas: mínimo 10 caracteres; hasheadas con bcrypt (coste ≥ 12).
- Cabeceras de seguridad en nginx: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`.

---

## 9. Interfaz de usuario

### 9.1 Rutas principales

| Ruta | Página | Acceso |
|------|--------|--------|
| `/login` | Login | Pública |
| `/register` | Registro | Pública |
| `/verify` | Verificación TOTP | Pública |
| `/guest` | Login invitado | Pública |
| `/` | Dashboard | Principal / Invitado |
| `/optimizer` | Optimizador | Principal |
| `/projects` | Proyectos | Principal / Invitado (solo lectura) |
| `/inventory` | Inventario | Principal |
| `/quote/:projectId` | Cotización | Principal |
| `/assembly/:projectId` | Ensamblaje 3D | Principal / Invitado |

> **Corrección respecto a v1.0:** el invitado ya no accede a `/optimizer` (que permite escribir sin persistir); el modo invitado queda estrictamente en solo lectura, coherente con §7.1.

### 9.2 Componentes clave

- **OptimizerPage:** formulario de piezas, selectores de material/formato/espesor, paleta de colores, carga CSV, optimización y resultados 2D/3D.
- **ProjectsPage:** listado, creación y plantillas paramétricas.
- **QuotePage:** hardware, costo m² editable con precio sugerido del catálogo, desglose y PDF.
- **InventoryPage:** alta y consumo de tableros/sobrantes.
- **AssemblyPage:** pasos, visualización 3D, validación y corrección de posición.

---

## 10. Requisitos no funcionales

| ID | Requisito | Meta |
|----|-----------|------|
| RNF-1 | Tiempo de optimización | ≤ 5 s para 200 piezas en hardware de escritorio estándar |
| RNF-2 | Disponibilidad offline | El sistema DEBE funcionar sin conexión tras el build inicial |
| RNF-3 | Persistencia | Ningún proyecto/cotización se pierde al reiniciar contenedores (volúmenes Docker) |
| RNF-4 | Navegadores | Chrome, Firefox y Edge (2 últimas versiones); viewport mínimo 1280 px (responsive básico en móvil) |
| RNF-5 | Idioma | Interfaz y documentos generados en español (es-EC) |
| RNF-6 | Capacidad | Hasta 50 usuarios concurrentes en MVP monolítico |

---

## 11. Testing

| Capa | Framework | Comando |
|------|-----------|---------|
| Backend | pytest | `cd backend && pytest` |
| Frontend | Vitest + jsdom | `cd frontend && pnpm test` |

- Los tests se ejecutan también dentro de los builds Docker del backend y frontend.
- Cobertura mínima exigida: 70 % en lógica de optimización, cotización y autenticación.

---

## 12. Despliegue

### 12.1 MVP (`docker-compose.yml`)

- Backend FastAPI + SQLite (volumen persistente).
- Frontend nginx en puerto 3000.
- Red interna `cutternest-network`.

### 12.2 Fase 2 (`docker-compose.fase2.yml`)

- PostgreSQL 15 + Redis 7.
- Backups automáticos diarios.

### 12.3 Fase 3 (pendiente de definición)

> Espacio reservado. La numeración de fases salta de 2 a 4 en el documento original; la Fase 3 DEBE definirse antes de planificar la Fase 4.

### 12.4 Fase 4 (`docker-compose.fase4.yml`)

- Gateway de WhatsApp (Baileys).
- Notificaciones opcionales.

### 12.5 Comandos

```bash
# MVP
docker compose up --build

# Fase 2
docker compose -f docker-compose.yml -f docker-compose.fase2.yml up --build

# Fase 4
docker compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up --build
```

---

## 13. Criterios de aceptación

1. Un usuario puede registrarse, configurar TOTP e iniciar sesión con segundo factor.
2. Puede crear un proyecto seleccionando material, espesor y formato de placa del catálogo.
3. Puede agregar piezas manualmente o cargar un CSV; el sistema genera códigos y módulos automáticamente.
4. El optimizador produce layouts 2D/3D con alto porcentaje de utilización (objetivo ≥ 80 % en casos típicos).
5. La cotización calcula costos con precios del catálogo y permite ajustar hardware y margen.
6. El ensamblaje genera pasos 3D para cualquier conjunto de piezas, incluidas piezas genéricas.
7. Los tests de backend y frontend pasan y los builds Docker son exitosos.
8. El sistema corre completamente offline después del build inicial.
9. Un invitado con PIN válido solo puede ver (no modificar) el proyecto compartido, y pierde acceso al expirar la sesión.

---

## 14. Supuestos y restricciones

- Los precios del catálogo son referenciales; el usuario puede sobrescribirlos en cada cotización.
- El kerf y margen son constantes por proyecto (no por pieza).
- SQLite es suficiente para el MVP; la migración a PostgreSQL (Fase 2) no debe requerir cambios en la lógica de negocio (SQLAlchemy como capa de abstracción).
- Las dimensiones se manejan en cm (piezas/tableros) y mm (espesores, kerf, tolerancias); la conversión es responsabilidad del backend.

---

## 15. Fuentes

- `AGENTS.md` — guía de agentes y convenciones del proyecto.
- `README.md` — contexto general para humanos.
- `docs/GUIA-MELAMINICOS-ECUADOR.md` — catálogo de materiales, formatos y colores.
- Código fuente en `backend/app` y `frontend/src`.

---

## 16. Historial de cambios

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-08 | Documento inicial. |
| 1.1 | 2026-08 | PIN de invitado de 4 → 6 dígitos y almacenado hasheado; `GuestSession` con `project_id` y alcance de solo lectura; unificación de roles (`admin`/`principal`); corrección de `GuillotineBssfSas` → `GuillotineBssfSasf` y del campo `rotar` → `rotate`; sección de Fase 3 marcada como pendiente; nuevas secciones: glosario, errores de API, requisitos no funcionales, supuestos e historial de cambios; criterios de aceptación ampliados; reglas de seguridad reforzadas (longitud de contraseña, cabeceras, límites de payload). |
