# Convenciones de tests — CutterNest

Stack:
- **pytest** para el backend (`backend/tests/`).
- **Vitest** + React Testing Library para el frontend React (`frontend/src/`).
- **node --test** para el Assembly Planner vanilla JS (`frontend/public/assembly-planner/`).

## Cobertura

- Objetivo: >80% de cobertura de statements en backend y frontend.
- Backend actual: por establecer.
- Frontend actual: por establecer.

## Ejecución

```bash
# Backend
cd backend && pytest
# o dentro del contenedor
docker exec cutternest-backend pytest

# Frontend
cd frontend && pnpm test

# Frontend con cobertura
pnpm test -- --coverage

# Assembly Planner (vanilla JS, node --test)
cd frontend/public/assembly-planner && node --test "js/**/*.test.js" "js/*.test.js"

# Build backend/frontend deben pasar antes de cerrar una tarea
cd backend && python -m compileall app/
cd frontend && pnpm build
```

## Mocks y aislamiento

- En tests de frontend, si un componente o hook usa `useAuth`, `useOptimizer`, `useThreeScene` o cualquier contexto, preferir mockear el hook antes de envolver cada test con múltiples providers, para mantener los tests unitarios aislados.
- En tests de backend, mockear servicios externos cuando existan (WhatsApp, SMS, Redis en Fase 2). En MVP, mockear SQLite con una base en memoria (`sqlite:///:memory:`) o archivo temporal.

## Qué tests correr

- **Cambios en backend**: tests unitarios del servicio/ruta modificada, luego suite completa de backend (`pytest`).
- **Cambios en frontend**: tests del componente/hook modificado, luego suite completa de frontend (`pnpm test`).
- **Cambios de E2E / flujo auth**: suite Playwright cuando el entorno Docker esté disponible (post-MVP).
- **Type-check** debe ejecutarse antes de tests para detectar errores de TypeScript de forma rápida:
  ```bash
  cd frontend && pnpm typecheck
  ```
- **Lint** de Python con `ruff` o `flake8` si está configurado; ejecutar antes de tests:
  ```bash
  cd backend && ruff check app/
  ```

## Tests específicos de dominio

- **Optimizador**: verificar que piezas caben en tableros, respetan rotación, kerf y márgenes; generar el ejemplo de estantería en ≤2 tableros.
- **Cotización**: verificar cálculo de material, hardware, mano de obra y margen.
- **Auth**: registro, login TOTP, refresh, logout, generación y uso de Guest PIN, expiración de PIN.
- **Inventario**: agregar tablero, marcar consumido, listar sobrantes, auto-registro de sobrantes tras optimización.
- **Three.js helpers**: verificar mapeo de coordenadas rectpack → Three.js y cálculo de dimensiones.
