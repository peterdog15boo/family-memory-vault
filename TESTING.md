# Testing

Family Memory Vault uses [Vitest](https://vitest.dev/) for a practical, mostly DB-free test suite focused on critical business logic.

## Run tests

```bash
npm test
```

Watch mode while developing:

```bash
npm run test:watch
```

## What’s covered

| Area | Location | Focus |
|------|----------|--------|
| Storage quotas | `src/lib/billing/quotas.test.ts` | `canAcceptUpload`, formatters, usage levels |
| Permissions | `src/lib/permissions.test.ts` | `roleHasCapability`, `isSafeToServe` |
| Moderation decisions | `src/lib/moderation/decide-moderation.test.ts` | `decideModerationStatus` |
| Plan limits / catalog | `src/lib/plans/gates.test.ts` | catalog, advanced themes, `assertGateAllowed` |
| API helpers | `src/lib/http/api-helpers.test.ts` | error shape, rate limit, sanitize, upload Zod schemas |

These are **unit / contract tests**. They do not require Neon, R2, Clerk, or Stripe credentials.

## Adding tests

1. Put files next to the code as `*.test.ts` (or under the same folder).
2. Prefer pure functions and small fixtures — avoid live DB calls.
3. For DB-backed helpers later, mock `@/lib/db` with Vitest (`vi.mock`).

## Config

- `vitest.config.ts` — aliases `@/` → `src/`
- `vitest.setup.ts` — sets `NODE_ENV=test`

React Testing Library is installed for future component tests (`environment: "jsdom"` per-file when needed).
