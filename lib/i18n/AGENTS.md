# Internationalization library agent guide

This package owns the application's translation resources, language metadata,
language-selection helpers, typed i18next resources, and browser initialization.

## Documentation

- Read and update `documentation/docs/archive/lib/i18n/` when supported locales,
  resource structure, language detection, direction handling, or integration
  steps change.
- Keep its Docusaurus landing page and links discoverable, starting with the
  integration quick start before locale authoring rules and detailed reference.
  Do not add a package-local README.

## Package contract

- English is the canonical resource shape. Every locale must satisfy it.
- Add visible copy to every locale in the same change.
- Keep framework-neutral resources and helpers in `src/index.ts`.
- Keep browser detection, React integration, document language, and direction
  synchronization in the explicit `@mba-desk/i18n/browser` entry point.
- Preserve the explicit local-storage override ahead of navigator detection.

## Verification

```bash
yarn workspace @mba-desk/i18n typecheck
yarn workspace @mba-desk/i18n build
yarn workspace @mba-desk/web-workspace typecheck
yarn workspace @mba-desk/web-workspace build
yarn workspace @mba-desk/web-manager typecheck
yarn workspace @mba-desk/web-manager build
```
