# ADR-0004: Backend-for-Frontend sessions (identity provider mocked)

**Status:** accepted

## Context

Financial workloads warrant keeping tokens out of the browser (IETF OAuth 2.0
for Browser-Based Apps recommends the BFF pattern). The POC must not depend
on a real identity provider.

## Decision

- The BFF owns authentication. The browser holds only an opaque session id in
  an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefix under TLS).
- The identity provider is **mocked**: `/auth/login` renders a persona picker
  instead of redirecting to OIDC. Everything else is production-shaped: login
  CSRF state, session rotation on sign-in, idle + absolute timeouts, CSRF
  tokens, Origin allow-list, Fetch Metadata isolation, RBAC + entitlement
  checks on routes and on pushed events.
- The SPA only calls `/auth/session`, `/auth/login`, `/auth/logout` and
  `/auth/session/keep-alive` (plus `/auth/session/simulate-expiry`, which exists
  in mock mode only), so replacing the mock with OIDC (authorisation code +
  PKCE, confidential client, e.g. `openid-client`) is a BFF-only change.

## Consequences

- XSS cannot exfiltrate tokens; one place to audit authentication.
  − Requires same-origin routing of `/api` and `/auth` (dev proxy, ingress).
