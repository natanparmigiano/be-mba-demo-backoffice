# Manager-local assets

This directory is reserved for assets bundled only by the Manager frontend.
Shared brand artwork lives in `@mba-desk/web-shared`, where both applications
can use one canonical copy.

## Quick start

Import a local asset from TypeScript when it belongs only to Manager:

```tsx
import assetUrl from '../assets/example.svg'
```

Vite fingerprints imported assets during production builds. Use `public/`
only when an external consumer requires a stable, unhashed root URL.

## Asset boundaries

Do not copy shared signifiers or organization imagery into this directory.
The existing emoji category data is not part of a Manager chat workflow;
verify that an asset has a real Manager consumer before extending it.

## Conventions

- Use descriptive lowercase kebab-case names.
- Prefer SVG for monochrome interface artwork.
- Use an empty `alt` for decorative images and localized alternative text
  when the image is the only meaningful content.
- Never edit generated `dist/` output.

## Troubleshooting

If an import cannot be resolved, confirm the file is local. Shared brand asset
imports should come from the shared frontend package rather than a guessed
`src/assets` path.

## Verification

Build the Manager frontend to verify that Vite resolves and emits the asset.

## Related documentation

- [Manager source map](../README.md)
- [Manager frontend](../../README.md)
