# API playground collections

This directory stores collection snapshots exported by the API playground. The
current combined Postman snapshot is
[`mba_wa_cloud_be.postman_collection.json`](./mba_wa_cloud_be.postman_collection.json).

The checked-in file is an example artifact, not an input to the application.
The playground does not read it, and it does not use the separate collection
at the repository root to construct exports. Deleting either source collection
does not affect playground export behavior.

## Export flow

Every playground request card supplies a `PlaygroundRequestExample` to
`PlaygroundOperationCard`. The same object drives its cURL, JavaScript fetch,
Meta Hack, OpenAPI, and single-request Postman actions.

For Postman exports, the flow is:

1. `PlaygroundOperationCard` registers its title, HTTP method, and request
   object with `PlaygroundPostmanRegistry`.
2. All top-level playground panels remain mounted while inactive panels are
   hidden. This makes every request available to the combined export without
   requiring the user to visit every tab.
3. MBA additionally keeps all of its folder panels mounted and registers each
   request beneath its corresponding nested folder.
4. The top-level download action converts the registry to the visible
   playground hierarchy, with MBA first, and passes every entry through the
   same serializer used by the single-request Postman button.
5. The browser downloads `mba_wa_cloud_be.postman_collection.json`.

The relevant implementation files are:

- [`PlaygroundOperationCard.tsx`](../../apps/web/src/components/api-playground/PlaygroundOperationCard.tsx)
- [`PlaygroundPostmanRegistry.tsx`](../../apps/web/src/components/api-playground/PlaygroundPostmanRegistry.tsx)
- [`PlaygroundRequestActions.tsx`](../../apps/web/src/components/api-playground/PlaygroundRequestActions.tsx)
- [`ApiPlaygroundPage.tsx`](../../apps/web/src/pages/ApiPlaygroundPage.tsx)
- [`ApiPlaygroundMbaFolders.tsx`](../../apps/web/src/pages/ApiPlaygroundMbaFolders.tsx)

## URLs and variables

Each request retains its complete original URL. The combined collection does
not define one global base URL because the playground covers multiple Meta API
origins, including `graph.facebook.com` and `api.facebook.com`.

Values supplied by the selected channel are replaced at export time with
Postman-compatible collection variables:

- `{{Phone-Number-ID}}`
- `{{WABA-ID}}`
- `{{Business-ID}}`
- `{{App-ID}}`
- `{{User-Access-Token}}`

Other request placeholders are normalized to the same kebab-case convention,
collected recursively from URLs, headers, query parameters, and bodies, and
deduplicated at collection level. Variable values are intentionally empty so
the exported file does not contain channel credentials or identifiers.

WhatsApp template text uses numeric positional placeholders such as `{{1}}`.
These are API payload syntax, not Postman variables. The serializer writes
them as `\{{1}}` in Postman request data so Postman sends the literal `{{1}}`,
while named placeholders continue to resolve normally.

## Refreshing the snapshot

The browser export is the source of truth. To refresh the checked-in snapshot:

1. Open the API playground and select any channel.
2. Choose **Download full Postman collection**.
3. Confirm channel-derived identifiers are represented by variables and that
   requests retain their correct API origins.
4. Regenerate the checked-in snapshot from the downloaded file:

   ```bash
   yarn collections:regenerate /path/to/mba_wa_cloud_be.postman_collection.json
   ```

   The command validates Postman Collection v2.1, requires MBA to be the first
   folder, verifies that named placeholders have collection-variable
   declarations, clears all variable values, and writes deterministic formatted
   JSON to `docs/collections/mba_wa_cloud_be.postman_collection.json`.

5. Import it into Postman and populate the collection variables needed by the
   requests being exercised.

Because request examples reflect the playground's current form defaults, the
snapshot should be refreshed whenever request cards, parameter defaults,
folder organization, or serialization rules change.
