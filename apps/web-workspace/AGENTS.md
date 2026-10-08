# Web agent guide

This workspace is a React 19/Vite 7 application using typed Hono RPC, Better
Auth, React Router, i18next, Tailwind CSS 4, and semantic theme tokens.

## Documentation

- Read and update `documentation/docs/archive/apps/web-workspace/` for changes to
  routes, screens, user workflows, permissions, configuration, or development
  commands.
- Keep page titles, Docusaurus front matter, links, screenshots, and navigation
  labels aligned with the UI. Add new features to the appropriate workflow and
  reference pages rather than creating source-adjacent README files.
- Structure documentation from introduction and quick start through normal
  usage, detailed behavior, and troubleshooting.

## Boundaries and data flow

- Keep route-level orchestration in `src/pages`, reusable presentation in
  `src/components`, access policy in `src/router`, and session transport in
  `src/auth`.
- Use the relative `apiClient` and types inferred from the API's `AppType`.
  Do not duplicate server DTOs or hard-code an API host without a deployment
  requirement.
- Public routes must not trigger session loading. Put guest/private routes
  below `AuthSessionRoute`, wait for the initial session request, and add role
  or tenant authorization as an explicit guard.
- Preserve requested pathname, search, and hash through login redirects, and
  keep redirect destinations internal.
- Keep theme state in `ThemeProvider`, language state in i18next, and local UI
  state close to its owner.

## UI conventions

- Put all visible copy and metadata in the matching
  `lib/i18n/src/locales/*.ts` files.
  Add the English key first and equivalent values in every supported locale in
  the same change.
- Use semantic utilities such as `bg-background`, `text-foreground`, and
  `border-border`; extend light and dark token definitions before repeating a
  literal color. Use `dark:` only for structural or asset differences.
- Import public primitives through `@mba-desk/ui`. Preserve native
  semantics, keyboard behavior, focus indicators, labels, and ARIA wiring.
- `cn()` only joins classes; it does not resolve conflicting Tailwind classes.
  Add an explicit component prop/variant instead of relying on conflicting
  overrides.
- Add reusable generic components to `lib/ui`.
- Do not store passwords, session tokens, or raw auth responses in local
  storage. Better Auth owns session cookies and transport.

## Chat-specific constraints

- Keep provider/webhook payloads outside the renderer; adapt them to the
  discriminated `ChatMessage` union.
- Supply messages oldest-first/newest-last. Preserve the bounded shell,
  `min-h-0` scrolling child, `flex-col-reverse`, and one non-shrinking content
  wrapper that bottom-anchor the conversation without reversing DOM order.
- New message variants require typed data, a rendering branch, localized
  accessible labels, fixtures, and checks at narrow widths in both themes.

## Verification

```bash
yarn workspace @mba-desk/web-workspace typecheck
yarn workspace @mba-desk/web-workspace build
```

Also exercise affected routes, guard states, both themes, all supported locales,
narrow layouts, and keyboard navigation.
Do not edit generated `dist/` output.
