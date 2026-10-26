import { buildTokenStylesheet } from '@meridian/design-tokens';
import type { Role } from '@meridian/contracts';
import type { Persona } from './personas';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

export interface LoginPageModel {
  readonly personas: readonly Persona[];
  readonly returnTo: string;
  readonly state: string;
  readonly nonce: string;
  readonly notice: 'signed-out' | 'expired' | null;
}

const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset="1" stop-color="#0b57d0"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#g)"/><path d="M12 34V15l12 11 12-11v19" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="26" r="2.6" fill="#fff"/></svg>`;

const ROLE_LABEL: Record<Role, string> = {
  'portfolio-manager': 'Portfolio manager',
  trader: 'Trader',
  'compliance-officer': 'Compliance',
  analyst: 'Read-only analyst',
  'platform-admin': 'Platform admin',
};

/**
 * MOCK IdP sign-in page. With a real identity provider the BFF would
 * redirect to the IdP's hosted login instead (OIDC authorization code flow);
 * the SPA is unaware of the difference - it only ever navigates to
 * `/auth/login?returnTo=...`.
 */
export function renderLoginPage(model: LoginPageModel): string {
  const notice =
    model.notice === 'expired'
      ? '<p class="notice" role="status">Your session expired. Sign in again to continue.</p>'
      : model.notice === 'signed-out'
        ? '<p class="notice" role="status">You have signed out.</p>'
        : '';
  const accounts = model.personas
    .map(
      ({ user, roles, summary }, index) => `
        <li>
          <button class="account" type="submit" name="persona" value="${escapeHtml(user.id)}">
            <span class="avatar avatar-${index}" aria-hidden="true">${escapeHtml(user.initials)}</span>
            <span class="who">
              <span class="name">${escapeHtml(user.name)}</span>
              <span class="email">${escapeHtml(user.email)}</span>
              <span class="summary">${escapeHtml(summary)}</span>
            </span>
            <span class="role">${escapeHtml(roles.map((role) => ROLE_LABEL[role] ?? role).join(', '))}</span>
          </button>
        </li>`,
    )
    .join('');

  // Inline style attributes are blocked by the nonce-based CSP, so per-account
  // colours are emitted as classes inside the nonce'd stylesheet.
  const avatarRules = model.personas
    .map(
      ({ user }, index) =>
        `.avatar-${index} { --avatar: ${/^#[0-9a-f]{6}$/i.test(user.avatarColor) ? user.avatarColor : '#5f6368'}; }`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Sign in - Meridian</title>
<style nonce="${model.nonce}">
@font-face { font-family: 'Google Sans Variable'; font-weight: 400 700; font-display: swap; src: url(/auth/assets/google-sans.woff2) format('woff2'); }
@font-face { font-family: 'Roboto Variable'; font-weight: 100 900; font-display: swap; src: url(/auth/assets/roboto.woff2) format('woff2'); }
${buildTokenStylesheet()}
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--mrd-color-background); color: var(--mrd-color-on-surface); font: var(--mrd-type-body-medium); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; -webkit-font-smoothing: antialiased; }
.card { width: min(100%, 1040px); background: var(--mrd-color-surface); border-radius: 28px; padding: 36px 40px 40px; display: grid; grid-template-columns: 1fr 1.15fr; gap: 48px; }
.logo { width: 48px; height: 48px; display: block; margin-bottom: 20px; }
h1 { font: var(--mrd-type-headline-medium); font-size: 36px; line-height: 44px; margin: 0 0 12px; letter-spacing: 0; }
.lede { font: var(--mrd-type-body-large); color: var(--mrd-color-on-surface-variant); margin: 0 0 24px; }
.demo { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 12px; background: var(--mrd-status-info-bg); color: var(--mrd-color-on-surface); font: var(--mrd-type-body-medium); }
.demo svg { flex: none; width: 20px; height: 20px; fill: var(--mrd-status-info-fg); margin-top: 1px; }
.notice { margin: 0 0 16px; padding: 12px 16px; border-radius: 12px; background: var(--mrd-status-success-bg); color: var(--mrd-status-success-fg); font: var(--mrd-type-label-large); }
form { margin: 0; }
ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mrd-color-outline-variant); border-radius: 16px; overflow: hidden; }
li + li { border-top: 1px solid var(--mrd-color-divider); }
.account { width: 100%; display: grid; grid-template-columns: 40px 1fr auto; gap: 16px; align-items: center; padding: 14px 20px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit; transition: background-color var(--mrd-duration-short) var(--mrd-easing-standard); }
.account:hover { background: var(--mrd-color-hover-overlay); }
.account:focus-visible { outline: 2px solid var(--mrd-color-focus-ring); outline-offset: -2px; border-radius: 16px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--avatar); color: #fff; font: var(--mrd-type-label-large); }
.who { display: flex; flex-direction: column; min-width: 0; }
.name { font: var(--mrd-type-title-small); }
.email { color: var(--mrd-color-on-surface-variant); }
.summary { color: var(--mrd-color-on-surface-muted); font: var(--mrd-type-body-small); margin-top: 2px; }
.role { font: var(--mrd-type-label-medium); color: var(--mrd-color-on-surface-variant); background: var(--mrd-color-surface-container); border-radius: 8px; padding: 4px 10px; white-space: nowrap; }
footer { width: min(100%, 1040px); display: flex; justify-content: space-between; padding: 16px 8px; color: var(--mrd-color-on-surface-muted); font: var(--mrd-type-body-small); }
${avatarRules}
@media (max-width: 760px) { .card { grid-template-columns: 1fr; gap: 24px; padding: 28px 20px; } .role { display: none; } h1 { font-size: 28px; line-height: 36px; } }
</style>
</head>
<body>
<main class="card">
  <section>
    ${LOGO}
    <h1>Choose an account</h1>
    <p class="lede">to continue to Meridian Investment Workspace</p>
    <div class="demo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h2v-6h-2v6Zm1-8q.43 0 .71-.29Q13 8.43 13 8t-.29-.71Q12.43 7 12 7t-.71.29Q11 7.57 11 8t.29.71Q11.57 9 12 9Zm0 13q-2.07 0-3.9-.79-1.82-.78-3.17-2.14-1.36-1.35-2.14-3.17Q2 14.07 2 12t.79-3.9q.78-1.82 2.14-3.17Q6.28 3.57 8.1 2.79 9.93 2 12 2t3.9.79q1.82.78 3.17 2.14 1.36 1.35 2.14 3.17Q22 9.93 22 12t-.79 3.9q-.78 1.82-2.14 3.17-1.35 1.36-3.17 2.14Q14.07 22 12 22Z"/></svg><span><strong>Mock identity provider.</strong> Sign-in is simulated for this demo: pick a persona to explore role-based access. Production uses your corporate SSO (OIDC).</span></div>
  </section>
  <section>
    ${notice}
    <form method="post" action="/auth/login">
      <input type="hidden" name="state" value="${escapeHtml(model.state)}">
      <input type="hidden" name="returnTo" value="${escapeHtml(model.returnTo)}">
      <ul aria-label="Demo accounts">${accounts}</ul>
    </form>
  </section>
</main>
<footer><span>Meridian Investment Workspace</span><span>Demo environment &middot; simulated data</span></footer>
</body>
</html>`;
}
