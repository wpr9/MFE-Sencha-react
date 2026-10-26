/**
 * Strict Content Security Policy, as recommended by Google (web.dev/strict-csp)
 * instead of host allow-lists, which research found bypassable in ~95% of
 * real deployments (Weichselbaum et al., "CSP Is Dead, Long Live CSP!", 2016).
 *
 * - Scripts run only with the per-response `nonce`; `'strict-dynamic'` extends
 *   that trust to the scripts those scripts load. That is exactly how Module
 *   Federation loads remote entries and chunks (and how the blotter loads
 *   Ext JS), so remotes can move origin without a policy change.
 * - `'unsafe-eval'` is the documented cost of the Ext JS remote (XTemplate and
 *   data readers compile functions) - see docs/adr/0003-extjs-integration.md.
 * - `https:` and `'unsafe-inline'` are ignored by CSP3 browsers when a nonce
 *   and `'strict-dynamic'` are present; they only keep legacy browsers working.
 * - Styles, fonts and images still come from the remotes' origins; inline
 *   styles are needed by Emotion (MUI) and by Ext JS.
 * - `default-src 'self'` closes every directive not listed (frames, workers,
 *   media, manifests). Trusted Types is deliberately absent: Ext JS writes
 *   `innerHTML` throughout (docs/security-architecture-review.md, roadmap).
 *
 * Production (deploy/docker/nginx/shell.conf.template) mirrors this policy
 * with a fresh nonce per response.
 */
export function strictCsp(options: {
  readonly nonce: string;
  readonly remoteOrigins: readonly string[];
  /** Extra `connect-src` endpoints, e.g. dev-server HMR websockets. */
  readonly connect?: readonly string[];
}): string {
  const remotes = options.remoteOrigins.join(' ');
  return [
    "default-src 'self'",
    `script-src 'nonce-${options.nonce}' 'strict-dynamic' 'unsafe-eval' https: 'unsafe-inline'`,
    "object-src 'none'",
    "base-uri 'none'",
    `style-src 'self' ${remotes} 'unsafe-inline'`,
    `font-src 'self' ${remotes} data:`,
    `img-src 'self' ${remotes} data:`,
    `connect-src 'self' ${[remotes, ...(options.connect ?? [])].join(' ')}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** Origins of the remotes listed in a runtime registry (`remotes.json`). */
export function registryOrigins(registry: {
  remotes: Record<string, { entry: string }>;
}): string[] {
  return [
    ...new Set(Object.values(registry.remotes).map((remote) => new URL(remote.entry).origin)),
  ];
}
