# ADR-0005: Communication model - state, events, intents, URL

**Status:** accepted

## Decision

| Need                      | Mechanism                                                                                         | Owner        |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| Context everyone follows  | `host.state` (read-only; `setActivePortfolio` is the only mutation)                               | Shell        |
| Facts with many listeners | `host.events` typed topics, frozen envelopes, isolated handler failures                           | Publisher    |
| Requests for an action    | `host.intents.dispatch()`; one handler per intent, registered by the shell, permission-checked    | Shell        |
| Shareable location        | URL via `host.navigation`                                                                         | Shell router |
| Server-originated facts   | SSE → platform → `host.events` (orders, alerts, portfolio changes) and `host.marketData` (quotes) | BFF          |

Remotes never import each other or the shell (Nx module boundaries), and
never learn each other's routes - only intents.

## Consequences

- Remotes can be replaced, moved or rendered elsewhere without touching
  publishers.
- The event inspector on the Platform page shows every message with its source.
  − Typed maps (`MeridianEventMap`, `MeridianIntentMap`) are a shared contract:
  additions are minor versions, changes are major versions.
