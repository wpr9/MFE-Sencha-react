# Status — management review prep (target: Monday 2026-10-26)

User decision: **Module Federation** (Piral considered and rejected). Goal: production-level review;
show every required concept, explicitly including **data from shell → remotes** and **remote → remote**.
Later asks (2026-10-25): deep **security + architecture overview** following Google's battle-tested
practices ("secure and scalable"); **quality over quantity**; **no deployment anywhere**; afterwards a
**small presentation: Nx Module Federation vs Piral for the Sencha migration** (arguments for a meeting).

## Done before this task

Workspace, contracts/platform/react-sdk/ui/tokens/formatting/dev-host libs, shell, 3 React remotes,
Ext JS blotter, mock BFF, Docker/nginx topology, CI workflow, README + docs/architecture + 6 ADRs.
Sign-in 403 (Origin null) fixed. Visual polish pass done via headless browser (light + dark).

## Current task checklist

1. [x] **Crash fix** — `this.callParent()` in strict-mode ES modules (Ext controllers' `destroy`),
       guarded teardown in `RemoteOutlet`/`defineExtRemote`, page-level `errorElement`. Verified.
2. [x] **Communication demos** — shell page **Trading desk** (`/desk`), verified in the browser:
       Ext blotter widget (props `limit`/`interaction`, `hostpropschange`, publishes `order.focused`,
       follows `security.focused` + workspace portfolio, server-side `symbol` filter), React
       `trading/SecurityInsight` (follows both events, intraday chart from `GET /api/quotes/:symbol/intraday`,
       Buy/Sell intents), `trading/MoversWidget` (`interaction: 'focus'` publishes `security.focused`),
       shell **Message flow** panel.
3. [ ] **Locale switch** in Settings → all remotes incl. Ext re-format live. (Optional; lower priority.)
4. [x] **Resilience demo** — _Platform → Micro-frontends → Resilience drill_ (`setOutageSimulated` in
       `apps/shell/src/app/remotes.ts`); verified: contained errors, rest works, recovery.
5. [ ] ~~Concepts tour tab~~ — replaced by the security & architecture overview doc (quality > quantity).
6. [x] **Review findings** (4 reviewers; each finding verified in code, most reproduced):
   - BFF security (7): LIMIT-price compliance bypass (`domain/pricing.ts`), rate-limit key from
     validated session (hashed), `TRUST_PROXY_HOPS`, `/healthz` exempt, `returnTo` URL-normalised,
     zod query validation (422), SSE cap 5/session, compliance fields need-to-know (`null` without
     `compliance:read`, UI hides them), mock-only route gated by `AUTH_MODE`. Re-exploited: all closed
     (`scratchpad/verify_bff.py`).
   - React remotes (12): order ticket (limit reset/prefill once, current-only compliance gating,
     oversell, debounce loop, a11y), market deep-link scroll, alert scroll once, portfolio context only
     after load, push-driven invalidation, full security master, date-only parsing (`parseDate`),
     summary list a11y, four-eyes UI gating.
   - Shell/platform (14): focus-trap fight (shell overlays `disableEnforceFocus`; reproduced + fixed),
     remote route `errorElement` (`RemoteRouteError`), listener isolation (`listeners.ts`), stream stops
     with session, absolute-limit dialog, clock skew (`serverTime`), first-activity keep-alive, one
     Emotion cache per remote, registry per-entry validation, soft retry, a11y (tooltips, picker,
     modifier clicks), POP→replace, global error/rejection → telemetry.
   - Ext JS remote (11): record payload copies, Triton `:focus` reset removed (halves loaded directly),
     deep-link scope/search split + `vm.notify()`, resumable loading, locale follows shell, proxy
     cancels superseded reads + `then(ok, fail)`, actions upsert server answer, widget error state +
     self-healing reload, prompt height. Deep link + focus ring verified in the browser.
7. [x] **Strict CSP** (Google strict CSP: nonce + `'strict-dynamic'`), enforced in dev (`tools/mf/csp.ts`,
       shell `security.nonce`) and prod (nginx `$request_id` nonce + `sub_filter`, HTML `no-store`, verified in
       a local container). Only report: benign Ext feature probe (`detectPlatformTags` sets `on…=""`).
8. [x] Docs: `docs/security-architecture-review.md` (Google practices, STRIDE, scalability, SLOs,
       path to prod), ADR-0007 strict CSP, ADR-0002/0003 updated, architecture.md, README demo script,
       CI supply chain (audit gate, `--ignore-scripts`, dependency review, CodeQL, provenance/SBOM),
       Dependabot, CODEOWNERS.
9. [x] Final verification (2026-10-25): typecheck 13/13, lint 0 errors, 41 tests, 6 prod builds,
       5 personas light + dark in headless Chromium, BFF exploit re-runs, nginx `-t` + nonce runtime check.
10. [x] **Presentation: Nx MF vs Piral** — 11-slide deck (private claude.ai artifact, owner must share it):
        https://claude.ai/artifact/WAtSPrb6trMYjLQwnQz3o5 · decision record with sourced facts:
        `docs/adr/0008-module-federation-over-piral.md`.

## Code-quality pass (2026-10-25, after the security pass)

Staff-level review of the whole codebase for simplicity, efficiency, comments and Google
engineering practices; four parallel reviewers (shell, React remotes, Ext JS blotter, BFF + deploy)
plus a manual review of the shared libraries. Every finding verified in code before fixing.

- **Deployment leaks closed:** the standalone dev host no longer ships in production remote bundles
  (`tools/mf/define-remote.ts`, dev-only entry); BFF production default has no simulated latency;
  SIGTERM drains SSE streams and exits in milliseconds (verified: 26 ms with a live stream);
  `/healthz` exempt from rate limit and request logs; unprivileged nginx with health checks;
  environment name comes from the runtime registry (`ENVIRONMENT`), not the build.
- **Simplicity:** one module registry in the shell (`modules.ts`), `RemoteCard`, `useShellIntents`
  (no `as never`), `describeError`/`isHttpError` in contracts (no structural casts in remotes),
  `FlashValue`/`ListSkeleton`/`SecurityCell` in `@meridian/ui`, `HostViewController` base class and
  one `actionsFor()` rule in the blotter, table-driven compliance rules reading limits from `RULES`,
  portfolio definitions and the seed plan split out as data, order ticket and portfolio detail split
  into focused files. Dead code removed (unused contract surface, `Can`, `SideTag`, `summary()`,
  `statusLabel`, unused icons, CSS that never matched).
- **Efficiency:** order form no longer re-renders per quote tick (estimate/quote panels own the
  subscription); charts and allocation bars memoised; market filter split from the quote join; blotter
  counts computed once per change; widget no longer double-renders per load; portfolio history
  statistics computed once; SSE frames serialised once per event; permission set per session.
- **Correctness found along the way:** `requirePermission` now fails closed; `requireSession`
  problem text defined once; date-only values parsed as calendar dates; `formatRelativeTime`
  localised; intent payloads validated at the shell boundary.
- **Comments:** doc comments on every exported API; stale pointers fixed; WHY comments on the
  non-obvious parts (focus traps, strict-mode Ext, CSP, double-render, fan-out).
- **Verification:** typecheck/lint/test/build green for 13 projects (run with `NO_COLOR=1`; coloured
  output had hidden errors from grep once), all personas in headless Chromium, BFF exploit re-runs,
  nginx templates parsed in the unprivileged image, graceful-shutdown test.
- **Deferred (documented, not done):** i18n plurals (needs the locale switch), SHA-pinning GitHub
  actions (no network here; Dependabot keeps them fresh), `DOM` lib in the BFF tsconfig (needed by the
  design-tokens barrel), `undici` override rationale unknown.

## How to verify

Headless driver (session scratchpad; an agent deleted the first copy, now in `driver/`):
`/private/tmp/claude-501/-Users-wiaczeslaw-Documents-Code-MF-React-with-Sencha/3eb5708c-1c20-461a-a130-730587c1e0a8/scratchpad/driver/drive.mjs`
— `node drive.mjs "<Persona>" step1,step2` (steps: navclicks, home, orders, portfolios, ticket,
ticketkeys, market, compliance, platform, palette, desk, notfound; `THEME=dark`). Prints CSP violations.
Screenshots in `scratchpad/shots/`. BFF exploit checks: `python3 -I scratchpad/verify_bff.py`.
Stack: `npx nx run shell:serve` (BFF restarted separately with `npx tsx watch … apps/bff/src/main.ts`).
