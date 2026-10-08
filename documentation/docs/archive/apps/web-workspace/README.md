# Workspace frontend

`@mba-desk/web-workspace` is the React/Vite operational application. It
provides Home, Queue, Chat, Teams, Contacts, Groups, Templates, and Sending.
Organization management, invitation acceptance, and application
administration are intentionally available through shared UI.

## Quick start

Start the Workspace API, then the browser application:

```bash
yarn workspace @mba-desk/api-workspace dev
yarn workspace @mba-desk/web-workspace dev
```

Open <http://localhost:5173>. Vite forwards relative `/api` requests to the
Workspace API on port `3000`.

## Application boundaries

Route orchestration belongs in `src/pages`, access policy in `src/router`, and
Workspace-only presentation in `src/components`. Authentication, organization
management, invitations, common pages, theme integration, and the application
shell come from `@mba-desk/web-shared`. Generic UI primitives come from
`@mba-desk/ui`; translations come from `@mba-desk/i18n`.

The application must use relative API URLs and the Workspace API's inferred
`AppType`. Agent, channel configuration, webhook archive, Function, MCP,
Studio, and Playground screens belong to the Manager frontend.

## Everyday development

- Add route orchestration to `src/pages` and register it in `src/router`.
- Keep chat and other operational presentation in `src/components`.
- Add common application behavior to `@mba-desk/web-shared` instead of
  duplicating it in both frontends.
- Put visible copy in every supported locale through `@mba-desk/i18n`.

## Troubleshooting

- API calls failing against port `3001` indicate the Manager API was used;
  Workspace development targets port `3000`.
- Session or shell changes should be investigated in `@mba-desk/web-shared`.
- Missing realtime chat updates can originate in the Workspace API worker or
  event configuration, not only the browser.

## Verification

```bash
yarn workspace @mba-desk/web-workspace typecheck
yarn workspace @mba-desk/web-workspace build
```

Exercise affected routes, auth guards, themes, locales, keyboard navigation,
chat scrolling, and narrow layouts.

## Related documentation

- [Workspace source map](src/README.md)
- [Workspace API](../api-workspace/README.md)
- [Chat message system](src/components/chat/README.md)
- [Application overview](../README.md)
