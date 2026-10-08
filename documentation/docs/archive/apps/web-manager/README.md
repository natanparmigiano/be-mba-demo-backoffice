# Manager frontend

`@mba-desk/web-manager` is the React/Vite management application. It provides
the Manager home dashboard, Agents, Channels, Webhooks, Functions, MCPs, API
Keys, Studio, and API Playground. Organization management and application
administration are intentionally available here through shared UI.

## Quick start

Start the Manager API, then the browser application:

```bash
yarn workspace @mba-desk/api-manager dev
yarn workspace @mba-desk/web-manager dev
```

Open <http://localhost:5174>. Vite forwards relative `/api` requests to the
Manager API on port `3001`.

## Application boundaries

Route orchestration belongs in `src/pages`, access policy in `src/router`, and
Manager-only presentation in `src/components`. Authentication, organization
management, invitations, common pages, theme integration, and the application
shell come from `@mba-desk/web-shared`. Generic UI primitives come from
`@mba-desk/ui`; translations come from `@mba-desk/i18n`.

The application must use relative API URLs and the Manager API's inferred
`AppType`. Operational chat, queue, contact, group, team, and template screens
belong to the Workspace frontend.

## Everyday development

- Add route orchestration to `src/pages` and register it in `src/router`.
- Keep reusable Manager feature components in `src/components`.
- Add common application behavior to `@mba-desk/web-shared` instead of
  duplicating it in both frontends.
- Put visible copy in every supported locale through `@mba-desk/i18n`.

## Troubleshooting

- API calls failing against port `3000` indicate the Workspace API was used;
  Manager development targets port `3001`.
- Session or shell changes should be investigated in `@mba-desk/web-shared`.
- A management route missing from this SPA should not be added to Workspace as
  a workaround; confirm the Manager router and Manager API surface.

## Verification

```bash
yarn workspace @mba-desk/web-manager typecheck
yarn workspace @mba-desk/web-manager build
```

Exercise affected routes, auth guards, themes, locales, keyboard navigation,
and narrow layouts.

## Related documentation

- [Manager source map](src/README.md)
- [Manager API](../api-manager/README.md)
- [Application overview](../README.md)
