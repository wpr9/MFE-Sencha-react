# ADR-0007: Strict CSP (nonce + `'strict-dynamic'`) for a federated frontend

**Status:** accepted

## Context

The shell loads scripts from several origins at runtime: each remote's
manifest and chunks, and the Ext JS framework. The first policy allow-listed
those origins (`script-src 'self' <remote origins>`). Google's research on
real-world policies (Weichselbaum et al., _CSP Is Dead, Long Live CSP!_,
CCS 2016) found ~95% of allow-list policies bypassable (JSONP endpoints,
script gadgets and open redirects on allowed hosts). Google's recommendation
is a _strict_ CSP ([web.dev/strict-csp](https://web.dev/articles/strict-csp)).

## Decision

- `script-src 'nonce-{random}' 'strict-dynamic' 'unsafe-eval' https: 'unsafe-inline'`,
  plus `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` and
  `form-action 'self'`. Styles, fonts, images and `connect-src` keep the remote
  origins.
- **Only the shell's own entry scripts carry the nonce.** `'strict-dynamic'`
  extends that trust to scripts they create: the Module Federation runtime
  injects remote entries and chunks, and the blotter injects Ext JS. A remote
  can therefore move to a new origin or CDN without a policy change.
- `https:` and `'unsafe-inline'` in `script-src` are ignored by CSP3 browsers
  when a nonce and `'strict-dynamic'` are present. They only keep legacy
  browsers working.
- **Production:** the HTML carries a `__CSP_NONCE__` placeholder (Rsbuild
  `security.nonce`). nginx replaces it with `$request_id` (128 random bits per
  response) and sends the matching header. The HTML is `no-store` with no
  ETag: a cached copy would carry a nonce the next policy no longer allows.
- **Development** enforces the same policy (one random nonce per dev-server
  process), so violations surface while coding rather than in production.
  Single source: `tools/mf/csp.ts`.

## Consequences

- No host allow-list to maintain or bypass. An injected `<script>` (XSS) has
  no nonce and does not run.
- `'unsafe-eval'` remains while Ext JS is on the page (XTemplate compiles
  functions); it goes when the Ext views are migrated.
- Ext's feature detection probes event support by setting an empty `on…=""`
  attribute on a detached element. The policy blocks it, producing one benign
  report per page load and no functional effect. We keep the policy strict
  rather than add `'unsafe-hashes'` for a no-op.
- Next steps: a `report-to` endpoint for violations, then Trusted Types in
  report-only mode (enforcement is blocked by Ext JS `innerHTML` usage).
