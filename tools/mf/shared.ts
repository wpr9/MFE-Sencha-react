/**
 * Module Federation share policy (see docs/adr/0002-share-policy.md).
 *
 * Only the React runtime is shared, as a singleton. Everything else (MUI,
 * Emotion, React Router, TanStack Query, design-system code) is bundled per
 * app: every remote renders into its own React root with its own theme
 * instance, so sharing UI libraries would buy bytes at the cost of
 * cross-team version coupling and context-mismatch bugs (e.g. a remote's
 * DataGrid resolving a different @mui/material/styles instance than its
 * ThemeProvider).
 */
const react = { singleton: true, requiredVersion: '^19.0.0', strictVersion: false } as const;

export const REACT_SHARED = {
  react,
  'react/jsx-runtime': react,
  'react/jsx-dev-runtime': react,
  'react-dom': react,
  'react-dom/client': react,
};
