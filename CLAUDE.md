# Meridian — guidance for Claude Code

Micro-frontend investment workspace POC: Nx 23 monorepo, Module Federation 2 on Rsbuild 2 / Rspack 2,
React 19 shell + React remotes (portfolio, trading, compliance) + a **Sencha Ext JS 6.2** remote
(blotter), mock BFF on Fastify 5. Being prepared for a **production-level management review**.

**Current work and progress: read [docs/STATUS.md](docs/STATUS.md) first** and keep it updated.

## Commands

- `npx nx run shell:serve` (= `npm start`): whole stack with HMR. Shell http://localhost:4200, remotes
  4201 portfolio, 4202 trading, 4203 compliance, 4204 blotter, BFF 3333. Sign in by clicking a persona.
- `npx nx serve <remote>` + `npx nx serve bff`: one remote standalone (dev host from `@meridian/dev-host`).
- `npx nx run-many -t typecheck lint` and `npx nx run-many -t build`: must stay green.
  When grepping their output, set `NO_COLOR=1 FORCE_COLOR=0`: ANSI codes split `error TS1234` and hide errors.
- `npx prettier --write "apps/**/*.{ts,tsx,js,css}" "libs/**/*.{ts,tsx}"` after edits (printWidth 100).
- `docker compose up --build`: production-like topology on :8080 (remotes on 8081-8084).

## Architecture (where things live)

- `libs/shared/contracts`: Host API, lifecycle contract (`mount/update/unmount`), events, intents,
  permissions, zod DTOs. Remotes depend only on this + `react-sdk`/`ui` (enforced by Nx tags in
  `eslint.config.mjs`).
- `libs/shared/platform`: shell runtime (event bus, host store, http, SSE, market data, session,
  intents, notifications, telemetry, flags) → `createPlatform()` issues a scoped `HostApi` per remote.
- `libs/shared/react-sdk`: `defineReactRemote()` (own root, QueryClient, Emotion cache, memory router
  synced with the shell URL) and hooks. `libs/shared/ui`: MUI theme from `libs/shared/design-tokens`.
- `apps/shell/src/app`: router, `RemoteOutlet` (mounts any remote), layout, pages, `wiring.ts`
  (intents + notifications), `remotes.ts` (runtime registry `/config/remotes.json`, contract check).
- `apps/blotter`: `src/remote/*` integration (TypeScript), `src/ext/**` Ext JS classes, `src/styles`
  Material skin via `--mrd-*` CSS variables. Ext runtime vendored in `public/vendor/extjs/6.2.0`.
- `apps/bff`: mock IdP + sessions (`auth/`), security hooks (`http/`), simulated domain (`domain/`),
  REST (`routes/api.ts`) and SSE (`routes/stream.ts`).

## Gotchas (learned the hard way)

- **Ext classes are ES modules ⇒ strict mode ⇒ `this.callParent()` breaks** (Ext 6 uses
  `Function.caller`, which is null for strict callers → `Cannot read properties of null (reading
'apply')`). Call the superclass explicitly: `Blotter.view.HostViewController.prototype.destroy.call(this)`.
  Ext view controllers extend `Blotter.view.HostViewController` (host subscriptions, dispatch,
  focus, flash, density/locale) rather than `Ext.app.ViewController` directly.
- Remote `src/index.ts` only imports the dev host behind `import.meta.env.DEV`: production bundles
  contain no dev host and no `index.html` (see `tools/mf/define-remote.ts`, shared by all remotes).
- Shell: federated modules are listed once in `apps/shell/src/app/modules.ts`; errors shown to users go
  through `describeError()` from `@meridian/contracts`; shell-originated intents go through
  `useShellIntents()`.
- Remote unmounts must never throw into React: `RemoteOutlet` and `defineExtRemote` wrap teardown.
- Rsbuild 2 enables `lazyCompilation` by default; it must stay **off** for federated apps.
- MF share policy: only the React family is shared (`tools/mf/shared.ts`); each remote bundles its own
  MUI with a unique Emotion cache key. The dev console's Emotion "loaded twice" warning is expected.
- Price _changes_ use `f.signed()`, never `f.price()` (4 decimals for |x| < 1).
- MUI X DataGrid: wrap custom cell content in `<GridCell>` (from `@meridian/ui`) to centre it.
  MUI X Charts 9 area selector: `.MuiLineChart-area[data-series="<id>"]`.
- BFF sign-in page needs `Referrer-Policy: same-origin`, otherwise browsers post `Origin: null`.
- nginx `add_header` is not inherited into locations that define their own; include the snippet.
- `__Host-` cookies are only cleared by a Set-Cookie carrying the attributes they were set with:
  always `reply.clearCookie(name, cookieBase)`, never `{ path: '/' }` alone.
- Order routes answer **404, not 403**, for orders in portfolios the caller is not entitled to
  (`orderFor()` in `routes/api.ts`): sequential ids would otherwise be an oracle.
- Everything the Host API hands out is deep-frozen (session, env, quotes, event payloads; `deepFreeze`
  in `libs/shared/platform/src/lib/freeze.ts`); copy before mutating. `Blotter.data.HostProxy` is
  read-only; writes go through `host.http.post`. `host.navigation.navigate` and intent payloads are
  validated at the shell boundary (`isInternalPath`, `IntentPayloadSchemas`).
- Every HTML sink in the blotter encodes (`F.encode`, `:htmlEncode`, allow-listed class suffixes), and
  the CSV export neutralises formula prefixes; keep both when adding renderers or columns.
- `TRUST_PROXY_HOPS` defaults to 0 (no proxy); `docker-compose.yml` sets 1 behind the nginx ingress.

## Working agreements with the user

- Authentication stays **mocked** (mock IdP page in the BFF).
- Repository: https://github.com/wpr9/MFE-Sencha-react (public, branch `main`). Commit and push only
  when asked. No vendor names in the repo: the product it resembles is never mentioned.
- **Follow Google's published, battle-tested practices** (strict CSP, Fetch Metadata, SRE/SLOs, SLSA,
  OWNERS) and cite them; the mapping lives in `docs/security-architecture-review.md`.
- **Quality over quantity.** Fewer features, each verified and finished to production standard.
- **No deployment anywhere.** The POC is demoed locally (`npx nx run shell:serve`). Docker/nginx files
  stay in the repo as the reference production topology only; nothing is pushed or hosted.
- Do not add unit/e2e test suites unless asked. Verify by driving the running app in headless
  Chromium with **real in-app navigation clicks** (not only `page.goto`), reading screenshots and
  console errors; plus typecheck/lint/build.
