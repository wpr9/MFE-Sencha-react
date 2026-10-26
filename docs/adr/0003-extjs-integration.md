# ADR-0003: Integrating the Sencha Ext JS blotter as a federated remote

**Status:** accepted

## Context

The order blotter is a legacy-style Ext JS (classic toolkit) application. It
must run inside the React shell, share its session, theme, real-time data and
navigation, and remain idiomatic Ext JS so it can be maintained by Ext
developers until it is migrated.

## Decision

- Federate only the integration layer and Ext class definitions; load the
  Ext JS framework itself as a page-level global from the remote's own origin
  (`public/vendor/extjs/<version>`), once per page.
- Set `Ext.scopeCss = true` before loading so Ext never styles `<body>`.
  Triton CSS is `x-` scoped with one exception, `:focus { outline: none }`,
  which would remove the workspace's keyboard focus ring: the two halves of
  `theme-triton-all.css` are loaded directly (CORS mode, so the sheets are
  readable) and that rule is deleted. Material overrides are scoped under
  `.mrd-ext` or Ext-only classes.
- Adapt views with `defineExtRemote()` (lifecycle contract + ResizeObserver).
- Replace the transport, not the data layer: `Blotter.data.HostProxy` routes
  Ext store requests through `host.http`.
- Re-skin Triton with the shared design tokens (CSS variables) and generate
  Material icons as CSS masks.
- Vendor Ext JS 6.2.0 GPL with SRI verification and a lock file
  (`tools/scripts/vendor-extjs.mjs`); production swaps in a licensed build.

### Rules learned from the review

- **No `callParent()` in Ext classes defined in ES modules.** Modules are
  strict mode, and Ext 6 resolves the caller through `Function.caller`
  (`null` for strict callers): call the superclass explicitly,
  e.g. `Blotter.view.HostViewController.prototype.destroy.call(this)`.
- **View controllers extend `Blotter.view.HostViewController`**, which owns
  the Host API seams (subscriptions released on destroy, intent dispatch with
  error toasts, focus publication, row flash, density and locale), so each
  view adds only its own behaviour.
- **Copy event payloads before inserting them into a store**
  (`Ext.apply({}, order)`): an Ext model adopts the object it is given as its
  data and converts it in place, while platform events are shared and immutable.
- **The data proxy cancels superseded reads** (`AbortController`) and reports
  errors from load listeners to telemetry instead of failing the operation.
- **Loading is resumable**: completed steps (theme, core, theme script) are
  remembered, and failed imports are not cached, so Retry recovers after a
  network error or a redeploy.
- Formatting follows the shell's locale (`host.state`), live.

## Consequences

- Ext developers keep Ext MVVM; platform concerns come for free.
  − Ext JS requires `'unsafe-eval'` in CSP (XTemplate/data readers use
  `new Function`) and Trusted Types cannot be enforced on pages hosting it.
  − Only one Ext JS version per page (global `Ext`).
  − Ext classic components need explicit sizing.
  Fallback if CSP becomes non-negotiable: host the blotter in a sandboxed iframe.
