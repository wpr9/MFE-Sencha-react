import iconsCss from '../styles/icons.css?raw';
import overridesCss from '../styles/blotter.css?raw';

export const EXT_VERSION = '6.2.0';

/** Ext JS ships without TypeScript types; the integration layer treats it as opaque. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtNamespace = any;

declare global {
  interface Window {
    Ext?: ExtNamespace;
  }
}

/** Tooltip delay matching MUI's, so Ext and React tooltips feel the same; 0 = never auto-dismiss. */
const TOOLTIP_DELAY_MS = 400;

let loading: Promise<ExtNamespace> | null = null;
let ready: ExtNamespace | null = null;
/** Completed steps survive a failed attempt, so Retry resumes instead of half-initialising. */
const done = { theme: false, core: false, themeScript: false, quickTips: false };

/**
 * Ext JS assets ship with this remote, so they resolve against the remote's
 * own public path (its CDN origin), never the shell's.
 */
function extBaseUrl(): string {
  const publicPath =
    typeof __webpack_public_path__ === 'string' && __webpack_public_path__
      ? __webpack_public_path__
      : location.href;
  return new URL(`vendor/extjs/${EXT_VERSION}/`, new URL(publicPath, location.href)).toString();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
}

function loadStylesheet(href: string): Promise<CSSStyleSheet | null> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // CORS mode, so the shell may read (and patch) the remote-origin sheet's rules.
    link.crossOrigin = 'anonymous';
    link.dataset['mrdExt'] = 'theme';
    link.onload = () => resolve(link.sheet);
    link.onerror = () => {
      link.remove();
      reject(new Error(`Failed to load ${href}`));
    };
    document.head.append(link);
  });
}

/**
 * Triton ships one unscoped rule, `:focus { outline: none }`. Loaded after the
 * shell's baseline, it would remove the keyboard focus ring from the whole
 * workspace for the rest of the session (WCAG 2.4.7). It is deleted from the
 * loaded sheet, restoring the cascade exactly as it was before Ext arrived;
 * every other Triton rule is scoped to Ext's `x-` DOM.
 */
function removeGlobalFocusReset(sheet: CSSStyleSheet | null): void {
  if (!sheet) return;
  try {
    const rules = sheet.cssRules;
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index];
      if (rule instanceof CSSStyleRule && rule.selectorText === ':focus') sheet.deleteRule(index);
    }
  } catch {
    // Best effort: an unreadable sheet (no CORS) only costs the focus-ring fix, never the view.
  }
}

function appendStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  // Appended after the Triton theme so the Material overrides win the cascade.
  document.head.append(style);
}

/**
 * Loads Ext JS once per page, however many Ext-based mounts exist.
 *
 * Ext is a page-level singleton (one global `Ext`, one version). Two remotes
 * on different Ext versions cannot coexist on a page - a constraint recorded
 * in ADR-0003. `scopeCss` stops Ext from styling <body>, so the framework
 * only ever styles its own `x-` prefixed DOM.
 */
export function loadExt(): Promise<ExtNamespace> {
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = (async () => {
      const existing = window.Ext;
      if (existing?.getVersion && !done.core) {
        // Another module already put Ext on the page: share it if the major version matches.
        const version = existing.getVersion().version as string;
        if (!version.startsWith(EXT_VERSION.split('.')[0] ?? '6')) {
          throw new Error(
            `Incompatible Ext JS ${version} already on the page (need ${EXT_VERSION})`,
          );
        }
        appendStyle('mrd-ext-icons', iconsCss);
        appendStyle('mrd-ext-overrides', overridesCss);
        ready = existing;
        return existing;
      }
      if (!done.core) window.Ext = { ...(existing ?? {}), scopeCss: true };
      const base = extBaseUrl();
      await Promise.all([
        // The two halves of theme-triton-all.css (split for old IE's selector limit), loaded
        // directly rather than through its @import wrapper: imported sheets are never
        // readable cross-origin, so the focus-reset fix could not reach them.
        done.theme
          ? null
          : Promise.all(
              ['theme-triton-all_1.css', 'theme-triton-all_2.css'].map((file) =>
                loadStylesheet(`${base}classic/theme-triton/resources/${file}`).then(
                  removeGlobalFocusReset,
                ),
              ),
            ).then(() => {
              done.theme = true;
            }),
        done.core
          ? null
          : loadScript(`${base}ext-all.js`).then(() => {
              done.core = true;
            }),
      ]);
      if (!done.themeScript) {
        await loadScript(`${base}classic/theme-triton/theme-triton.js`);
        done.themeScript = true;
      }
      appendStyle('mrd-ext-icons', iconsCss);
      appendStyle('mrd-ext-overrides', overridesCss);
      const Ext = window.Ext;
      await new Promise<void>((resolve) => Ext.onReady(() => resolve()));
      if (!done.quickTips) {
        Ext.tip.QuickTipManager.init(true, { showDelay: TOOLTIP_DELAY_MS, dismissDelay: 0 });
        done.quickTips = true;
      }
      ready = Ext;
      return Ext;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Ext class definitions are evaluated once, after Ext itself is ready. */
let classes: Promise<unknown> | null = null;
export function loadExtClasses(): Promise<unknown> {
  if (!classes) {
    classes = import('../ext');
    // A failed chunk load (network, or a redeploy that removed old chunks) must be retryable.
    classes.catch(() => {
      classes = null;
    });
  }
  return classes;
}
