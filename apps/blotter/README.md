# blotter — Sencha Ext JS remote

Order management blotter written in idiomatic Ext JS 6 (classic toolkit,
MVVM) and federated into the React shell through the platform lifecycle
contract. See [ADR-0003](../../docs/adr/0003-extjs-integration.md).

```
src/index.ts           Dev-only entry: loads bootstrap.ts (standalone dev host); absent from prod bundles
src/remote/            Integration layer (TypeScript) - federated
  app.ts               ./App                -> Blotter.view.blotter.Blotter
  recent-orders-widget.ts  ./RecentOrdersWidget -> Blotter.view.widget.RecentOrders
  mount-ext.ts         defineExtRemote(): lifecycle contract + ResizeObserver
  ext-runtime.ts       loads Ext once per page (scopeCss, theme, overrides)
src/ext/               Ext JS classes (plain JS, Ext.define) - loaded after Ext
  index.js             Class registry in dependency order (Ext.define is synchronous)
  util/Format.js       Cell renderers; numbers/dates via @meridian/formatting
  util/Csv.js          CSV export
  data/HostProxy.js    Ext proxy over host.http (CSRF, tracing, 401 handling)
  model/Order.js       Order model with calculated fields
  view/HostViewController.js  Base controller: Host API seams every view shares
  view/blotter/        Blotter view, ViewModel, ViewController, detail panel
  view/widget/         Dashboard widget
src/styles/            Material 3 skin for Triton (design-token CSS variables)
public/vendor/extjs/   Ext JS runtime (GPL 6.2.0, SRI-verified, see extjs.lock.json)
```

## Running standalone

```bash
npx nx serve bff
npx nx serve blotter     # http://localhost:4204 (dev host + mock sign-in)
```

## Using a licensed Ext JS build

`tools/scripts/vendor-extjs.mjs` fetches the public GPL build (6.2.0) only. To
run a commercially licensed build (7.x/8.x), three places change:

1. **Files:** copy the runtime (`ext-all.js`, `classic/theme-triton/theme-triton.js`
   and `classic/theme-triton/resources/`) to `public/vendor/extjs/<version>/`,
   mirroring the current layout. Delete the GPL folder (its `NOTICE.md` included).
2. **Loader:** in `src/remote/ext-runtime.ts` set `EXT_VERSION` to `<version>`;
   if the theme is not Triton, also change the two theme CSS file names and the
   theme JS path it loads. The Material skin (`src/styles/blotter.css`) is pinned
   to Triton 6.2 class names (`x-grid-*`, `x-tip-*`, `x-form-trigger-*`): a newer
   toolkit needs a visual pass over it.
3. **Lock file:** regenerate `extjs.lock.json` with the new files' sha256 hashes
   (only `tools/scripts/vendor-extjs.mjs` reads it, while downloading; nothing at
   runtime or in CI does), or remove the GPL entries from it.

Licensing: 6.2.0 is GPL-3.0, with copyleft obligations; production use of
Ext JS requires a commercial licence from Sencha. Note that Ext JS 6.x is out
of standard support (since March 2022).

## House style for Ext classes

The files under `src/ext/` are ES modules evaluated after the Ext runtime, kept
in the ES5 style Ext developers expect: `var`, function expressions,
`Ext.define`. One rule has no exception: **never `this.callParent()`** - modules
are strict mode and Ext 6 resolves the caller through `Function.caller`, which
is `null` for strict callers. Call the superclass explicitly
(`Blotter.view.HostViewController.prototype.destroy.call(this)`); see
[ADR-0003](../../docs/adr/0003-extjs-integration.md).

## Regenerating icons

`node tools/scripts/generate-ext-icons.mjs` re-creates `src/styles/icons.css`
(Material icons from `@mui/icons-material`, rendered as CSS masks).
