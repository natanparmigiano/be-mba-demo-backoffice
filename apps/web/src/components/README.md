# Components

Keep reusable presentation in this directory and route/data orchestration in
`pages`. Dependencies flow from generic UI primitives to feature components and
then to pages or design-system examples—never in the opposite direction.

## Structure

| Folder/file            | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `ui/`                  | General-purpose visual primitives and small interaction patterns.       |
| `chat/`                | Typed message schema, renderer, sample data, and conversation showcase. |
| `api-playground/`      | Shared request cards, executable code examples, and OpenAPI downloads.  |
| `runner/`              | Lazy Monaco editor and parameter-aware JavaScript language service.     |
| `design-system/`       | Documentation sections that demonstrate the reusable primitives.        |
| `theme/`               | Global theme provider and adaptive theme selector.                      |
| `app/`                 | Application shell controls, organization logos, and logo cropper.       |
| `LanguageSwitcher.tsx` | Language selector with explicit-override persistence.                   |

## Dependency direction

Keep dependencies flowing in this direction:

```text
ui primitives
  -> feature components (chat)
     -> design-system examples or pages
```

UI primitives must not depend on pages, routes, API clients, or feature
fixtures. Theme and language controls may depend on their global providers.

## Choosing component granularity

Create a shared component when it has a stable visual/behavioral contract and is reused or intended for reuse. Keep markup local when it is unique to a single page and extracting it would only move code without clarifying ownership.

Good extraction boundaries include:

- a control with states or accessibility behavior;
- a repeated surface such as a card, table, alert, or status badge;
- a domain renderer with a typed input contract;
- a global control such as theme or language selection.

Avoid creating components solely for one wrapper element or one styling class.

## Component conventions

- Accept standard DOM attributes when the primitive wraps a native element.
- Use controlled props for state that the consumer owns.
- Keep local state for self-contained presentation behavior, such as dismissing an alert.
- Use `forwardRef` for form primitives that may need focus management.
- Merge optional classes with `cn()`.
- Use semantic color utilities rather than literal theme colors.
- Require accessible labels for icon-only controls.
- Keep visible copy in i18n resources; generic primitives receive already-translated strings.
- Export public primitives from the folder's `index.ts`.

Organization logo selection stays in `app/OrganizationLogoPicker.tsx`. It
normalizes browser-supported images to a cropped 512-by-512 PNG before upload.
`app/OrganizationLogo.tsx` owns the shared image endpoint and built-in fallback
used by the shell and organization surfaces.
