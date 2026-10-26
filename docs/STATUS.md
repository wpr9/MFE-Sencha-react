# Status — management review prep (demo: Tuesday 2026-10-27)

User decision: **Module Federation** (Piral considered and rejected). Goal: production-level review;
show every required concept, explicitly including **data from shell → remotes** and **remote → remote**.
Later asks: deep **security + architecture overview** following Google's battle-tested practices;
**quality over quantity**; **no deployment anywhere**; a **presentation: Nx Module Federation vs Piral**;
two staff-level code reviews (2026-10-25 and 2026-10-26); the repo pushed to GitHub with a
**zero-filler README** for engineers and CTOs; **no vendor-product mentions** anywhere in the repo.

Repository: https://github.com/wpr9/MFE-Sencha-react (public). Deck: https://claude.ai/artifact/WAtSPrb6trMYjLQwnQz3o5
(private artifact; ADR-0008 holds the decision record).

## Done

Workspace, contracts/platform/react-sdk/ui/tokens/formatting/dev-host libs, shell, 3 React remotes,
Ext JS blotter, mock BFF, Docker/nginx reference topology, CI workflow, README, docs/architecture,
docs/security-architecture-review, 8 ADRs. Crash fix (strict-mode `callParent`), Trading desk
communication demos, resilience drill, strict CSP, the 2026-10-25 security pass (44 findings) and
code-quality pass (61 findings): all fixed and verified (see git history for the details).

## Staff-level review, 2026-10-26 (defensive programming, security, comments, architecture)

Five adversarial reviewers (BFF, shell/platform/contracts, React remotes, Ext JS blotter,
deploy/CI/docs) plus a manual pass over the trust boundaries. No P0. Every finding was verified
against the code before it was fixed; the rest of this section is what changed.

- **BFF (P1):** order routes no longer act as an existence/portfolio oracle (`orderFor()` → 404
  for non-entitled orders); `__Host-` cookies are cleared with their original attributes (sign-out
  under TLS was silently leaving the dead cookie). Also: seeded history dropped from the SSE replay
  buffer (`hub.reset()`), `Last-Event-ID` validated, SSE writes guarded after `end()`, open sells
  reserve their unfilled quantity (no cash from shares that do not exist), `/compliance/check`
  rejects unknown symbols (422) like `POST /orders`, prototype keys on the font route are 404,
  telemetry attributes capped at 32 and errors logged as a bounded projection, `x-meridian-client`
  clamped in logs, `TRUST_PROXY_HOPS` defaults to 0 (compose sets 1), performance `range` validated,
  domain seed logs through pino, comments corrected (404-before-403, cancel wording, four-eyes).
- **Platform/shell (P1):** the Host API is now frozen for real: session (deep), env, navigation,
  flags, quotes, event payloads, the `'*'` quote batch per subscriber. `setActivePortfolio` and the
  `portfolio.open` intent check entitlements; a persisted unentitled context is cleared at boot.
  Platform HTTP headers win over caller headers; API paths may not contain `?`, `#` or `..`;
  non-JSON 2xx bodies become `ContractError`. BroadcastChannel messages are schema-validated and a
  renewal revives an `expired` tab. Telemetry clips every field to the schema bounds and batches by
  bytes. Persisted preferences and flag overrides are validated. `randomId()` works outside secure
  contexts (LAN demo over http). Also: every intent payload validated (`IntentPayloadSchemas`),
  `navigate()` accepts shell paths only, registry entries must be http(s), SSE event name wins over
  the body's `type`, stream `stop()` reports offline, intent observers isolated, toast queue never
  evicts the toast on screen, flags follow session renewals, `default-src 'self'` in the CSP, store
  listeners disposable, outage drill cannot be raced by an in-flight load.
- **React remotes:** Sell prefill never sends `quantity: 0`; the ticket's submit handler re-checks
  the compliance gate; intent-supplied portfolio ids go through `canAccessPortfolio`; explicit draft
  limits are kept; the justification no longer re-runs the compliance check; NAV-zero and NaN
  guards (`useLiveHoldings`, `TrendText`, `padDomain`); `AllocationBars` memo input stabilised;
  live series bound matches the BFF history (360); utilisation grouped by portfolio id; relative
  timestamps refresh (`useNow`); focus restored after resolving an alert; `aria-pressed` filters;
  no minus icon on direction-less tiles; day-range marker clamped; detail polling stops on 403/404;
  `useIntent` toasts use `describeError`.
- **Ext JS blotter:** CSV export neutralises formula prefixes; every HTML sink encodes (unknown
  status, side, `timeInForce`, severity class allow-listed); `actionsFor` mirrors the BFF exactly
  (four-eyes on approve, separate reject); widget store `autoDestroy`; prop changes that clear the
  focus reload; `limit` ≥ 1; `groupLabel` strips ranks only for the status grouping; `HostProxy` is
  read-only; clipboard guarded outside secure contexts; ids encoded in `Ext.Msg`; justification
  capped at 500; no dangling menu separator; `TERMINAL` from contracts; no double flash on the
  stream echo; README documents the Triton pin and the lock file's real scope.
- **Deploy/CI/docs:** CI `actions: read` for Nx affected on main; CodeQL ignores vendored Ext JS
  and `dist`; nginx `^~ /api/stream` (was shadowed by the regex location), `default_type` for
  `/healthz`, snippet comment corrected; shell image creates `html/config` for the entrypoint;
  `.dockerignore` excludes `.env*`, docs and CI; `.nvmrc` 22.12 (team machines); docs corrected
  (`usePermission`, header attribution, attestation wording, ADR-0004 endpoints, blotter README).
- **Verification:** typecheck/lint/test/build green (39 tasks, 41 tests); headless Chromium for all
  five personas (light + dark, real navigation, desk flows, deep link, resilience drill, 404 page):
  no errors beyond the documented Ext CSP probe; BFF probes for every fixed behaviour
  (`scratchpad/verify_bff2.py`) and the earlier exploit re-runs all pass; nginx templates parse in
  the unprivileged image.
- **Deferred (documented):** i18n plurals; SHA-pinning actions/images (Dependabot keeps them fresh);
  bounded in-memory order/alert maps (mock only); `rsbuild preview` serves the nonce placeholder
  unreplaced (no CSP header there, so harmless); Trusted Types blocked by Ext JS.

## How to verify

Headless driver and BFF probes are session tools outside the repo (ephemeral):
`/private/tmp/claude-501/-Users-wiaczeslaw-Documents-Code-MF-React-with-Sencha/3eb5708c-1c20-461a-a130-730587c1e0a8/scratchpad/driver/drive.mjs`
(`node drive.mjs "<Persona>" step1,step2`; steps: navclicks, home, orders, portfolios, ticket,
ticketkeys, market, compliance, platform, palette, desk, notfound, deeplink, focusring, resilience;
`THEME=dark`; prints CSP violations and console problems; screenshots in `scratchpad/shots/`),
`python3 -I scratchpad/verify_bff.py` (exploit re-runs; steps 6-7 need a fresh login-rate window)
and `python3 -I scratchpad/verify_bff2.py` (this review's fixes). Stack: `npm start`. Checks:
`NO_COLOR=1 FORCE_COLOR=0 NX_DAEMON=false npx nx run-many -t typecheck lint test build`.
