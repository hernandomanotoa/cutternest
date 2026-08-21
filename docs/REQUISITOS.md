# Requisitos del Sistema — CutterNest

> Documento de requisitos y especificación funcional del sistema CutterNest.  
> Última actualización: agosto 2026.

---

## 1. Alcance y objetivo

**CutterNest** es una aplicación web autocontenida para la fabricación de muebles que permite:

- Optimizar el corte de tableros (MDF melamina, MDF crudo, aglomerado / SuperPan) en formatos estándar del Ecuador.
- Visualizar los layouts de corte en 2D y 3D.
- Cotizar proyectos con precios de material referenciales.
- Gestionar un inventario simple de tableros y sobrantes.
- Generar documentación de taller: cotización PDF, cut list y etiquetas.
- Guiar el ensamblaje de muebles con instrucciones 3D paso a paso.
- Autenticar usuarios principales (TOTP) e invitados (PIN temporal).

El sistema está pensado para talleres de carpintería y diseñadores de muebles en el mercado ecuatoriano, aunque soporta genéricamente cualquier tipo de mueble.

---

## 2. Flujos de usuario principales

### 2.1 Autenticación

1. **Registro:** el usuario crea una cuenta, recibe un QR TOTP y 10 códigos de respaldo.
2. **Login en 2 pasos:**
   - Paso 1: usuario + contraseña.
   - Paso 2: código TOTP o código de respaldo.
3. **Sesión:** tokens JWT en cookies `httpOnly`; access 15 min, refresh 7 días.
4. **Invitado:** usuario principal genera un PIN de 4 dígitos válido por 5 min; el invitado accede por 4 h solo a visualizar optimizaciones/ensamblajes.

### 2.2 Optimización rápida

1. El usuario ingresa al optimizador.
2. Selecciona **material**, **espesor** y **formato de placa** del catálogo ecuatoriano.
3. Agrega piezas manualmente o carga un CSV / plantilla.
4. Puede guardar las piezas en un proyecto o directamente optimizar.
5. El sistema calcula la mejor distribución de piezas sobre tableros.
6. El usuario visualiza el resultado en 2D o 3D y puede cotizar, generar cut list/etiquetas o ir al ensamblaje.

### 2.3 Proyecto completo

1. Crear proyecto (nombre, formato de placa, material y espesor).
2. Agregar piezas manualmente, desde CSV o desde plantilla paramétrica.
3. Optimizar → generar layouts y sobrantes.
4. Cotizar → PDF con desglose de costos.
5. Ensamblar → guía 3D interactiva con pasos y validación.
6. Exportar → cut list PDF y etiquetas.

### 2.4 Inventario

1. Registrar tableros y sobrantes (dimensiones, espesor, estado).
2. Marcar consumo de un ítem.
3. Al optimizar con `usar_sobrantes`, el sistema prioriza piezas de inventario mayores al umbral.

---

## 3. Arquitectura general

### 3.1 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Python 3.11, FastAPI, Uvicorn, SQLAlchemy, SQLite (MVP) |
| Optimización | `rectpack` (GuillotineBssfSas / MaxRects) |
| PDF/SVG | ReportLab, cairosvg |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| 3D | `@react-three/fiber`, `@react-three/drei`, Three.js |
| Estado | Zustand (auth), React hooks |
| Auth | pyotp, qrcode, JWT, bcrypt, Fernet |
| Container | Docker + nginx |

### 3.2 Estructura de directorios relevante

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

## 4. Modelos de datos

### 4.1 Usuarios y sesiones

| Entidad | Campos clave |
|---------|--------------|
| `User` | id, username, email, password_hash, totp_secret_encrypted, role, is_active |
| `BackupCode` | id, user_id, code_hash, used_at |
| `Session` | id, user_id, refresh_token_hash, ip, user_agent, created_at, expires_at, revoked_at |
| `GuestSession` | id, pin, created_by, created_at, used_at, expires_at, revoked_at |

### 4.2 Proyectos y piezas

| Entidad | Campos clave |
|---------|--------------|
| `Project` | id, name, description, owner_id, board_width_mm, board_height_mm, board_thickness_mm, kerf_mm, margin_mm, material_type, use_offcuts |
| `Piece` | id, project_id, external_id, name, width_mm, height_mm, quantity, rotate, color, thickness_mm, edge_banding |
| `Layout` | id, project_id, board_index, board_width_mm, board_height_mm, utilization, svg_path, png_path, placements (JSON) |

### 4.3 Inventario y cotización

| Entidad | Campos clave |
|---------|--------------|
| `Inventory` | id, tipo, espesor_mm, ancho_mm, alto_mm, cantidad, estado, proyecto_origen, area_m2, consumed_at |
| `Quote` | id, project_id, hardware (JSON), material_cost, hardware_cost, labor_cost, total, margin, pdf_path |

### 4.4 Ensamblaje

| Entidad | Campos clave |
|---------|--------------|
| `AssemblyModule` | id, project_id, code, category, name, position, dimensions, order_index |
| `AssemblyPiece` | id, project_id, module_id, piece_id, code, category, piece_type, expected/current position/rotation, tolerances, status, dependencies |
| `AssemblyConnector` | id, project_id, code, connector_type, position, direction, piece_codes, step_id |
| `AssemblyStep` | id, project_id, step_number, code, title, description, module_id, piece_codes, connector_ids, tool_ids, dependencies, camera, animation, status |
| `AssemblyState` | id, project_id, current_step_id, completed_step_ids, started_at, updated_at |

---

## 5. API Endpoints

Prefijo base: `/api/v1`

### 5.1 Salud y catálogo

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| GET | `/catalog` | Materiales, formatos de placa y colores |

### 5.2 Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro con TOTP |
| POST | `/auth/login` | Paso 1 de login |
| POST | `/auth/verify` | Verificación TOTP/backup |
| POST | `/auth/refresh` | Refresh token |
| POST | `/auth/logout` | Cerrar sesión |
| POST | `/auth/guest/pin` | Generar PIN de invitado |
| POST | `/auth/guest/login` | Login con PIN |
| GET | `/auth/users/me` | Perfil actual |
| GET | `/auth/session` | Información de sesión |

### 5.3 Optimización directa

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/optimize` | Optimizar sin proyecto |

### 5.4 Inventario

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory` | Listar inventario |
| GET | `/inventory/offcuts` | Listar sobrantes disponibles |
| POST | `/inventory` | Crear ítem |
| PATCH | `/inventory/{id}/consume` | Marcar consumo |

### 5.5 Proyectos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/projects` | Listar proyectos |
| POST | `/projects` | Crear proyecto |
| GET | `/projects/{id}` | Detalle |
| DELETE | `/projects/{id}` | Eliminar |
| POST | `/projects/{id}/optimize` | Optimizar y guardar layouts |
| POST | `/projects/{id}/pieces` | Guardar/reemplazar piezas |
| GET | `/projects/{id}/layouts` | Layouts generados |
| POST | `/projects/{id}/quote` | Generar cotización |
| POST | `/projects/{id}/cutlist` | PDF cut list |
| POST | `/projects/{id}/labels` | PDF etiquetas |
| GET | `/projects/{id}/assembly` | Ensamblaje generado |
| POST | `/projects/{id}/assembly/generate` | Regenerar ensamblaje |
| POST | `/projects/{id}/assembly/steps/{step_id}/validate` | Validar paso |
| POST | `/projects/{id}/assembly/steps/{step_id}/progress` | Actualizar progreso |

### 5.6 Plantillas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/templates` | Listar plantillas |
| POST | `/templates/{id}/generate` | Generar piezas desde plantilla |

---

## 6. Reglas de negocio

### 6.1 Autenticación y autorización

- El primer usuario registrado obtiene rol `admin`.
- Solo usuarios principales (`principal`) pueden crear/editar/eliminar proyectos, inventario y cotizaciones.
- Los invitados (`guest`) solo pueden ver optimizaciones y ensamblajes autorizados.
- Cada proyecto pertenece a un `owner_id`; el middleware `require_project_owner` impide accesos cruzados.

### 6.2 Optimización

- Las piezas pueden rotar 90° salvo que `rotar=false`.
- El corte se modela con `kerf_mm` y `margen_mm` configurables.
- Si `use_offcuts=true`, se priorizan sobrantes de inventario con ambas dimensiones ≥ `OFFCUT_THRESHOLD_CM` (30 cm por defecto).
- La salida incluye tableros con porcentaje de utilización y coordenadas de cada pieza.

### 6.3 Clasificación y codificación de piezas

- El sistema infiere el tipo de pieza por palabras clave en el nombre: base, tapa, lateral, estante, repisa, fondo, puerta, zapatero, zócalo, cajón, pata, división.
- Si no hay coincidencia, se usa la proporción de dimensiones como fallback.
- El código canónico generado es `[CAT]-[MOD]-[TIPO]-[SEQ]`, por ejemplo `GLOBAL-M01-BAS-I`.
- Si no se indica módulo, se asigna `M01`.

### 6.4 Ensamblaje

- Se genera automáticamente a partir de las piezas del proyecto.
- Se agrupan en módulos y se generan pasos: canteado, base, laterales, estantes, tapa, fondo, puertas/acabados y piezas restantes.
- Cada pieza tiene una posición y rotación esperada con tolerancias por defecto de 2 mm y 5°.
- El usuario puede validar pasos y actualizar el progreso.

### 6.5 Cotización

- **Material:** área total de tableros usados × costo por m² × 1.15 (merma).
- Si no se envía `costo_m2_mdf`, se consulta el catálogo según el material y espesor del proyecto.
- **Hardware:** suma de `cantidad × precio_unit`.
- **Mano de obra:** `total_cortes × 2 min + 30 min setup` × costo hora.
- **Total:** subtotal × margen (por defecto 1.3).

### 6.6 Catálogo de materiales

**Formatos de placa disponibles (cm):**

| Nombre | Dimensiones |
|--------|-------------|
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

Los precios son referenciales en USD/m² y se almacenan en `backend/app/catalog.py`.

### 6.7 Colores de melamina

El catálogo incluye colores sólidos, texturas madera y acabados especiales/premium (Blanco, Negro, Gris, Nogal, Roble, Cedro, Caoba, Mármol Carrara, Cemento, High Gloss, Antihuella, etc.).

---

## 7. Seguridad

- Variables secretas (`JWT_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`) solo en `.env`; mínimo 32 caracteres.
- No se versionan archivos `.env`, credenciales ni URLs internas.
- Cookies `httpOnly`; `Secure` y `SameSite` configurables.
- Rate limiting con `slowapi` en endpoints sensibles.
- Encriptación del secreto TOTP con Fernet.
- Códigos de respaldo hasheados con bcrypt y de un solo uso.
- Guest PIN generado con `secrets.randbelow(10000)`, expira en 5 min y no se transmite por canales externos.
- Validación de Pydantic en todos los inputs de API.

---

## 8. Interfaz de usuario

### 8.1 Rutas principales

| Ruta | Página | Público/Autenticado |
|------|--------|---------------------|
| `/login` | Login | Pública |
| `/register` | Registro | Pública |
| `/verify` | Verificación TOTP | Pública |
| `/guest` | Login invitado | Pública |
| `/` | Dashboard | Autenticado/Invitado |
| `/optimizer` | Optimizador | Autenticado/Invitado |
| `/projects` | Proyectos | Autenticado/Invitado |
| `/inventory` | Inventario | Principal |
| `/quote/:projectId` | Cotización | Principal |
| `/assembly/:projectId` | Ensamblaje 3D | Autenticado/Invitado |

### 8.2 Componentes clave

- **OptimizerPage:** formulario de piezas, selectores de material/formato/espesor, paleta de colores, carga CSV, optimización y resultados 2D/3D.
- **ProjectsPage:** listado, creación, plantillas paramétricas.
- **QuotePage:** hardware, costo m² editable con precio sugerido del catálogo, desglose y PDF.
- **InventoryPage:** alta y consumo de tableros/sobrantes.
- **AssemblyPage:** pasos, visualización 3D, validación, corrección de posición.

---

## 9. Testing

| Capa | Framework | Comando |
|------|-----------|---------|
| Backend | pytest | `cd backend && pytest` |
| Frontend | Vitest + jsdom | `cd frontend && pnpm test` |

Los tests se ejecutan también dentro de los builds Docker del backend y frontend.

---

## 10. Despliegue

### 10.1 MVP (`docker-compose.yml`)

- Backend FastAPI + SQLite.
- Frontend nginx en puerto 3000.
- Red interna `cutternest-network`.

### 10.2 Fase 2 (`docker-compose.fase2.yml`)

- PostgreSQL 15 + Redis 7.
- Backups automáticos diarios.

### 10.3 Fase 4 (`docker-compose.fase4.yml`)

- Gateway de WhatsApp (Baileys).
- Notificaciones opcionales.

### 10.4 Comandos

```bash
# MVP
docker compose up --build

# Fase 2
docker compose -f docker-compose.yml -f docker-compose.fase2.yml up --build

# Fase 4
docker compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up --build
```

---

## 11. Criterios de aceptación

1. Un usuario puede registrarse, configurar TOTP e iniciar sesión.
2. Puede crear un proyecto seleccionando material, espesor y formato de placa del catálogo.
3. Puede agregar piezas manualmente o cargar un CSV; el sistema genera códigos y módulos automáticamente.
4. El optimizador produce layouts 2D/3D con alto porcentaje de utilización.
5. La cotización calcula costos con precios del catálogo y permite ajustar hardware y margen.
6. El ensamblaje genera pasos 3D para cualquier conjunto de piezas, incluyendo piezas genéricas.
7. Los tests de backend y frontend pasan y los builds Docker son exitosos.
8. El sistema corre completamente offline después del build inicial.

---

## 12. Fuentes

- `AGENTS.md` — guía de agentes y convenciones del proyecto.
- `README.md` — contexto general para humanos.
- `docs/GUIA-MELAMINICOS-ECUADOR.md` — catálogo de materiales, formatos y colores.
- Código fuente en `backend/app` y `frontend/src`.
