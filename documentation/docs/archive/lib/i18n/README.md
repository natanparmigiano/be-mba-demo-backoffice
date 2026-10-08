# `@mba-desk/i18n`

This package is the authoritative translation boundary for MBA Desk. It owns
all locale resources, typed i18next configuration, supported-language metadata,
language normalization and resolution helpers, and browser initialization.

## Quick start

Import definitions and helpers from the package root:

```ts
import {
  languageDefinitions,
  normalizeLanguage,
  resolveLanguageDefinition,
} from '@mba-desk/i18n'
```

Browser applications initialize detection, React integration, and document
`lang`/`dir` synchronization once during bootstrap:

```ts
import '@mba-desk/i18n/browser'
```

English defines the canonical resource type. Every other locale uses that type
to keep keys and interpolation contracts synchronized.

## Troubleshooting

Add every English key to all supported locales in the same change. Import the
browser entrypoint only from browser bootstraps.

## Verification

```bash
yarn workspace @mba-desk/i18n typecheck
yarn workspace @mba-desk/i18n build
```
