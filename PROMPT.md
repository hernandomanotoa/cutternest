# Prompt: CutterNest MVP — Sistema de Optimización de Cortes (Self-Contained)

## Meta
Desarrollar un sistema web completo y autocontenido para optimizar cortes de tableros (MDF, madera, melamina) para fabricación de muebles. **Sin dependencias de servicios externos**: todo corre dentro de Docker Compose sin necesidad de APIs de terceros, gateways de mensajería, servidores SMTP, ni impresoras especiales.

---

## 1. Arquitectura MVP (Todo local)

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Network (aislado, sin salida a internet requerida)   │
│                                                              │
│  ┌──────────────┐         ┌──────────────────────────────┐  │
│  │  Frontend    │  HTTP   │  Backend (FastAPI)           │  │
│  │  React 18    │◄───────►│  Python 3.11               │  │
│  │  Three.js    │  /api   │  + rectpack                │  │
│  │  (puerto     │         │  + Pillow (SVG/PNG/PDF)    │  │
│  │   3000)      │         │  + pyotp (TOTP local)       │  │
│  └──────────────┘         │  + ReportLab (PDFs)        │  │
│                           │  + SQLAlchemy + SQLite     │  │
│                           │    (para MVP)              │  │
│                           │  (puerto 8000)             │  │
│                           └──────────────────────────────┘  │
│                                                              │
│  Volumen compartido: /app/data (layouts, PDFs, exports)      │
│                                                              │
│  NO se requiere: PostgreSQL, Redis, SMTP, Twilio, WhatsApp, │
│  impresora térmica, cloud, ni ningún servicio externo.       │
└─────────────────────────────────────────────────────────────┘
```

**Base de datos:** SQLite para MVP (archivo local en volumen). Migrar a PostgreSQL es opcional post-MVP.

---

## 2. Backend (FastAPI + Python)

### 2.1 Estructura
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # Entrypoint FastAPI
│   ├── models.py            # Pydantic + SQLAlchemy models
│   ├── database.py          # SQLite setup con SQLAlchemy
│   ├── optimizer.py         # Wrapper de rectpack
│   ├── svg_generator.py     # Genera SVG/PNG de layouts
│   ├── pdf_generator.py     # Cut lists, etiquetas, cotizaciones
│   ├── auth.py              # TOTP local + Guest PIN (sin servicios externos)
│   ├── inventory.py         # Gestión de tableros y sobrantes
│   ├── quotes.py            # Costos y cotizaciones (cálculo local)
│   ├── assembly.py          # Planos de ensamblaje (datos JSON)
│   └── templates.py         # Plantillas de muebles predefinidos
├── requirements.txt
├── Dockerfile
└── data/                    # SQLite + layouts + PDFs exportados
```

### 2.2 Requisitos funcionales (MVP)

#### API: Optimización de Cortes
`POST /api/v1/optimize`
```json
{
  "tablero": { "ancho": 244, "alto": 122, "espesor": 18, "kerf_mm": 3, "margen_mm": 2 },
  "piezas": [
    { "id": "base", "nombre": "Base", "ancho": 120, "alto": 60, "cantidad": 1, "rotar": true, "color": "#FF6B6B", "espesor": 18 }
  ],
  "usar_sobrantes": false
}
```
Response: lista de tableros con piezas colocadas (x, y, w, h), aprovechamiento %, SVG/PNG generados.

**Reglas del optimizador:**
- Usar `rectpack` con algoritmo Guillotine (`GuillotineBssfSas`).
- Respetar `rotar` por pieza.
- Aplicar `kerf_mm` como espaciado entre piezas en visualización (no modificar coordenadas del algoritmo).
- Aplicar `margen_mm` alrededor del tablero.
- Si `usar_sobrantes` = true, intentar colocar piezas pequeñas primero en tableros del inventario con estado `sobrante` antes de usar tableros nuevos.

#### API: Inventario de Tableros (local)
`GET /api/v1/inventory` — listar tableros y sobrantes.
`POST /api/v1/inventory` — agregar tablero nuevo.
`PATCH /api/v1/inventory/{id}/consume` — marcar como usado/consumido.
`GET /api/v1/inventory/offcuts` — listar sobrantes reutilizables (>30×30 cm).

Tabla `inventory` (SQLite):
```sql
CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,        -- MDF, Melamina, Triplex
    espesor_mm INTEGER NOT NULL,
    ancho_cm REAL NOT NULL,
    alto_cm REAL NOT NULL,
    cantidad INTEGER DEFAULT 1,
    estado TEXT DEFAULT 'nuevo',  -- nuevo, sobrante, danado
    proyecto_origen INTEGER,
    area_m2 REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Al optimizar un proyecto, si sobra un área mayor al umbral configurable (default 30×30 cm), registrar automáticamente en `inventory` como `sobrante` con `proyecto_origen`.

#### API: Cotización y Costos (local)
`POST /api/v1/projects/{id}/quote`
```json
{
  "hardware": [
    { "item": "Bisagra 35mm", "cantidad": 4, "precio_unit": 0.80 },
    { "item": "Tornillo confirmat", "cantidad": 20, "precio_unit": 0.05 }
  ],
  "costo_m2_mdf": 8.50,
  "costo_hora_mano_obra": 5.00,
  "margen": 1.30
}
```
Response: desglose JSON + PDF generado localmente con ReportLab.

Cálculos:
- Material: área_total_m2 × costo_m2 × factor_desperdicio (default 1.15).
- Hardware: suma de cantidad × precio_unit.
- Mano de obra: estimación configurable (default 2 min/corte + 30 min setup).
- Total: (material + hardware + mano_obra) × margen.

#### API: Etiquetas (PDF local)
`POST /api/v1/projects/{id}/labels`
Genera PDF A4 con etiquetas 50×30mm o 60×40mm listas para imprimir en impresora láser/inkjet común.

Cada etiqueta incluye:
- Nombre de pieza + dimensiones (ej: "Base 120×60").
- Código QR con JSON: `{"p":"<project_id>","i":"<piece_id>","d":"120x60"}`.
- Indicador de cantos: T (top), B (bottom), L (left), R (right) según aristas visibles.

#### API: Planos de Ensamblaje (JSON para Three.js)
`GET /api/v1/projects/{id}/assembly`
Devuelve JSON con pasos de ensamblaje. El frontend usa Three.js para renderizar vista exploded y paso a paso.

Estructura:
```json
{
  "pasos": [
    {
      "numero": 1,
      "titulo": "Pegar cantos",
      "piezas": ["base", "tapa"],
      "herramientas": ["plancha canto", "cutter"],
      "tiempo_estimado_min": 15
    },
    {
      "numero": 2,
      "titulo": "Atornillar laterales a base",
      "piezas": ["lateral-izq", "lateral-der", "base"],
      "herramientas": ["taladro", "escuadra"],
      "tiempo_estimado_min": 20
    }
  ]
}
```

#### API: Plantillas de Muebles
`GET /api/v1/templates` — lista plantillas predefinidas (Estantería, Closet, Mesa, Cajonera, Mueble TV).
`POST /api/v1/templates/{id}/generate` — genera lista de piezas según parámetros (ancho, alto, profundidad, n_estantes, etc.).

Las plantillas son lógica Python pura, no requieren base de datos externa.

#### API: Cut List (PDF secuencial)
`POST /api/v1/projects/{id}/cutlist`
Genera PDF A4 imprimible con:
- Diagrama del tablero con flechas numeradas indicando orden de corte (1→2→3...).
- Tabla: N° de corte, dimensión, pieza resultante, referencia, ángulo (0° o 90°).
- Checklist de seguridad (iconos: guantes, gafas, push stick).
- Tiempo estimado total.

---

## 3. Autenticación (Self-Contained, sin servicios externos)

### Modo Principal
- Registro: username + password + email (email solo como campo de texto, **sin envío de correos**).
- TOTP: `pyotp` genera secreto Base32. Mostrar QR en pantalla como imagen PNG (provisioning URI). Usuario escanea con Google Authenticator/Authy en su celular.
- Login: username/password → pantalla de código TOTP (6 dígitos) → JWT access + refresh tokens.
- Refresh token: guardado en SQLite tabla `sessions`. Expira en 7 días.
- Logout: borrar refresh token de la base de datos (blacklist simple en SQLite, no requiere Redis).
- Backup codes: 10 códigos generados localmente, hasheados con bcrypt, mostrados una sola vez en registro. El usuario los guarda manualmente.

### Modo Temporal (Guest / Taller)
- Un usuario Principal genera un PIN de 4 dígitos desde su cuenta.
- El PIN se muestra en pantalla del usuario Principal (no se envía por ningún medio externo).
- El operario/visitante ingresa el PIN en la tablet del taller.
- Sesión de 4 horas. JWT con claim `mode: "guest"`.
- Funcionalidades limitadas: crear proyectos, optimizar, exportar layouts. NO guardar en nube (solo localStorage), NO ver historial de otros, NO administrar.
- Tabla `guest_sessions` en SQLite con `pin`, `created_by`, `expires_at`, `used_at`.

### Middleware
```python
async def get_current_user_or_guest(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_jwt(token)
    if payload.get("mode") == "guest":
        guest = db.query(GuestSession).filter_by(id=payload["jti"], revoked_at=None).first()
        if not guest or guest.expires_at < datetime.now():
            raise HTTPException(401, "Sesión temporal expirada")
        return GuestUser(id=guest.id, created_by=guest.created_by)
    return await get_current_user(credentials)
```

### Endpoints de Auth MVP
- `POST /api/v1/auth/register` → username, email, password. Devuelve QR_URI (PNG base64) + backup_codes.
- `POST /api/v1/auth/login` → step 1 (user/pass) devuelve `temp_token`. Step 2: `POST /api/v1/auth/verify` con código TOTP o backup code.
- `POST /api/v1/auth/refresh` → nuevo access token.
- `POST /api/v1/auth/logout` → revoca refresh token.
- `POST /api/v1/auth/guest/pin` → (requiere auth principal) genera PIN de 4 dígitos, muestra en pantalla.
- `POST /api/v1/auth/guest/login` → ingresa PIN, devuelve guest JWT.

### NO incluir en MVP (requieren externos)
- ❌ Email SMTP (verificación, notificaciones, recuperación de password).
- ❌ SMS (Twilio o gateway propio).
- ❌ WhatsApp (Baileys, notificaciones a clientes, registro por WA).
- ❌ Recuperación de password por email → usar backup codes o contactar admin.

---

## 4. Frontend (React 18 + Three.js + Tailwind)

### 4.1 Estructura
```
frontend/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── TOTPVerify.tsx
│   │   │   ├── GuestLogin.tsx
│   │   │   └── BackupCodes.tsx
│   │   ├── optimizer/
│   │   │   ├── PiezaForm.tsx
│   │   │   ├── TableroConfig.tsx
│   │   │   ├── PiezasList.tsx
│   │   │   ├── OptimizerResults.tsx
│   │   │   ├── Layout2D.tsx
│   │   │   └── Tablero3D.tsx
│   │   ├── mueble/
│   │   │   ├── Mueble3D.tsx
│   │   │   └── AssemblySteps.tsx
│   │   ├── taller/
│   │   │   ├── CutListPDF.tsx
│   │   │   ├── EtiquetasPDF.tsx
│   │   │   └── InventoryManager.tsx
│   │   ├── cotizacion/
│   │   │   ├── HardwareForm.tsx
│   │   │   ├── QuoteResult.tsx
│   │   │   └── QuotePDF.tsx
│   │   └── templates/
│   │       ├── TemplateSelector.tsx
│   │       └── TemplateParams.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useOptimizer.ts
│   │   └── useThreeScene.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── threeHelpers.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── Dockerfile
```

### 4.2 Pantallas MVP

#### Pública
- **Login:** username/password + TOTP (campo numérico 6 dígitos). Botón "Acceso temporal (PIN)".
- **Registro:** username, email (texto), password, confirmar password. Tras registro, mostrar QR de TOTP y backup codes (descargar como TXT).

#### Protegidas (Principal)
- **Dashboard:** resumen rápido (proyectos recientes, stock bajo, eficiencia último mes).
- **Nuevo Proyecto:**
  - Selector de plantilla (Estantería, Closet, Mesa, Cajonera, Mueble TV) con sliders de parámetros.
  - O modo avanzado: agregar piezas manualmente (nombre, ancho, alto, cantidad, color picker, rotar, espesor).
  - Configuración de tablero: ancho, alto, espesor, kerf, margen.
  - Checkbox "Usar sobrantes del inventario primero".
  - Botón "Optimizar".
- **Resultados de Optimización:**
  - Cards por tablero con SVG del layout.
  - % aprovechamiento, piezas colocadas, lista de cortes.
  - Botones: Descargar SVG, Descargar PNG, Ver en 3D, Generar Cut List, Generar Etiquetas.
- **Visualización 3D Tablero:** Three.js con piezas como cubos sobre plano horizontal. Orbit controls. Selector de tablero. Modo "exploded" (separar piezas verticalmente).
- **Visualización 3D Mueble Armado:** Piezas posicionadas en su lugar final. Pasos de ensamblaje con botón "Siguiente" que anima la pieza moviéndose a su posición.
- **Cotización:** Tabla editable de hardware (autocomplete de catálogo predefinido: bisagras, tornillos, tiradores, rieles, pegamento, canto). Sliders de costo m2, mano de obra, margen. Preview de total en tiempo real. Botón "Generar Cotización PDF".
- **Inventario:** Tabla de tableros y sobrantes. Agregar entrada (tipo, dimensiones, cantidad). Filtros por tipo/estado. Alerta visual si stock < umbral.
- **Generar PIN Temporal:** Botón en perfil para generar PIN de 4 dígitos. Mostrar en pantalla grande con temporizador de 5 minutos. Botón "Revocar".
- **Reportes:** Gráfico simple de eficiencia por proyecto (barras). Exportar CSV.

#### Protegidas (Guest / Temporal)
- **Nuevo Proyecto:** mismo formulario de piezas/tablero.
- **Resultados:** SVG, PNG, 3D tablero, Cut List, Etiquetas.
- **NO hay:** inventario, cotizaciones, reportes, guardar en servidor (usa localStorage), historial, plantillas (solo las predefinidas básicas).
- **Al expirar:** modal "Sesión terminada" con botón "Enviar proyecto al admin" (genera JSON descargable para que el admin lo importe).

---

## 5. Docker Compose (MVP, todo local)

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: cutternest-backend
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_URL=sqlite:///app/data/cutternest.db
      - JWT_SECRET_KEY=change-me-in-production
      - JWT_ACCESS_EXPIRE_MINUTES=15
      - JWT_REFRESH_EXPIRE_DAYS=7
      - GUEST_SESSION_HOURS=4
      - OFFCUT_THRESHOLD_CM=30
    networks:
      - cutternest-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: cutternest-frontend
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - cutternest-net

networks:
  cutternest-net:
    driver: bridge

volumes:
  data:
    driver: local
```

**NO se incluye:** PostgreSQL, Redis, servicios de mensajería, ni ningún contenedor adicional.

---

## 6. Datos de ejemplo (Mueble pre-cargado)

Incluir botón "Cargar ejemplo: Estantería Modular" que llene el formulario:

| Pieza | Ancho (cm) | Alto (cm) | Cantidad | Color | Rotar | Espesor (mm) | Cantos |
|-------|-----------|-----------|----------|-------|-------|-------------|--------|
| Base | 120 | 60 | 1 | #FF6B6B | Sí | 18 | T,B,L,R |
| Tapa | 120 | 60 | 1 | #4ECDC4 | Sí | 18 | T,B,L,R |
| Lateral Izq | 50 | 180 | 1 | #45B7D1 | No | 18 | T,B,L |
| Lateral Der | 50 | 180 | 1 | #45B7D1 | No | 18 | T,B,R |
| Estante 1 | 100 | 30 | 1 | #96CEB4 | Sí | 18 | T,B,L,R |
| Estante 2 | 100 | 30 | 1 | #96CEB4 | Sí | 18 | T,B,L,R |
| Estante 3 | 100 | 30 | 1 | #96CEB4 | Sí | 18 | T,B,L,R |
| Estante 4 | 100 | 30 | 1 | #96CEB4 | Sí | 18 | T,B,L,R |
| Puerta Izq | 80 | 40 | 1 | #FFEAA7 | Sí | 18 | T,B,L,R |
| Puerta Der | 80 | 40 | 1 | #FFEAA7 | Sí | 18 | T,B,L,R |
| Fondo | 60 | 180 | 1 | #DDA0DD | No | 3 | - |

Tablero: 244×122 cm, MDF 18mm, kerf 3mm, margen 2mm.

---

## 7. Requisitos no funcionales MVP

1. **Single command start:** `docker-compose up --build` levanta todo sin errores y sin configuración adicional.
2. **Sin internet requerida:** después de build, el sistema funciona en una red aislada.
3. **Responsive:** funciona en tablet 1024px+ (taller) y desktop 1920px+ (diseñador).
4. **Idioma:** Español. Todos los labels, mensajes de error y PDFs en español.
5. **Performance:** optimización de 20 piezas en < 2 segundos. Three.js 3D con 50 piezas a 60 FPS.
6. **Persistencia:** SQLite en volumen Docker. Si se destruye el contenedor, los datos permanecen en `./data/`.
7. **Exportación:** todos los PDFs, SVGs, PNGs y CSVs se guardan en `/app/data/exports/` y se sirven como archivos estáticos.

---

## 8. Checklist de entrega MVP

- [ ] `docker-compose up --build` levanta backend + frontend sin errores.
- [ ] Registro de usuario con username/password + TOTP (QR visible en pantalla).
- [ ] Login con TOTP (6 dígitos) devuelve JWT.
- [ ] Guest login con PIN de 4 dígitos generado por usuario principal.
- [ ] Backend optimiza con rectpack el ejemplo de estantería (11 piezas en 2 tableros).
- [ ] Frontend muestra SVG del layout con piezas coloreadas, nombres y medidas.
- [ ] Vista 3D del tablero con piezas como cubos en posición correcta (Three.js).
- [ ] Vista 3D del mueble armado con pasos de ensamblaje animados.
- [ ] Cut List PDF generado con orden de cortes y checklist de seguridad.
- [ ] Etiquetas PDF generadas con códigos QR.
- [ ] Cotización PDF con desglose de materiales, hardware, mano de obra y total.
- [ ] Inventario funcional: agregar tableros, ver sobrantes, consumir en proyecto.
- [ ] Plantillas de muebles predefinidas generan piezas automáticamente.
- [ ] Reporte simple de eficiencia por proyecto (gráfico de barras).
- [ ] README.md con instrucciones de instalación, uso y estructura de carpetas.

---

## 9. Notas para el desarrollador (Kimi Code)

1. **rectpack:** Usa coordenadas (x, y) desde esquina inferior-izquierda. En Three.js mapear: `threeX = x - tableroAncho/2`, `threeZ = y - tableroAlto/2`, `threeY = espesor/2`.
2. **Guillotine:** Si `rectpack` no expone guillotine directamente, usar `MaxRects` o `Skyline` y documentar que el orden de corte es sugerencia, no estricto.
3. **Three.js:** Usar `@react-three/fiber` + `@react-three/drei` para simplificar el ciclo de vida en React.
4. **Colores:** Usar el color definido por el usuario en el formulario para cada pieza, tanto en SVG como en 3D.
5. **Espesor:** Las piezas pueden tener espesores diferentes (fondo 3mm vs cuerpo 18mm). En 3D, usar el espesor real para la altura del cubo.
6. **Kerf:** En el SVG, dibujar un borde más grueso (1.5px) entre piezas para simular el corte. No modificar las coordenadas del backend.
7. **SQLite:** Usar `aiosqlite` o SQLAlchemy async con SQLite. Para MVP no requiere PostgreSQL.
8. **PDFs:** Usar `ReportLab` para PDFs de cotización, cut list y etiquetas. SVGs generar con `svgwrite` o strings directos.
9. **Guest PIN:** Generar con `secrets.randbelow(10000)` formateado a 4 dígitos. Guardar en SQLite con expiración de 5 minutos si no se usa.
10. **TOTP QR:** Usar `pyotp` + `qrcode` (librería Python) para generar imagen PNG base64. Mostrar en frontend con `<img src="data:image/png;base64,...">`.
11. **Cálculo de cantos:** En el ensamblaje 3D, permitir al usuario hacer click en aristas de una pieza para marcarlas como "visibles" (necesitan canto). Calcular metros lineales sumando aristas marcadas de todas las piezas.
12. **Plantillas:** Las plantillas son funciones Python puras que reciben parámetros y devuelven lista de piezas. Ejemplo: `generar_estanteria(ancho=120, alto=180, prof=50, n_estantes=4)` → lista de dicts.

---

## 10. Fases de Expansión (Post-MVP)

### 10.1 Fase 2: Infraestructura de Datos y Seguridad (PostgreSQL + Redis + Backups)

**Objetivo:** Migrar de SQLite a PostgreSQL para concurrencia, agregar Redis para seguridad de sesiones, y automatizar backups resguardables.

#### Cambios en docker-compose.yml
```yaml
  postgres:
    image: postgres:15-alpine
    container_name: cutternest-postgres
    environment:
      POSTGRES_USER: cutternest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cutternest_pass}
      POSTGRES_DB: cutternest
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
      - ./backend/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - cutternest-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cutternest -d cutternest"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: cutternest-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_pass}
    volumes:
      - redis_data:/data
    networks:
      - cutternest-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backup automático diario
  backup:
    image: postgres:15-alpine
    container_name: cutternest-backup
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=cutternest
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-cutternest_pass}
      - POSTGRES_DB=cutternest
      - BACKUP_DIR=/backups
    volumes:
      - ./backups:/backups
    networks:
      - cutternest-net
    command: >
      sh -c "
        while true; do
          sleep 86400;
          PGPASSWORD=$$POSTGRES_PASSWORD pg_dump -h $$POSTGRES_HOST -U $$POSTGRES_USER $$POSTGRES_DB > $$BACKUP_DIR/cutternest_$$(date +%Y%m%d_%H%M%S).sql;
          ls -t $$BACKUP_DIR/cutternest_*.sql | tail -n +8 | xargs rm -f;
        done
      "
    depends_on:
      postgres:
        condition: service_healthy

  backend:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://cutternest:${POSTGRES_PASSWORD:-cutternest_pass}@postgres:5432/cutternest
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis_pass}@redis:6379/0
      - JWT_SECRET_KEY=${JWT_SECRET_KEY:-change-me-in-production}
      - JWT_ACCESS_EXPIRE_MINUTES=15
      - JWT_REFRESH_EXPIRE_DAYS=7
      - GUEST_SESSION_HOURS=4
      - OFFCUT_THRESHOLD_CM=30

volumes:
  data:
    driver: local
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

#### Cambios en backend (requirements.txt adicionales)
```
asyncpg==0.29.0
redis==5.0.1
alembic==1.12.1
```

#### Migración SQLite a PostgreSQL
- Usar SQLAlchemy con `create_async_engine("postgresql+asyncpg://...")`.
- Alembic para migraciones de schema.
- El schema de tablas es idéntico al MVP, solo cambia el dialecto.

#### Seguridad adicional con Redis
- **Blacklist de tokens:** Al hacer logout, el access token se agrega a Redis con TTL = tiempo de expiración del JWT. El middleware verifica Redis antes de aceptar cualquier token.
- **Rate limiting:** Máximo 5 intentos de login por IP cada 15 minutos. Almacenar contadores en Redis.
- **Guest PIN rate limiting:** Máximo 3 intentos de PIN incorrecto por sesión temporal. Bloquear 15 minutos.
- **OTP rate limiting:** Si se agrega Fase 4, máximo 1 solicitud de OTP por minuto por método.

```python
# Ejemplo de middleware con Redis
async def check_blacklist(token_jti: str):
    redis = await get_redis()
    if await redis.exists(f"blacklist:{token_jti}"):
        raise HTTPException(401, "Token revocado")

async def rate_limit_login(ip: str):
    redis = await get_redis()
    key = f"ratelimit:login:{ip}"
    attempts = await redis.incr(key)
    if attempts == 1:
        await redis.expire(key, 900)
    if attempts > 5:
        raise HTTPException(429, "Demasiados intentos. Espere 15 minutos.")
```

#### Backup y resguardo de datos
- **Automático:** Contenedor `backup` genera dump SQL diario en `./backups/`.
- **Retención:** 7 días de backups (configurable).
- **Manual:** Endpoint `POST /api/v1/admin/backup` (requiere admin) genera backup bajo demanda.
- **Restauración:** Script `restore.sh` incluido en repo para restaurar desde backup SQL.
- **Exportación de proyectos:** Cada proyecto puede exportarse como JSON completo (piezas, layouts, cotización) para backup independiente.

#### Variables de entorno (.env para Fase 2)
```env
# Database
POSTGRES_PASSWORD=secure_postgres_password_change_me
DATABASE_URL=postgresql://cutternest:secure_postgres_password_change_me@postgres:5432/cutternest

# Redis
REDIS_PASSWORD=secure_redis_password_change_me
REDIS_URL=redis://:secure_redis_password_change_me@redis:6379/0

# JWT
JWT_SECRET_KEY=super-secret-key-min-32-characters-long
JWT_ACCESS_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7

# App
GUEST_SESSION_HOURS=4
OFFCUT_THRESHOLD_CM=30
```

---

### 10.2 Fase 4: Notificaciones Multicanal (WhatsApp + SMS)

**Objetivo:** Notificar a clientes sobre cambios de estado de órdenes de trabajo y permitir registro/OTP por WhatsApp.

#### Servicios Docker adicionales

```yaml
  # WhatsApp Gateway (Baileys - Node.js)
  whatsapp-gateway:
    build:
      context: ./whatsapp-gateway
      dockerfile: Dockerfile
    container_name: cutternest-whatsapp
    environment:
      - NODE_ENV=production
      - API_KEY=${WHATSAPP_API_KEY:-whatsapp_secret_key}
      - WEBHOOK_URL=http://backend:8000/api/v1/webhook/whatsapp
    volumes:
      - whatsapp_auth:/app/auth
    networks:
      - cutternest-net
    restart: unless-stopped

  # SMS Gateway (opcional - si se usa gateway propio)
  sms-gateway:
    image: alpine/curl:latest
    container_name: cutternest-sms
    networks:
      - cutternest-net
    profiles:
      - sms
```

#### Backend: Integración de notificaciones

**Nueva tabla `notificaciones_config`:**
```sql
CREATE TABLE notificaciones_config (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    whatsapp_notificaciones BOOLEAN DEFAULT false,
    sms_notificaciones BOOLEAN DEFAULT false,
    email_notificaciones BOOLEAN DEFAULT false,
    whatsapp_gateway_url TEXT DEFAULT 'http://whatsapp-gateway:8080/send',
    sms_gateway_url TEXT,
    sms_gateway_token TEXT
);
```

**Servicio de notificaciones (`notificador.py`):**
```python
class NotificadorService:
    async def enviar_whatsapp(self, numero: str, mensaje: str):
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://whatsapp-gateway:8080/send",
                json={"to": numero, "message": mensaje},
                headers={"X-API-Key": settings.WHATSAPP_API_KEY}
            )

    async def enviar_sms(self, numero: str, mensaje: str):
        if settings.SMS_GATEWAY_URL:
            async with httpx.AsyncClient() as client:
                await client.post(
                    settings.SMS_GATEWAY_URL,
                    json={"to": numero, "message": mensaje},
                    headers={"Authorization": f"Bearer {settings.SMS_GATEWAY_TOKEN}"}
                )

    async def notificar_cambio_orden(self, orden_id: UUID, nuevo_estado: str):
        orden = await get_orden(orden_id)
        cliente = await get_cliente(orden.cliente_id)

        mensaje = (
            f"CutterNest - Orden {orden.numero_orden}\n"
            f"Estado: {nuevo_estado}\n"
            f"Gracias por confiar en nosotros."
        )

        if cliente.telefono and config.whatsapp_notificaciones:
            await self.enviar_whatsapp(cliente.telefono, mensaje)

        if cliente.telefono and config.sms_notificaciones:
            await self.enviar_sms(cliente.telefono, mensaje)
```

#### Flujos habilitados en Fase 4

**A. Registro por WhatsApp (alternativo al email):**
1. Usuario envía "Registrarme" al número de WhatsApp del sistema.
2. Bot responde con código de 6 dígitos.
3. Usuario ingresa código en web + completa username, password, email.
4. Sistema genera QR TOTP para Google Authenticator.
5. WhatsApp queda verificado como método de notificación.

Endpoint: `POST /api/v1/webhook/whatsapp` (recibe mensajes del gateway Baileys).

**B. OTP por WhatsApp/SMS (fallback de TOTP):**
1. Usuario inicia login con username/password.
2. Si no tiene acceso a TOTP, selecciona "Enviar código por WhatsApp/SMS".
3. Sistema genera código de 6 dígitos, válido por 5 min.
4. Envía vía gateway correspondiente.
5. Usuario ingresa código y recibe JWT.

Endpoints: `POST /api/v1/auth/otp/request` y `POST /api/v1/auth/otp/verify`.

**C. Notificaciones automáticas de órdenes:**
- Estado "pendiente" → cliente recibe confirmación.
- Estado "en_corte" → "Su mueble está en proceso de corte".
- Estado "en_ensamblaje" → "Su mueble está siendo ensamblado".
- Estado "terminado" → "Su mueble está listo para retiro/entrega".
- Estado "entregado" → "Gracias por su preferencia."

**D. Recordatorios de mantenimiento:**
- 6 meses después de entrega: "¿Cómo va su mueble? Recuerde que ofrecemos servicio de ajuste."

#### Requisitos Python adicionales (Fase 4)
```
httpx==0.25.2
aiosmtplib==3.0.1
```

#### Variables de entorno adicionales (.env Fase 4)
```env
# WhatsApp (Baileys Gateway)
WHATSAPP_API_KEY=whatsapp_secret_key_change_me
WHATSAPP_ENABLED=true

# SMS Gateway (opcional)
SMS_GATEWAY_URL=http://sms-gateway:8080/send
SMS_GATEWAY_TOKEN=DeO8Gf7h9jUkxv0SUcagDeT6ROrEiTsYPiPc5ci6w+Q=
SMS_ENABLED=false

# Notificaciones
NOTIFICAR_CAMBIO_ESTADO=true
NOTIFICAR_ENTREGA=true
```

#### Consideraciones de seguridad para Fase 4
- **Webhook WhatsApp:** Validar `X-API-Key` en todos los endpoints de webhook. Rechazar requests sin firma válida.
- **Número de teléfono:** Validar formato E.164 (+593XXXXXXXXX). No permitir duplicados en `users.telefono`.
- **Rate limiting OTP:** Máximo 1 solicitud por minuto por número, máximo 3 intentos fallidos por código. Implementar en Redis (Fase 2).
- **SIM Swap mitigation:** WhatsApp/SMS nunca pueden ser el ÚNICO factor de autenticación. Siempre requerir password + TOTP app como primario. WhatsApp/SMS solo como fallback o notificación.
- **Logs de notificaciones:** Tabla `notificaciones_log` con: id, orden_id, destinatario, canal, mensaje, estado, error, created_at.

---

## 11. Roadmap de Implementación

| Fase | Qué incluye | Esfuerzo estimado | Dependencias |
|---|---|---|---|
| **MVP** | SQLite, optimizador, 3D, cotización local, TOTP, Guest PIN, inventario, plantillas, cut list, etiquetas, ensamblaje | 2-3 semanas | Ninguna |
| **Fase 2** | PostgreSQL, Redis, backups automáticos, rate limiting, blacklist tokens, concurrencia multi-usuario | +3-4 días | MVP estable |
| **Fase 3** | Email SMTP institucional, recuperación de password, envío de cotizaciones por email | +2-3 días | Fase 2 |
| **Fase 4** | WhatsApp (Baileys), SMS gateway, notificaciones de órdenes, registro por WhatsApp, OTP fallback | +4-5 días | Fase 2 |
| **Fase 5** | Impresora térmica ZPL/ESC-POS, integración hardware taller | +2-3 días | Fase 2+ |
| **Fase 6** | App móvil (PWA offline), escaneo de QR en piezas, checklists de taller | +1-2 semanas | Fase 4 |

---

## 12. Comando de inicio rápido por fase

### MVP (sin internet, sin externos)
```bash
git clone <repo>
cd cutternest
docker-compose up --build
# Acceder a http://localhost:3000
```

### Fase 2 (con PostgreSQL + Redis + backups)
```bash
cd cutternest
cp .env.example .env
nano .env  # Editar POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET_KEY

docker-compose -f docker-compose.yml -f docker-compose.fase2.yml up --build
# Backups automáticos en ./backups/ cada 24h
```

### Fase 4 (con WhatsApp + notificaciones)
```bash
cd cutternest
# Configurar variables de WhatsApp/SMS en .env
docker-compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up --build
# Escanear QR de Baileys en logs para vincular WhatsApp
# docker logs -f cutternest-whatsapp
```

---

## 12. Comando de inicio rápido

El usuario final debe poder ejecutar:

```bash
git clone <repo>
cd cutternest
docker-compose up --build
```

Y acceder a `http://localhost:3000`.

**Sin configuración adicional. Sin claves API. Sin servicios externos.**

---

**Fin del prompt. Implementar todo el proyecto siguiendo estas especificaciones.**
