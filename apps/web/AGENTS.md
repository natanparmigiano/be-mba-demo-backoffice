# Web agent guide

This workspace is a React 19/Vite 7 application using typed Hono RPC, Better
Auth, React Router, i18next, Tailwind CSS 4, and semantic theme tokens.

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

- Put all visible copy and metadata in `src/i18n.ts`. Add the English key first
  and equivalent Brazilian Portuguese and Spanish values in the same change.
- Use semantic utilities such as `bg-background`, `text-foreground`, and
  `border-border`; extend light and dark token definitions before repeating a
  literal color. Use `dark:` only for structural or asset differences.
- Import public primitives through `components/ui/index.ts`. Preserve native
  semantics, keyboard behavior, focus indicators, labels, and ARIA wiring.
- `cn()` only joins classes; it does not resolve conflicting Tailwind classes.
  Add an explicit component prop/variant instead of relying on conflicting
  overrides.
- Add reusable components and meaningful states to `/design-system`; keep its
  section IDs synchronized with `components/design-system/sections.ts`.
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
yarn workspace @mba-demo/web typecheck
yarn workspace @mba-demo/web build
```

Also exercise affected routes, guard states, both themes, all three locales,
narrow layouts, keyboard navigation, and the public design-system examples.
Do not edit generated `dist/` output.
