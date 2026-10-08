# UI library agent guide

This package owns reusable React presentation primitives and the shared
Tailwind theme, base styles, semantic tokens, and utilities.

## Documentation

- Read and update `documentation/docs/archive/lib/ui/` when components, props,
  variants, accessibility behavior, theme tokens, styles, or integration steps
  change.
- Document the installation and common examples first, followed by component
  and token reference, accessibility guidance, and troubleshooting. Keep
  Docusaurus titles, navigation, and links current; do not add a package-local
  README.

## Package contract

- Keep components application-agnostic and free of API, routing, and feature
  orchestration concerns.
- Export every public primitive through `src/index.ts`.
- Preserve native semantics, keyboard behavior, focus indicators, labels, and
  ARIA wiring.
- Use semantic theme utilities rather than literal theme colors.
- Add explicit props or variants for stable behavior; `cn()` only joins class
  names and does not resolve conflicting Tailwind utilities.
- Keep `src/styles.css` as the single source for shared theme variables and
  global utilities. Applications must import it explicitly.

## Verification

```bash
yarn workspace @mba-desk/ui typecheck
yarn workspace @mba-desk/ui build
```
