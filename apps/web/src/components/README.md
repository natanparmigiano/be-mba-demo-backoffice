# Components

Components are grouped by responsibility so application primitives remain independent of feature demos and route-level concerns.

## Structure

| Folder/file            | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `ui/`                  | General-purpose visual primitives and small interaction patterns.       |
| `chat/`                | Typed message schema, renderer, sample data, and conversation showcase. |
| `design-system/`       | Documentation sections that demonstrate the reusable primitives.        |
| `theme/`               | Global theme provider and adaptive theme selector.                      |
| `LanguageSwitcher.tsx` | Language selector with explicit-override persistence.                   |

## Dependency direction

Keep dependencies flowing in this direction:

```text
ui primitives
  -> feature components (chat)
     -> design-system examples or pages
```

Theme and language controls may depend on their global providers, but UI primitives should not depend on pages, routes, API clients, or feature fixtures.

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
