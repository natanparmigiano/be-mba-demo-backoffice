# Workspace components

Workspace components contain operational presentation, including the typed
chat renderer and composer. Shared application chrome and generic primitives
live in shared libraries.

## Quick start

Start at the owning page to understand data flow, then extract reusable
presentation into the matching feature directory under `src/components`.

## Component map

- `chat/` owns normalized chat messages, rendering, media interactions, and
  message composition.
- `app/AppShell.tsx` is a thin Workspace-variant wrapper around
  `@mba-desk/web-shared`.
- `theme/ThemeSwitcher.tsx` re-exports the shared switcher.

Organization controls, authentication UI, top bar, side menu, and common
shell behavior belong to `@mba-desk/web-shared`. Generic primitives belong to
`@mba-desk/ui`.

## Troubleshooting

If a component requires routing or feature API orchestration, keep that state
in its page and pass typed props. If both frontends need the component, move it
to the appropriate shared library.

## Verification

Check affected components in both themes, every locale, narrow layouts, and
keyboard navigation, then run the Workspace typecheck and build.

## Related documentation

- [Workspace pages](../pages/README.md)
- [Chat message system](chat/README.md)
- [Workspace source map](../README.md)
