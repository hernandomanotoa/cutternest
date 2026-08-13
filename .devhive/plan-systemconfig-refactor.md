# Plan: Refactor `SystemConfig.tsx`

## Goal

Split `frontend/src/components/SystemConfig.tsx` (928 lines) into small, testable, single-responsibility pieces: a stateful hook, reusable subcomponents, and one thin orchestrator component. Improve type safety by removing `any`, replace inline styles with CSS classes/tokens, and keep 100% of existing behavior and tests.

---

## Current problems

| Problem | Evidence in current file | Impact |
|---------|--------------------------|--------|
| Component does too much | 928 lines; handles 6 config sections, 6 test flows, save, status polling, badges, tabs | Hard to read, test, and maintain. |
| UI + logic mixed | `useState`, `useEffect`, API calls, JSX all in one file | Any change risks breaking unrelated sections. |
| Repeated handler pattern | `updateLdap`, `updateSmtp`, `updateSms`, `updateWhatsApp`, `updateTunnels`, `updateSecurity` | DRY violation; easy to introduce drift. |
| Inline styles | `style={{ marginTop: 'var(--space-4)' }}` etc. | Inconsistent with token-first design; harder to keep responsive. |
| `any` types | `useState<any>` for `ldapTestResult`, `whatsAppStatus`, `smsStatus`, `smtpStatus` | Type safety loss. |
| Test handlers duplicated | `handleLdapTest`, `handleSmtpTest`, `handleSmsTest`, `handleWhatsAppTest` share structure but are copied. | Difficult to update error handling consistently. |

---

## Proposed structure

```
frontend/src/components/system-config/
├── SystemConfig.tsx              # orchestrator: tabs, layout, save button
├── LdapConfigTab.tsx             # LDAP form + test
├── SmtpConfigTab.tsx             # SMTP form + test
├── SmsConfigTab.tsx              # SMS form + test
├── WhatsAppConfigTab.tsx         # WhatsApp form + test + reconnect/reset
├── TunnelsConfigTab.tsx          # Cloudflare + Tor + quick tunnel URLs
├── SecurityConfigTab.tsx         # Security params
├── ConfigTabs.tsx                # tab buttons
├── StatusBadge.tsx               # WhatsApp connection badge
├── useSystemConfig.ts            # main state, load, save, generic updateSection
├── useConfigServiceTest.ts       # generic test runner + status refresh
├── useLdapTest.ts                # LDAP-specific test state
├── useSmtpTest.ts                # SMTP-specific test state
├── useSmsTest.ts                 # SMS-specific test state
├── useWhatsAppTest.ts            # WhatsApp-specific test + reconnect/reset
└── SystemConfig.test.tsx         # moved/updated from parent
```

> All new components and hooks must be **under 250 effective lines**.

---

## Files to change

### Modified
- `frontend/src/components/SystemConfig.tsx` — reduced to ~180-220 lines; only orchestrates tabs and save.
- `frontend/src/types/api.ts` — add `LdapTestResult`, `SmsStatusResponse`, `SmtpStatusResponse`, `WhatsAppStatusResponse` to imports if needed; add a dedicated `SystemConfigFormData` type (optional, can stay in `SystemConfig.tsx` if not reused).
- `frontend/src/components/SystemConfig.test.tsx` — keep existing tests; update imports only if DOM changes.

### Created
- `frontend/src/components/system-config/SystemConfig.tsx` (new orchestrator)
- `frontend/src/components/system-config/LdapConfigTab.tsx`
- `frontend/src/components/system-config/SmtpConfigTab.tsx`
- `frontend/src/components/system-config/SmsConfigTab.tsx`
- `frontend/src/components/system-config/WhatsAppConfigTab.tsx`
- `frontend/src/components/system-config/TunnelsConfigTab.tsx`
- `frontend/src/components/system-config/SecurityConfigTab.tsx`
- `frontend/src/components/system-config/ConfigTabs.tsx`
- `frontend/src/components/system-config/StatusBadge.tsx`
- `frontend/src/hooks/useSystemConfig.ts`
- `frontend/src/hooks/useConfigServiceTest.ts`
- `frontend/src/hooks/useLdapTest.ts`
- `frontend/src/hooks/useSmtpTest.ts`
- `frontend/src/hooks/useSmsTest.ts`
- `frontend/src/hooks/useWhatsAppTest.ts`
- `frontend/src/components/system-config/SystemConfig.module.css` (or use global classes)

### Deleted
- `frontend/src/components/SystemConfig.tsx` (after new orchestrator is imported by `App.tsx`)
- `frontend/src/components/SystemConfig.test.tsx` (moved to `system-config/SystemConfig.test.tsx`)

> **Note:** `App.tsx` imports `SystemConfig` from the new directory.

---

## State ownership

| State | Owner | Notes |
|-------|-------|-------|
| `form` (SystemConfigForm) | `useSystemConfig` | Single source of truth for all sections. |
| `activeTab` | `useSystemConfig` | Derived from `Tab` union. |
| `loading` / `message` (save) | `useSystemConfig` | Global save feedback. |
| LDAP test state | `useLdapTest` | Wraps `useConfigServiceTest` with LDAP-specific result type. |
| SMTP test state | `useSmtpTest` | Wraps generic runner + status refresh. |
| SMS test state | `useSmsTest` | Wraps generic runner + status refresh + code display. |
| WhatsApp test state | `useWhatsAppTest` | Wraps runner + status refresh + reconnect/reset. |
| WhatsApp status badge | `useSystemConfig` polls every 5s when tab is active | Shared with tabs via props. |
| SMS/SMTP status | `useSmsTest` / `useSmtpTest` | Fetched on tab activation. |

---

## Hook signatures

### `useSystemConfig`

```ts
interface UseSystemConfigResult {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  form: SystemConfigForm
  updateSection: <S extends keyof SystemConfigForm>(
    section: S,
    field: keyof SystemConfigForm[S],
    value: SystemConfigForm[S][typeof field]
  ) => void
  loading: boolean
  message: string
  save: () => Promise<void>
  whatsAppStatus: WhatsAppStatusResponse | null
}

export function useSystemConfig(): UseSystemConfigResult
```

- `updateSection` replaces the 6 `updateX` helpers.
- `save` builds `ldapPayload` and `smtpPayload` omitting empty passwords unless provided.

### `useConfigServiceTest<TRequest, TResult, TStatus>`

```ts
interface UseConfigServiceTestResult<TStatus, TResult> {
  loading: boolean
  message: string
  status: TStatus | null
  test: (request: TRequest) => Promise<void>
  refreshStatus: () => Promise<void>
}

export function useConfigServiceTest<TRequest, TResult, TStatus>({
  testApi,
  statusApi,
  onSuccess,
}: {
  testApi: (req: TRequest) => Promise<AxiosResponse<{ success: boolean; message?: string; error?: string; code?: string } & TResult>>
  statusApi: () => Promise<AxiosResponse<TStatus>>
  onSuccess?: (res: TResult) => void
}): UseConfigServiceTestResult<TStatus, TResult>
```

- Returns a generic runner that sets `loading`, `message`, and refreshes status.
- Specific hooks (`useLdapTest`, `useSmtpTest`, etc.) provide concrete request/result/status types and call this generic hook.

---

## Component contracts

### `ConfigTabs`

```ts
interface ConfigTabsProps {
  activeTab: Tab
  onChange: (tab: Tab) => void
  disabled?: boolean
}
```

Renders the 6 tab buttons. Replaces inline `tabButton` helper.

### `StatusBadge`

```ts
interface StatusBadgeProps {
  status: WhatsAppStatusResponse | null
}
```

Renders "Conectado", "Esperando QR", "Conectando", "Desconectado".

### Section tabs

```ts
interface ConfigTabProps<S> {
  form: SystemConfigForm[S]
  onChange: (field: keyof SystemConfigForm[S], value: unknown) => void
}

// For tabs with tests:
interface TestableConfigTabProps<S> extends ConfigTabProps<S> {
  testProps: LdapTestProps | SmtpTestProps | SmsTestProps | WhatsAppTestProps
}
```

Each tab is a thin component that:
- Uses `FormGrid` for layout.
- Renders labels + inputs bound to `form[section]`.
- Includes the test section where applicable.
- Does **not** call API directly.

---

## Types to add

Move `SystemConfigForm` and `Tab` from `SystemConfig.tsx` to a dedicated file:

```ts
// frontend/src/types/systemConfig.ts
export type Tab = 'ldap' | 'smtp' | 'sms' | 'whatsapp' | 'tunnels' | 'security'

export interface SystemConfigForm {
  ldap: LdapConfig & { bindPassword: string }
  smtp: SmtpConfig & { pass: string }
  emailOtp: EmailOtpConfig
  sms: SmsConfig
  whatsapp: WhatsAppConfig
  tunnels: TunnelsConfig
  security: SecurityConfig
}
```

Update `configApi.getConfig` return type to use these types.

---

## CSS / tokens

- Replace all inline `style={{ ... }}` with CSS classes.
- Add utility classes to `frontend/src/styles/global.css` if needed:
  - `.mt-space-1` ... `.mt-space-6`
  - `.mb-space-1` ... `.mb-space-6`
  - `.form-grid__full` (already exists)
  - `.status-badge` variants already exist.
- Keep using `FormGrid`, `MobileModal` (not needed here), and existing button classes.

---

## Testing strategy

1. Keep existing `SystemConfig.test.tsx` assertions on save, tabs, and error messages.
2. Move the test file to `system-config/SystemConfig.test.tsx` and update imports.
3. Add focused tests for each hook:
   - `useSystemConfig.test.ts` — load, save, updateSection, status polling.
   - `useConfigServiceTest.test.ts` — generic runner success/error paths.
4. Add component tests for tabs only if they introduce new logic (they should be pure UI, so hook tests cover behavior).

---

## Implementation order

| Step | Task | Owner | Deliverable |
|------|------|-------|-------------|
 1 | Create types file `frontend/src/types/systemConfig.ts` and update `configApi` types. | frontend-agent | PR-ready diff |
 2 | Implement `useSystemConfig` hook with `updateSection` and save. | frontend-agent | Hook + unit test |
 3 | Implement `useConfigServiceTest` and service-specific test hooks. | frontend-agent | Hooks + unit tests |
 4 | Create `ConfigTabs`, `StatusBadge`, and 6 section tab components. | frontend-agent | Components + tests |
 5 | Rewrite `SystemConfig.tsx` as thin orchestrator importing the new pieces. | frontend-agent | Component + updated tests |
 6 | Update `App.tsx` import path. | frontend-agent | Import update |
 7 | Run `pnpm typecheck`, `pnpm test`, `pnpm build`. | integration-validator | Pass report |
 8 | `ui-ux-agent` review for HIG/tokens compliance. | ui-ux-agent | Review comments |

---

## Acceptance criteria

- [ ] `SystemConfig.tsx` is reduced to ≤220 lines.
- [ ] Every new component and hook is ≤250 lines.
- [ ] No `any` types remain in the refactored code.
- [ ] No inline `style={{ ... }}` in the refactored code.
- [ ] `updateSection` replaces the 6 `updateX` helpers.
- [ ] All existing `SystemConfig.test.tsx` tests pass (or equivalents moved to new location).
- [ ] `useSystemConfig` and `useConfigServiceTest` have unit tests.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` frontend passes (223/223).
- [ ] `pnpm build` frontend passes.
- [ ] `ui-ux-agent` approves token usage and HIG compliance.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Test breakage due to DOM restructuring | Keep test selectors and assertions as close as possible; move file, not rewrite tests. |
| Password-empty logic regression | Extract `buildLdapPayload` / `buildSmtpPayload` as pure helpers with dedicated tests. |
| Polling side effects leak | Move intervals into `useSystemConfig`; verify cleanup in tests. |
| Type mismatch between configApi and form | Create shared `SystemConfigForm` type used by both. |
| Inline styles lost during refactor | Audit with `ui-ux-agent` before finalizing. |

---

## Notes

- This refactor is **frontend-only**. No backend API changes.
- No new npm dependencies.
- The orchestrator keeps the same public props (`export default function SystemConfig()`) so `App.tsx` only changes its import path.
- The `configApi.saveConfig` payload construction stays functionally identical.

---

*Plan created by DevHive architect / frontend-agent under Guardian token `GUARD-PLAN-SYSTEMCONFIG-20260806`.*
