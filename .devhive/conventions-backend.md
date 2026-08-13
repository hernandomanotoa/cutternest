# Convenciones de backend — CutterNest

Stack: Python 3.11 + FastAPI + Pydantic + SQLAlchemy + pytest.

## Estructura de archivos

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # Entry point FastAPI
│   ├── models.py            # Pydantic + SQLAlchemy models
│   ├── database.py          # SQLite setup con SQLAlchemy
│   ├── optimizer.py         # Wrapper de rectpack
│   ├── svg_generator.py     # Genera SVG/PNG de layouts
│   ├── pdf_generator.py     # Cut lists, etiquetas, cotizaciones
│   ├── auth.py              # TOTP local + Guest PIN
│   ├── inventory.py         # Gestión de tableros y sobrantes
│   ├── quotes.py            # Costos y cotizaciones
│   ├── assembly.py          # Planos de ensamblaje (datos JSON)
│   ├── templates.py         # Plantillas de muebles predefinidas
│   └── routers/             # (opcional) routers FastAPI separados
│       ├── auth.py
│       ├── optimize.py
│       ├── inventory.py
│       ├── projects.py
│       └── templates.py
├── tests/
│   ├── conftest.py
│   ├── test_optimizer.py
│   ├── test_auth.py
│   ├── test_inventory.py
│   └── test_quotes.py
├── requirements.txt
├── requirements.fase2.txt
├── requirements.fase4.txt
└── Dockerfile
```

## Reglas de código

- **Servicios**: funciones async con nombres descriptivos, try/except con logging controlado; nunca loggear secrets ni passwords.
- **Routers**: validación de inputs con Pydantic models; nunca lógica de negocio directamente en endpoints.
- **Middleware**: auth propio en `auth.py` o como dependencia FastAPI (`Depends(get_current_user_or_guest)`).
- **Utils**: helpers de JWT, hashing, cálculo de áreas y validación de dimensiones.
- **Errores**: retornar respuestas JSON con código HTTP correcto: `{"detail": "mensaje"}` o esquema consistente definido en `models.py`.
- **DB**: SQLAlchemy con queries parametrizadas; nunca concatenar strings SQL.
- **Audit**: loguear acciones relevantes en tabla `audit_logs` si existe; nunca loggear secrets.

## API REST

- Base path: `/api/v1/`.
- Respuesta estándar: usa Pydantic response models; errores con `HTTPException` y `detail` en español.
- Códigos HTTP: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests, 500 Server Error.
- Paginación: `?page=1&limit=20` en endpoints de lista (`/inventory`, `/projects`, `/templates`).
- Auth: header `Authorization: Bearer <token>`; access token 15 min, refresh token 7 días en SQLite. En Fase 2 agregar blacklist en Redis.

Ver detalles de seguridad en [conventions-auth.md](./conventions-auth.md).

## Variables de entorno sensibles

- Nunca hardcodear: `JWT_SECRET_KEY`, `DATABASE_URL`, `WHATSAPP_API_KEY`, `SMS_GATEWAY_TOKEN`.
- Nunca loggear: contraseñas, tokens, secrets, PINs.
- Usar `pydantic-settings` o `os.environ` centralizado en `backend/app/config.py` como único punto de acceso a env vars.

## Optimizador

- Usar `rectpack` con algoritmo Guillotine (`GuillotineBssfSas`) o fallback a `MaxRects`/`Skyline` si no está disponible.
- Respetar `rotar` por pieza.
- Aplicar `kerf_mm` como espaciado visual en SVG, no modificar coordenadas del algoritmo.
- Aplicar `margen_mm` alrededor del tablero.
- Si `usar_sobrantes` = true, intentar colocar piezas pequeñas primero en tableros del inventario con estado `sobrante` antes de usar tableros nuevos.
- Mapear coordenadas a Three.js: `threeX = x - tableroAncho/2`, `threeZ = y - tableroAlto/2`, `threeY = espesor/2`.

## Exportaciones

- SVG/PNG: generar en `/app/data/exports/` con nombres únicos (incluir timestamp o UUID).
- PDF: ReportLab para cotizaciones, cut lists y etiquetas.
- CSV: reportes de eficiencia y proyectos.
- Servir archivos estáticos desde `/app/data/exports/` bajo `/api/v1/exports/` o similar.
