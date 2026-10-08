# `@mba-desk/web-shared`

`@mba-desk/web-shared` contains browser orchestration used by both split
frontends: the typed API and auth clients, session guards, login,
organization management, administration, and shared shell building blocks.

It lives under `lib/web-shared`; generic presentation remains in
`@mba-desk/ui`. Application-specific pages and navigation remain in their
owning frontend.

At a glance: use this package only for browser behavior that is valid in both
SPAs. Do not embed Manager-only navigation or feature orchestration here.

## Quick start

```ts
import { AppShell } from '@mba-desk/web-shared'
import '@mba-desk/web-shared/styles.css'
```

Both applications import `@mba-desk/web-shared/styles.css`, which loads the
shared theme and registers this package as an explicit Tailwind source.

## Troubleshooting

If a shell item is not valid in both applications, inject it from the owning
application rather than adding a conditional Manager dependency here.

## Verification

```bash
yarn workspace @mba-desk/web-shared typecheck
```

## Related documentation

- [UI primitives](../ui/README.md)
- [Internationalization](../i18n/README.md)
