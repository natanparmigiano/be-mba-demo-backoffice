# Frontend source

This directory owns the browser application's bootstrap and global concerns.
Put route orchestration in `pages`, access policy in `router`, session transport
in `auth`, and reusable presentation in `components`; keep feature-local state
with the component that owns it.

## Ownership map

| Path                        | Responsibility                                      |
| --------------------------- | --------------------------------------------------- |
| `assets/`                   | Vite-managed brand images and SVG variants          |
| `auth/`                     | Better Auth client, session provider, and `useAuth` |
| `components/ui/`            | Reusable application primitives                     |
| `components/theme/`         | Theme state and selector                            |
| `components/chat/`          | Typed WhatsApp-style message model and renderer     |
| `components/design-system/` | Public component catalog sections and navigation    |
| `pages/`                    | Route-level screens and data orchestration          |
| `router/`                   | Route declaration and access guards                 |

## Bootstrap sequence

`main.tsx` performs the application-wide setup:

1. Imports `i18n.ts`, which initializes i18next before components render.
2. Imports `styles.css`, which loads Tailwind and defines semantic tokens.
3. Mounts React in strict mode.
4. Wraps the application in `ThemeProvider`.
5. Renders `App`, which delegates navigation to `AppRouter`.

`index.html` runs a small theme bootstrap before React loads. It reads `mba-theme`, resolves system preference, and applies both `data-theme` and `.dark`. This prevents a light-theme flash before `ThemeProvider` takes control.

Top-level source files:

- `App.tsx`: intentionally small application boundary around `AppRouter`.
- `DesignSystemPage.tsx`: composition root for the public design-system route.
- `api.ts`: typed Hono RPC client.
- `i18n.ts`: resources, language detection, and document language synchronization.
- `i18next.d.ts`: TypeScript augmentation for typed translation keys.
- `styles.css`: Tailwind import, theme variables, and shared CSS utilities.

## State boundaries

Keep state close to the system that owns it:

- Theme state is global through `ThemeProvider`.
- Authentication state exists only inside the guarded route branch through `AuthProvider`.
- Language state is managed by i18next.
- Page and component interaction state remains local unless multiple independent routes need it.

The public design system deliberately sits outside `AuthProvider`, so loading it never requires a session request.

## API client

`api.ts` exports one typed client:

```ts
import { apiClient } from './api'

const response = await apiClient.api.health.$get()
```

The API type comes from `@mba-desk/api`. Prefer inferred request and response types instead of duplicating server DTOs in the frontend.

## Localization lifecycle

The language detector checks, in order:

1. `mba-language-override` in local storage.
2. `navigator.languages` / browser preference.
3. English fallback.

Automatic browser detection is not cached. `LanguageSwitcher` writes the override key only after a user selection, which prevents later initialization from replacing an explicit choice. `languageChanged` also keeps the document's `lang` attribute synchronized.

The English resource object is the canonical type source. All locale resources
must retain the same key structure so `useTranslation()` remains type-safe.

## Styling rules

- Use semantic Tailwind utilities backed by variables in `styles.css`.
- Use the `dark:` variant only for structural differences; prefer semantic variables for colors.
- Use `cn()` for conditional class joining. It does not perform Tailwind conflict resolution.
- Place reusable visual patterns in `components/ui`; keep page-specific layout in the page or feature folder.
- Use the `.bg-brand-gradient` utility only for branded surfaces intended to carry white foreground content.

## Adding a feature

1. Add or extend the route in `router/AppRouter.tsx` under the correct guard.
2. Build the route-level screen in `pages/`.
3. Extract reusable controls into `components/ui` or a focused feature folder.
4. Add every user-visible string to all five locales.
5. Use `apiClient` for typed backend calls and `useAuth` for session data.
6. Add reusable UI examples to `/design-system`.
7. Run the frontend typecheck and production build.
