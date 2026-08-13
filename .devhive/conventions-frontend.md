# Convenciones de frontend — CutterNest

Stack: React 18 + Vite + TypeScript + Three.js + Tailwind CSS.

## Estructura

```
frontend/src/
├── App.tsx              # Router principal
├── main.tsx             # Entrypoint React
├── index.css            # Tailwind directives + variables CSS
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── TOTPVerify.tsx
│   │   ├── GuestLogin.tsx
│   │   └── BackupCodes.tsx
│   ├── optimizer/
│   │   ├── PiezaForm.tsx
│   │   ├── TableroConfig.tsx
│   │   ├── PiezasList.tsx
│   │   ├── OptimizerResults.tsx
│   │   ├── Layout2D.tsx
│   │   └── Tablero3D.tsx
│   ├── mueble/
│   │   ├── Mueble3D.tsx
│   │   └── AssemblySteps.tsx
│   ├── taller/
│   │   ├── CutListPDF.tsx
│   │   ├── EtiquetasPDF.tsx
│   │   └── InventoryManager.tsx
│   ├── cotizacion/
│   │   ├── HardwareForm.tsx
│   │   ├── QuoteResult.tsx
│   │   └── QuotePDF.tsx
│   └── templates/
│       ├── TemplateSelector.tsx
│       └── TemplateParams.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useOptimizer.ts
│   └── useThreeScene.ts
├── types/
│   └── index.ts
├── utils/
│   └── threeHelpers.ts
└── services/
    └── api.ts
```

## Reglas de código

- Componentes: PascalCase, funciones con hooks.
- Hooks: `useAuth` para contexto global; `useOptimizer` para estado de optimización; `useThreeScene` para inicialización de Three.js.
- API calls: siempre usar `services/api.ts` base; nunca fetch directo esparcido en componentes.
- Manejo de errores: mostrar mensaje al usuario en español + `console.error`.
- Interceptor de 401: intentar refresh del access token; si falla, redirigir a `/login`.
- Tipos: definir en `frontend/src/types/index.ts` y reutilizar; evitar `any`.

## Estilos y Tailwind

- **No hardcodear colores**: usa clases de Tailwind (`bg-primary`, `text-slate-800`, `border-gray-200`) o variables CSS definidas en `index.css`. No escribas valores hexadecimales o RGB directamente en componentes.
- **Responsive**: diseñar primero para tablet (≥1024px) y desktop (≥1920px). Usar clases Tailwind (`md:`, `lg:`, `xl:`) para adaptaciones.
- **Touch targets**: controles interactivos mínimo 44×44 px; usar padding Tailwind adecuado (`p-3` mínimo).
- **Modales**: preferir componentes simples con Tailwind; dialog centrado en desktop, pantalla completa o bottom sheet en móvil si aplica.
- **Variables CSS**: centralizar en `frontend/src/index.css` para colores de marca y espaciado si Tailwind no cubre el caso.

## Seguridad frontend

- **Nunca** almacenar `accessToken` ni `refreshToken` en `localStorage`.
- Solo datos no sensibles de sesión guest pueden usar `localStorage` para exportar/importar proyectos temporales.
- Las cookies de autenticación deben ser `httpOnly` cuando el backend las use; el frontend no lee tokens de respuesta JSON.
- No mostrar secrets, JWT ni QR de otros usuarios en pantalla.

Ver detalles de seguridad en [conventions-auth.md](./conventions-auth.md).

## Three.js y 3D

- Usar `@react-three/fiber` + `@react-three/drei` para simplificar el ciclo de vida en React.
- Cada pieza se renderiza como `Box` con dimensiones reales (`ancho`, `espesor`, `alto`) y posición mapeada desde el optimizador.
- Usar el color definido por el usuario en el formulario para cada pieza, tanto en SVG como en 3D.
- Respetar `prefers-reduced-motion` para animaciones de ensamblaje.
- Orbit controls para rotar/zoom; mantener 60 FPS con ≤50 piezas.

## Cómo consultar ui-ux-agent

Cuando un agente de implementación necesite orientación UI/UX, usar el formato inter-agente y pedir una recomendación concreta. Ejemplo:

```markdown
[INTER-AGENT MESSAGE]
From: frontend-agent
To: ui-ux-agent
Subject: Diseño responsive del selector de plantillas

Context: Creando `TemplateSelector.tsx` para tablet y desktop.
Request: ¿Bottom sheet, grid o lista lateral? Recomendación de breakpoints, touch targets y tokens de Tailwind.
Priority: Medium
```

El `ui-ux-agent` responderá con principios de diseño, tokens recomendados y notas de accesibilidad. No escribe código de implementación.
