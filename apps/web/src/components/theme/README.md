# Theme system

Components consume semantic Tailwind utilities and never choose light/dark
colors directly. The theme system resolves `light`, `dark`, or `system`
preferences into shared CSS variables, preventing theme logic from spreading
through component code.

## Runtime behavior

`ThemeProvider`:

- reads `mba-theme` from local storage;
- defaults to `system` when no valid preference exists;
- observes `prefers-color-scheme` while system mode is active;
- exposes `theme`, `resolvedTheme`, `setTheme`, and `toggleTheme` through `useTheme()`;
- synchronizes `data-theme`, `.dark`, `color-scheme`, and the browser `theme-color` meta tag.

`index.html` performs the initial theme resolution before React starts to prevent a flash of the wrong theme.

The active organization's `primaryColor` overrides `--primary`. The last
resolved organization color is cached under `mba-desk-primary-color` and is
also applied by the inline bootstrap before React starts, preventing a flash of
the default primary color while the session loads.
Entering the public login page clears that organization override and restores
the default primary color while preserving the user's light/dark preference.

`ThemeSwitcher` is an icon-only native select. Its icon adapts to system, light, or dark mode while the expanded selector exposes localized option names.

## Semantic tokens

Core brand tokens in `styles.css`:

| Token          | Light                    | Dark                     |
| -------------- | ------------------------ | ------------------------ |
| `--background` | `rgb(95.3% 95.7% 96.1%)` | `rgb(10.6% 12.5% 14.1%)` |
| `--topbar`     | `rgb(100% 100% 100%)`    | `rgb(8.6% 10.2% 11.6%)`  |
| `--primary`    | `rgb(3.1% 40% 100%)`     | Same                     |
| `--accent`     | `rgb(0% 7.5% 33.7%)`     | Same                     |

The remaining semantic roles cover foreground, card, muted, border, input, focus ring, success, warning, destructive, chat bubbles, and read status.
Scrollbar thumb, hover, and track tokens are translucent mixes of `--primary`,
so organization branding applies to native and WebKit scrollbars as well.

`@theme inline` maps variables to Tailwind names. Examples:

```tsx
<main className="bg-background text-foreground" />
<header className="bg-topbar" />
<button className="bg-primary text-primary-foreground" />
```

Do not use a light/dark conditional for colors already represented by a semantic token. Use `dark:` only when the asset or structure itself changes, such as selecting the correct monochrome logo.

## Brand gradient

`.bg-brand-gradient` is a reusable radial gradient using:

- `#2AC5D3`
- `#13B3EE`
- `#0064E0`
- `#001E75`

It includes `#0064E0` as a fallback background and is currently used by the desktop login branding panel. Treat it as a branded surface with white foreground content.

## Adding tokens

1. Add the semantic variable to both light and dark selectors.
2. Map it in `@theme inline` as `--color-<name>`.
3. Consume it through Tailwind, such as `bg-<name>` or `text-<name>`.
4. Add or update the foundation example in `/design-system`.
5. Check contrast and focus visibility in both themes.
