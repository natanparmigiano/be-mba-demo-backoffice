# WhatsApp library agent guide

These instructions apply to every workspace below `lib/whatsapp`.

## Documentation

- Human-facing documentation for each WhatsApp library lives under
  `documentation/docs/archive/lib/whatsapp/<package>/`. Read and update the matching
  area whenever operations, types, validation, authentication, configuration,
  or integration behavior changes.
- Keep Docusaurus titles, navigation, cross-links, examples, and generated
  collection links accurate. Present setup and the common workflow before API
  reference, provider details, edge cases, and troubleshooting.
- Do not add README files beside WhatsApp packages.

## Playground and collection synchronization

- Every change to a WhatsApp library must be reflected in the Manager API
  playground in `apps/web-manager`. This includes endpoint paths, methods,
  versions, base URLs,
  authentication, headers, parameters, request bodies, defaults, validation,
  response-facing descriptions, and newly added or removed operations.
- Keep playground forms explicit and operation-specific. Do not replace typed
  parameters with generic JSON argument arrays or expose values supplied by
  the selected channel.
- Update all visible playground copy in English, Brazilian Portuguese, and
  Spanish in `lib/i18n/src/locales/es.ts`.
- Keep each card's cURL, JavaScript fetch, Meta Hack, OpenAPI, and Postman
  representations aligned with the original Meta API request behind the
  library abstraction, never the application's internal wrapper route.
- Preserve the playground tab and folder hierarchy. MBA operations belong in
  the matching MBA folder, with one request card per operation.
- After updating the playground, download its full Postman collection and run
  `yarn collections:regenerate <downloaded-postman-collection.json>` to update
  the Postman collection artifact at the location documented by the Docusaurus
  collection page. Never generate this snapshot from the separate root-level
  WhatsApp collection.
- Review the regenerated collection for correct per-request API origins,
  Postman-compatible named variables, empty variable values, escaped numeric
  WhatsApp template placeholders, and absence of hardcoded channel IDs or
  credentials.

Run the changed library's typecheck and tests, then verify the web workspace:

```bash
yarn workspace <changed-whatsapp-workspace> typecheck
yarn workspace <changed-whatsapp-workspace> test
yarn workspace @mba-desk/web-manager typecheck
yarn workspace @mba-desk/web-manager build
```
