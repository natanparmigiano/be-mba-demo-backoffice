# Frontend assets

Assets in this folder are imported by React or referenced by Vite's HTML entry point. Vite fingerprints and emits them during production builds.

## Brand files

| File                       | Use                                                                  |
| -------------------------- | -------------------------------------------------------------------- |
| `signifier.png`            | Full-color signifier used in application headers and as the favicon. |
| `signifier-mono-dark.svg`  | Dark monochrome signifier for light surfaces.                        |
| `signifier-mono-light.svg` | White monochrome signifier for dark or gradient surfaces.            |

The desktop login panel uses the light monochrome asset over `.bg-brand-gradient`. The compact login layout switches between dark and light monochrome assets with the resolved theme.

## Usage

Import application assets so Vite can hash and optimize their URLs:

```tsx
import signifierUrl from '../assets/signifier.png'

;<img src={signifierUrl} alt="" />
```

Use an empty `alt` value when the mark is decorative or adjacent to an equivalent accessible brand label. Supply localized alt text when it is the only branding content in the element.

`index.html` can reference files under `/src/assets/`; Vite rewrites those references during production builds. A copy in `public/` is only needed when a file must keep a stable, unhashed root URL, such as a manifest path or crawler-owned file.

## Asset conventions

- Use descriptive lowercase kebab-case names.
- Include a role or variant suffix (`-light`, `-dark`, `-icon`) when variants exist.
- Prefer SVG for monochrome marks and interface illustrations.
- Prefer optimized raster formats for artwork that cannot remain vector.
- Do not embed user-generated or remote conversation media in the application bundle.
- Do not edit generated assets under `dist/`.
