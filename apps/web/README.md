# MBA Demo Backoffice frontend

React frontend for the MBA + WhatsApp Cloud API human-handover demo. It includes the authenticated application shell, a public design-system reference, Better Auth session handling, typed Hono API access, localization, and light/dark theming.

## Stack

- React 19 and TypeScript
- Vite 7
- Tailwind CSS 4 through `@tailwindcss/vite`
- React Router 7
- Better Auth React client
- Hono RPC client using the API application's exported `AppType`
- i18next and react-i18next
- Lucide React icons

## Run the frontend

The repository requires Node.js 20.19 or newer and Yarn 1.22.

From the repository root:

```sh
yarn workspace @mba-demo/web dev
```

The Vite development server runs on `http://localhost:5173`. Requests beginning with `/api` are proxied to `http://localhost:3000`, so the API must be running for authentication and application data.

To run both applications through the root workspace command:

```sh
yarn dev
```

## Validation commands

```sh
yarn workspace @mba-demo/web typecheck
yarn workspace @mba-demo/web build
```

The build command runs TypeScript project validation before creating the production bundle in `dist/`.

## Routes

| Path             | Classification | Behavior                                                                          |
| ---------------- | -------------- | --------------------------------------------------------------------------------- |
| `/design-system` | Public         | Available with or without a session.                                              |
| `/login`         | Guest          | Redirects authenticated users to `/`.                                             |
| `/`              | Private        | Redirects unauthenticated users to `/login` and preserves the requested location. |
| `/organization`  | Private        | Manages organizations, invitations, and members.                                  |
| `/admin`         | Admin          | Manages application users, roles, bans, credentials, and sessions.                |
| Any other path   | Fallback       | Redirects to `/`, after which the private guard applies.                          |

See [`src/router/README.md`](src/router/README.md) for route and guard details.

## Architecture

The entry point initializes localization and semantic styles, installs the theme provider, and renders the router. Application pages consume reusable primitives rather than maintaining their own visual tokens.

```text
index.html
  -> src/main.tsx
     -> ThemeProvider
        -> AppRouter
           -> route guard
              -> page
                 -> reusable components
```

The main frontend areas are:

- [`src/`](src/README.md): bootstrap, API client, localization, and global styling.
- [`src/auth/`](src/auth/README.md): Better Auth client and session context.
- [`src/router/`](src/router/README.md): public, guest, and private route boundaries.
- [`src/pages/`](src/pages/README.md): route-level screens.
- [`src/components/`](src/components/README.md): reusable UI, theme controls, design-system sections, and chat.
- [`src/assets/`](src/assets/README.md): bundled brand artwork.

## Backend integration

`src/api.ts` creates a Hono RPC client with `hc<AppType>('/')`. The `AppType` import comes from the `@mba-demo/api` workspace, so request paths and response types are derived from the backend contract.

Better Auth uses the current browser origin. In development, Vite proxies its `/api` calls to the API process. Keep browser-facing calls relative rather than hard-coding an API host unless deployment requirements change.

## Styling, theme, and brand

Tailwind is configured by the Vite plugin; there is no separate Tailwind configuration file. `src/styles.css` declares semantic CSS variables and exposes them to Tailwind through `@theme inline`. Components should use classes such as `bg-background`, `bg-card`, `text-foreground`, and `text-primary` instead of literal theme colors.

Theme preference defaults to the operating system and is stored under `mba-theme` after selection. Both `data-theme` and the `.dark` class are synchronized on `<html>`. See [`src/components/theme/README.md`](src/components/theme/README.md).

## Internationalization

All user-facing copy belongs in `src/i18n.ts`. English, Brazilian Portuguese, and Spanish are supported. Browser preference is used until the user explicitly chooses a language; that selection is then stored under `mba-language-override` and takes precedence on future visits.

When adding copy:

1. Add the key to the English resource first; it defines the inferred resource shape.
2. Add equivalent Portuguese and Spanish entries.
3. Render the key with `useTranslation()` rather than embedding visible text in a component.
4. Use interpolation for dynamic content instead of concatenating translated fragments.

## Development conventions

- Keep route-level orchestration in `pages/` and reusable presentation in `components/`.
- Extend semantic tokens before introducing repeated literal colors.
- Import primitives from `components/ui` through its barrel export.
- Keep server data types derived from the Hono contract.
- Preserve accessible labels, focus states, semantic elements, and keyboard behavior.
- Add new reusable components to the public design-system page.
- Do not edit generated `dist/` files.
