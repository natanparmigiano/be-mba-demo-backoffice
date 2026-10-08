# Manager components

Manager components contain presentation that is specific to configuration and
integration management. Shared application chrome and generic primitives live
in shared libraries.

## Quick start

Start at the owning page to understand data flow, then extract reusable
presentation into the matching feature directory under `src/components`.

## Component map

- `api-playground/` renders typed request operations and saved collections.
- `runner/` contains browser-only Function editor presentation.
- `studio/` contains Studio editors, chat, and project dialogs.
- Channel components render channel forms and supporting cards.
- `app/AppShell.tsx` is a thin Manager-variant wrapper around
  `@mba-desk/web-shared`.

Organization controls, authentication UI, top bar, side menu, and common
shell behavior belong to `@mba-desk/web-shared`. Generic primitives belong to
`@mba-desk/ui`.

## Troubleshooting

If a component requires routing or feature API orchestration, keep that state
in its page and pass typed props. If both frontends need the component, move it
to the appropriate shared library.

## Verification

Check affected components in both themes, every locale, narrow layouts, and
keyboard navigation, then run the Manager typecheck and build.

## Related documentation

- [Manager pages](../pages/README.md)
- [Runner editor](runner/README.md)
- [Manager source map](../README.md)
