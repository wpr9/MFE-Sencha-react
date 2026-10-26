# ADR-0006: Design tokens as the single source of truth across frameworks

**Status:** accepted

## Decision

`@meridian/design-tokens` defines colour schemes (light/dark), type scale,
radii, elevation and motion. It produces:

- the MUI theme (`@meridian/ui`) used by the shell and React remotes;
- CSS custom properties (`--mrd-*`) installed by the shell and consumed by the
  Ext JS skin, the dev host and the BFF sign-in page.

Theme and density switches change a `data-theme` attribute and React state
only; no framework-specific theming code is needed in remotes.

Quality gates: unit tests assert WCAG AA contrast for every text role in both
modes; the categorical chart palette was validated (lightness band, chroma,
CVD and normal-vision separation, contrast) against the actual card surfaces.

## Consequences

- Pixel-consistent React and Ext JS screens; one place to rebrand.
  − Ext JS layout metrics are measured from CSS at render time, so density
  changes refresh the grid view.
