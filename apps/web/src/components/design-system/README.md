# Design-system catalog

The public `/design-system` route is the frontend's visual acceptance surface.
It renders the actual exported components across tokens, themes, locales,
interaction states, and responsive layouts without initializing an
authentication session.

## Page composition

`DesignSystemPage.tsx` composes:

1. `DesignSystemHeader`
2. `DesignSystemSidebar`
3. `HeroSection`
4. `FoundationsSection`
5. `ButtonsSection`
6. `FormsSection`
7. `NavigationSection`
8. `DataDisplaySection`
9. `FeedbackSection`
10. `ChatSection`

Every section owns its examples and local interaction state. Shared presentation remains in `@mba-desk/ui` or the relevant feature folder.

## Navigation registry

`sections.ts` is the canonical registry for sidebar navigation, active-section observation, and header search. Each item defines:

- a stable section `id` matching the rendered element;
- a translation key for its label;
- search aliases for component discovery.

The page observes section intersections and passes the current ID to the sidebar. The sidebar rail is outside normal document flow so it cannot influence page height; only `<main>` defines the document height. The inner sidebar remains sticky beneath the top bar.

## Current coverage

- Foundations: semantic colors, typography, spacing, and theme behavior.
- Buttons: primary, secondary, outline, ghost, danger, sizing, disabled, and loading states.
- Forms: inputs, textareas, search, selects, checkboxes, switches, and validation.
- Navigation: tabs, pills, and pagination.
- Data display: tables, avatars, and stat cards.
- Feedback: alerts, dialog, toast, and empty state.
- Chat: all currently supported WhatsApp-style content and interaction patterns.

## Adding a component example

1. Build the reusable component in `@mba-desk/ui` or its feature folder.
2. Add translated labels and descriptions to all locales in `i18n.ts`.
3. Place the example in the most relevant existing section.
4. If a new section is genuinely necessary, create `<Name>Section.tsx`, export it from `index.ts`, add it to `DesignSystemPage`, and register it in `sections.ts`.
5. Include useful states rather than a single happy-path render.
6. Verify light/dark modes, all languages, narrow layouts, keyboard navigation, and focus indicators.

Examples must demonstrate real component behavior or clearly scoped mock
actions. The catalog documents this application; it is not a package installer.

## Layout constraints

- Keep section IDs stable because hashes, search, and sidebar links depend on them.
- Use `scroll-mt-*` so sticky-header navigation lands correctly.
- Wide examples must manage their own horizontal overflow.
- Fixed-height demos with large internal content must constrain the scrolling child with `min-h-0` and `overflow-*`; internal content must never increase document scroll height unexpectedly.
- Keep the main content `min-w-0` so wide child content cannot force the overall layout wider.
