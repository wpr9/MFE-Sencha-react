# ADR-0002: Share only the React runtime across remotes

**Status:** accepted

## Context

Module Federation can share any dependency. Sharing reduces bytes but ties
every team to the same version and can create subtle bugs: a remote's MUI X
DataGrid deep-imports `@mui/material/styles`; if only `@mui/material` is
shared, the grid and the remote's `ThemeProvider` can resolve different
context instances and the grid renders with the default theme.

## Decision

Share `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom` and
`react-dom/client` as singletons (`requiredVersion ^19`, see
`tools/mf/shared.ts`). Everything else - MUI, Emotion, React Router,
TanStack Query, the design-system library - is bundled per remote. Each
remote gets a uniquely keyed Emotion cache. The Ext JS remote shares nothing.

## Consequences

- **Each remote has its own MUI modal stack.** A shell drawer or dialog and a
  remote's menu are two modals that do not know about each other, and two
  focus traps fight over every `focusin` (reproduced: stack overflow when a
  ticket dropdown is used in the shell's drawer). Shell overlays that host or
  overlay remote content therefore set `disableEnforceFocus`: the shell does
  not enforce focus over content it does not own; `aria-modal` and the
  backdrop still apply. Sharing `@mui/*` as singletons removes the issue at
  the cost of a common UI release train.

- No cross-team version coupling for UI libraries; no context mismatches.
- One React renderer for all roots.
  − Larger downloads (each React remote ships its own MUI); mitigated by
  per-route loading, immutable caching and pre-loading on hover. Revisit with
  fully prefix-shared MUI (`@mui/material/`, `@mui/system/`, …) once teams
  agree on a common UI release train.
