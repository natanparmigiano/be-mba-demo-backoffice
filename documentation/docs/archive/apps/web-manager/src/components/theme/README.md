# Manager theme integration

The Manager application consumes the shared semantic theme. Its local
`ThemeSwitcher` file re-exports the implementation from
`@mba-desk/web-shared`; tokens and theme primitives belong to `@mba-desk/ui`.

## Quick start

Use semantic Tailwind utilities in Manager components:

```tsx
<main className="bg-background text-foreground" />
```

Use the shared `ThemeSwitcher` for user preference changes. Do not implement a
second Manager-specific theme store.

## Theme boundaries

The shared theme supports `light`, `dark`, and `system`, synchronizes document
state before React renders, and applies the active organization's primary
color. Components should not choose literal light and dark colors when a
semantic token exists. Use `dark:` only for structural or asset differences.

## Troubleshooting

- A flash before React starts belongs in the shared bootstrap, not a page.
- Conflicting Tailwind classes are not resolved by `cn()`; use an explicit
  variant.
- Add new tokens to both shared light and dark definitions before consuming
  them in Manager.

## Verification

Check changed screens in light, dark, and system modes, with and without an
organization primary color.

## Related documentation

- [Manager components](../README.md)
- [Manager frontend](../../../README.md)
