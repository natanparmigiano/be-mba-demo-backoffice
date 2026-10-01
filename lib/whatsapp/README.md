# WhatsApp libraries

The `lib/whatsapp` workspaces are the typed integration boundary for WhatsApp
Cloud API, WhatsApp Business Management API, webhook payloads, and the Meta
Business Agent (MBA) API. Applications should import these packages by their
`@mba-demo/*` workspace names; they should not import package source files
directly.

## Package map

| Package                                                 | Scope                                                            | Primary resource ID                      |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| [`@mba-demo/wa-waba`](waba/README.md)                   | Discover and read WhatsApp Business Accounts                     | Business or WABA ID per call             |
| [`@mba-demo/wa-registration`](registration/README.md)   | Verify, register, and deregister a business phone number         | Phone number ID                          |
| [`@mba-demo/wa-subscriptions`](subscriptions/README.md) | Register app webhooks and manage WABA app subscriptions          | App credentials and WABA ID              |
| [`@mba-demo/wa-templates`](templates/README.md)         | Create and manage message templates and template groups          | WABA ID                                  |
| [`@mba-demo/wa-flows`](flows/README.md)                 | Manage Flows, assets, previews, metrics, and endpoint encryption | WABA ID; phone number ID for encryption  |
| [`@mba-demo/wa-media`](media/README.md)                 | Upload, retrieve, download, and delete media                     | Phone number ID                          |
| [`@mba-demo/wa-messaging`](messaging/README.md)         | Send messages and update read/typing state                       | Phone number ID                          |
| [`@mba-demo/wa-moderation`](moderation/README.md)       | List, block, and unblock WhatsApp users                          | Phone number ID                          |
| [`@mba-demo/wa-qr`](qr/README.md)                       | Create and manage message QR codes and generated images          | Phone number ID                          |
| [`@mba-demo/wa-analytics`](analytics/README.md)         | Query messaging, pricing, template, call, and group analytics    | WABA ID                                  |
| [`@mba-demo/wa-webhooks`](webhooks/README.md)           | Validate and type inbound webhook payloads                       | No client                                |
| [`@mba-demo/wa-mba`](mba/README.md)                     | Configure and operate the Meta Business Agent platform           | Phone number ID; Business ID for budgets |

The packages intentionally separate resource management from message delivery.
For example, `wa-flows` creates and publishes a Flow, while `wa-messaging`
sends that Flow to a recipient. Similarly, `wa-templates` manages templates and
`wa-messaging` sends approved templates.

## Shared client conventions

All HTTP packages export:

- a `createWhatsApp…Client()` factory;
- its concrete client class and a client contract interface;
- all public input and response types from the package root;
- a package-specific `…ApiError` for non-2xx responses; and
- a package-specific `…ResponseError` for malformed successful responses.

Graph API clients use `https://graph.facebook.com` and `v26.0` by default.
Every client supports a custom API version, base URL, and injected `fetch` for
tests. Construction performs no network I/O. Request methods accept an
`AbortSignal` through their final options argument.

```ts
import { createWhatsAppMessagingClient } from '@mba-demo/wa-messaging'

const messaging = createWhatsAppMessagingClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
  // graphApiVersion: 'v26.0',
  // graphApiBaseUrl: 'https://graph.facebook.com',
  // fetch: instrumentedFetch,
})
```

Access tokens are supplied only at client construction and are sent as bearer
credentials. They are not embedded in returned values or error messages.
Response objects generally retain additive provider fields so Meta can add
fields without immediately breaking consumers.

Permissions depend on the operation and token owner. Account, template,
analytics, Flow, and subscription administration generally requires
`whatsapp_business_management`; message, media, moderation, and registration
operations use `whatsapp_business_messaging`, with both permissions required
for some Solution Partner workflows. Consult the corresponding Meta endpoint
before reducing token permissions.

## WABA discovery

Create `@mba-demo/wa-waba` with an access token. Resource IDs are supplied per
operation because one client can inspect multiple businesses and accounts.

| Method                             | Operation                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `get(wabaId, options?)`            | Retrieve a WABA and fields such as name, currency, timezone, and template namespace. |
| `listOwned(businessId, options?)`  | Page through `owned_whatsapp_business_accounts`.                                     |
| `listShared(businessId, options?)` | Page through `client_whatsapp_business_accounts`.                                    |

List options support `limit`, `before`, and `after`. Graph IDs are returned as
strings, including safe numeric IDs returned by upstream APIs.

## Phone-number registration

Create `@mba-demo/wa-registration` with `accessToken` and `phoneNumberId`.

| Method                                         | Operation                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPhoneNumber(options?)`                     | Retrieve registration, connection, ownership verification, display-name, and quality fields. Use `fields` to select additional Graph fields. |
| `requestVerificationCode(input, options?)`     | Request an ownership code with `code_method: 'SMS' \| 'VOICE'` and a language code.                                                          |
| `verifyCode({ code }, options?)`               | Submit the six-digit ownership code.                                                                                                         |
| `register(input, options?)`                    | Register the number with a six-digit two-step PIN and optional `data_localization_region`.                                                   |
| `setTwoStepVerificationPin({ pin }, options?)` | Replace the number's two-step verification PIN.                                                                                              |
| `deregister(options?)`                         | Remove the number from Cloud API without deleting the number or message history.                                                             |

PINs and verification codes are strings to preserve leading zeroes and are
validated as exactly six digits. Registration and deregistration are each
limited by Meta to 10 requests per phone number in a rolling 72-hour window.
Data localization can be changed or disabled only by deregistering and
registering again. Two-step verification cannot be disabled through the API.

## Webhook subscriptions

Use `createWhatsAppWebhookRegistrationClient` with the app ID and secret to
register the callback and parsed event fields. Then create
`@mba-demo/wa-subscriptions` with `accessToken` and `wabaId`; a WABA
subscription covers every phone number attached to that WABA.

| Method                              | Operation                                                       |
| ----------------------------------- | --------------------------------------------------------------- |
| `subscribe(options?)`               | Subscribe the current Meta app to the WABA.                     |
| `list(options?)`                    | List app subscriptions and any callback overrides.              |
| `overrideCallback(input, options?)` | Set a WABA-specific `override_callback_uri` and `verify_token`. |
| `unsubscribe(options?)`             | Remove the current app's WABA subscription.                     |

Callback overrides accept only HTTP or HTTPS URLs. Store the verification token
as a secret and compare it during Meta's webhook verification handshake.

## Template management

Create `@mba-demo/wa-templates` with `accessToken` and `wabaId`.

### Template lifecycle

| Method                                   | Operation                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create(input, options?)`                | Create a custom authentication, marketing, or utility template.                                               |
| `createFromLibrary(input, options?)`     | Create a WABA template from Meta's Template Library.                                                          |
| `list(options?)`                         | Filter templates by name, language, category, or status with field selection and cursor pagination.           |
| `get(templateId, options?)`              | Retrieve one template with optional field selection.                                                          |
| `update(templateId, input, options?)`    | Replace components or update editable category, parameter, display, delivery, TTL, and CTA tracking settings. |
| `deleteByName(name, options?)`           | Delete every language variant with the name.                                                                  |
| `deleteById(templateId, name, options?)` | Delete one matching template/language variant.                                                                |
| `deleteByIds(templateIds, options?)`     | Atomically delete up to 100 template IDs.                                                                     |
| `getNamespace(options?)`                 | Retrieve the WABA's message-template namespace.                                                               |

`TemplateComponent` supports text/media/location headers, body, footer, button
sets, carousels, limited-time offers, named and positional examples, OTPs,
catalog/product buttons, and Flow buttons. Template names must match
`^[a-z0-9_]+$` and cannot exceed 512 characters.

### Bulk, library, migration, and groups

| Method                                  | Operation                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `upsertAuthentication(input, options?)` | Create or update one authentication template in multiple languages.                    |
| `migrate(input, options?)`              | Migrate up to 500 eligible templates from another WABA.                                |
| `listLibrary(options?)`                 | Search/filter Meta's Template Library by topic, use case, industry, language, or name. |
| `createGroup(input, options?)`          | Create a template group from template IDs.                                             |
| `getGroup(groupId, options?)`           | Retrieve a template group.                                                             |
| `updateGroup(groupId, input, options?)` | Change metadata or add/remove template IDs.                                            |
| `deleteGroup(groupId, options?)`        | Delete a template group.                                                               |

The archival guide currently describes automatic/manual archival behavior but
does not publish a stable archive/unarchive request contract, so the client does
not guess one.

## Flow management

Create `@mba-demo/wa-flows` with `accessToken` and `wabaId`.

| Method                                                   | Operation                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `create(input, options?)`                                | Create a Flow, optionally cloning `clone_flow_id` and setting an endpoint URI.        |
| `list(options?)`                                         | List Flows with field selection and cursor pagination.                                |
| `get(flowId, options?)`                                  | Retrieve metadata, status, validation, preview, health, WABA, and application fields. |
| `updateMetadata(flowId, input, options?)`                | Update name, categories, or endpoint URI.                                             |
| `uploadJson(flowId, input, options?)`                    | Upload the `FLOW_JSON` asset and return validation errors.                            |
| `listAssets(flowId, options?)`                           | Retrieve attached assets and their temporary download URLs.                           |
| `getPreview(flowId, options?)`                           | Get a preview URL; `invalidate: true` replaces the prior URL.                         |
| `publish(flowId, options?)`                              | Publish a valid draft Flow.                                                           |
| `deprecate(flowId, options?)`                            | Irreversibly deprecate a published Flow.                                              |
| `delete(flowId, options?)`                               | Permanently delete a draft Flow.                                                      |
| `migrate(input, options?)`                               | Copy selected or all named Flows from another WABA.                                   |
| `getMetric(flowId, options)`                             | Query availability, request-count, error, error-rate, or latency endpoint metrics.    |
| `getEncryptionPublicKey(phoneNumberId, options?)`        | Read the endpoint encryption key and signature status.                                |
| `setEncryptionPublicKey(phoneNumberId, input, options?)` | Set the endpoint encryption public key.                                               |

Supported categories are sign-up, sign-in, appointment booking, lead
generation, contact, customer support, survey, and other. Publishing makes the
Flow and assets immutable; clone it to produce an editable successor. Inspect
all `validation_errors` returned by `uploadJson()` before publishing.

## Media lifecycle

Create `@mba-demo/wa-media` with `accessToken` and `phoneNumberId`.

| Method                                                                         | Operation                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `upload(input, options?)`                                                      | Upload a discriminated audio/document/image/sticker/video input.          |
| `uploadAudio`, `uploadDocument`, `uploadImage`, `uploadSticker`, `uploadVideo` | Typed convenience wrappers around `upload()`.                             |
| `getMediaUrl(mediaId, options?)`                                               | Get MIME type, size, SHA-256, and a temporary authenticated download URL. |
| `download(mediaUrl, options?)`                                                 | Download bytes from the temporary URL with bearer authentication.         |
| `delete(mediaId, options?)`                                                    | Delete media with the configured phone-number ownership guard.            |

Uploads require a `Blob`, filename, and a MIME type allowed for that media
kind. Exported `MEDIA_SIZE_LIMIT_BYTES` values are 16 MiB for audio/video, 100
MiB for documents, 5 MiB for images, and 100 KiB for stickers. Retrieved media
URLs expire after five minutes. Codec and stream-level validation remains the
caller's responsibility.

## Message sending

Create `@mba-demo/wa-messaging` with `accessToken` and `phoneNumberId`.

| Method                                                                           | Operation                                                                                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `send(message, options?)`                                                        | Send the discriminated `SendMessageInput` union.                                                          |
| `sendText`, `sendAudio`, `sendDocument`, `sendImage`, `sendVideo`, `sendSticker` | Send typed text or media messages.                                                                        |
| `sendContacts`, `sendLocation`, `sendReaction`                                   | Send structured contact, location, or reaction messages.                                                  |
| `sendInteractive`                                                                | Send list, reply-button, product, product-list, catalog, Flow, CTA URL, or location-request interactions. |
| `sendTemplate`                                                                   | Send an approved template with typed header/body/button parameters.                                       |
| `markAsRead(messageId, options?)`                                                | Mark an incoming message as read.                                                                         |
| `showTypingIndicator(messageId, options?)`                                       | Mark the message read and show a text typing indicator for up to 25 seconds.                              |

Media references require exactly one of `id` or `link`. Text accepts
`preview_url`; every applicable send helper accepts
`context: { message_id }` for a contextual reply. Reactions use their own
target `message_id` and do not accept reply context.

Template send parameters support text, currency, date/time, image, document,
video, and location values. Button components support quick-reply payloads,
dynamic URL suffixes, coupon codes, catalog actions, and Flow actions.

The package exports both TypeScript types and Zod schemas, including
`whatsappOutboundMessageSchema`, `whatsappSendMessageResponseSchema`, and
`whatsappMessageActionResponseSchema`, for validating dynamic outbound data.

## User moderation

Create `@mba-demo/wa-moderation` with `accessToken` and `phoneNumberId`.

| Method                     | Operation                                                       |
| -------------------------- | --------------------------------------------------------------- |
| `list(options?)`           | Page through blocked users with `limit`, `before`, and `after`. |
| `block(users, options?)`   | Block up to 1,000 WhatsApp user numbers.                        |
| `unblock(users, options?)` | Unblock up to 1,000 users.                                      |

Bulk mutations can partially succeed. Always inspect `added_users` or
`removed_users`, `failed_users`, and the optional top-level `error`, even for a
successful HTTP response. A user is eligible for blocking only after messaging
the business in the preceding 24 hours. The blocklist supports up to 64,000
users.

## Message QR codes

Create `@mba-demo/wa-qr` with `accessToken` and `phoneNumberId`.

| Method                                | Operation                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `create(input, options?)`             | Create a QR code with a prefilled message and optionally generate an SVG or PNG image. |
| `get(code, options?)`                 | Retrieve one message QR code by code.                                                  |
| `getImageUrl(code, format, options?)` | Retrieve a provider-managed SVG or PNG image URL.                                      |
| `list(options?)`                      | List QR codes with field selection, image format, and cursor pagination.               |
| `update(code, input, options?)`       | Replace the QR code's prefilled message.                                               |
| `delete(code, options?)`              | Permanently delete the QR code.                                                        |

Image URLs point to Meta's CDN and should not be treated as durable application
storage. `list()` automatically selects `code` whenever custom fields or an
image format are requested.

## Analytics

Create `@mba-demo/wa-analytics` with `accessToken` and `wabaId`.

| Method                               | Scope and important filters                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `getMessagingAnalytics(options)`     | Sent/delivered counts; Unix `start`/`end`; half-hour, day, or month granularity; phone, product, and country filters. |
| `getConversationAnalytics(options)`  | Conversation/cost metrics by category, type, direction, country, or phone.                                            |
| `getPricingAnalytics(options)`       | Cost/volume by pricing type, category, country, phone, or volume tier.                                                |
| `getTemplateAnalytics(options)`      | Sent, delivered, read, clicked, cost, and conversion metrics for up to 10 template IDs.                               |
| `getTemplateGroupAnalytics(options)` | Sent, delivered, read, clicked, and cost metrics for up to 10 group IDs.                                              |
| `getCallAnalytics(options)`          | Count, cost, and average duration by direction, country, or phone.                                                    |
| `getGroupAnalytics(options)`         | Sent, delivered, read, joined, and left metrics for one group ID.                                                     |
| `enableTemplateAnalytics(options?)`  | Irreversibly enable template analytics for the WABA.                                                                  |

Messaging, conversation, and pricing analytics have a one-year lookback.
Template, template-group, and group analytics have a 90-day lookback. When
`useWabaTimezone` is enabled, template date bounds use `YYYY-MM-DD`. The client
does not enable template analytics implicitly.

## Webhook validation

`@mba-demo/wa-webhooks` has no network client. Its root
`whatsappWebhookSchema` validates a complete callback:

```ts
import { whatsappWebhookSchema } from '@mba-demo/wa-webhooks'

const parsed = whatsappWebhookSchema.safeParse(await request.json())
if (!parsed.success) {
  return new Response('Invalid webhook', { status: 400 })
}

for (const entry of parsed.data.entry) {
  for (const change of entry.changes) {
    // `change.field` narrows `change.value`.
  }
}
```

Supported change families include messages and standby messages, message
statuses/errors, calls, group lifecycle/participant/settings/status updates,
history, template component/quality/status/category events, account alerts and
reviews, business capabilities, phone-number name/quality updates, security,
payments, partner solutions, SMB sync/echoes, message echoes, user preferences,
Business Agent handovers, and tracking events.

Incoming messages are discriminated by `type` and cover audio, buttons,
contacts, documents, edits, images, interactive replies, locations, orders,
reactions, revocations, stickers, system notices, text, unsupported/unknown
messages, and video. Interactive replies cover button, list, Flow, and call
permission responses. Schemas are loose objects: documented tags narrow types
without dropping new provider fields.

Verify `X-Hub-Signature-256` against the exact raw request body before parsing.
The schema validates payload structure; it does not authenticate the callback.

## Meta Business Agent API

Create `@mba-demo/wa-mba` with `accessToken` and `phoneNumberId`. Supply
`businessId` when using budget APIs. Unlike the Graph clients, MBA defaults to
`https://api.facebook.com`, sends `X-API-Version: 2.0.0`, and uses version
`1.0.0` for thread-control calls.

### Agent lifecycle and policy

| Methods                                                      | Purpose                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `getEligibility`, `onboard`, `deleteAgent`                   | Check eligibility, create the agent, and remove it.                                                                        |
| `getSettings`, `updateSettings`                              | Manage rollout, handoff, follow-up, audience, and prohibited phrases. Accept `agentId` when selecting a non-default agent. |
| `listAllowlist`, `addAllowlistEntry`, `removeAllowlistEntry` | Manage consumers when `ai_audience` is `ALLOWLISTED_ONLY`.                                                                 |
| `getBudgets`, `replaceBudgets`                               | Manage Business-scoped AI-turn/token budgets and time windows. Requires `businessId`.                                      |
| `runTest`                                                    | Run an agent test message without using a live consumer conversation.                                                      |

### Connectors and tools

| Methods                                                                                                       | Purpose                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `listConnectors`, `getConnector`, `createConnector`, `updateConnector`, `deleteConnector`                     | Manage HTTP or MCP connectors.                                 |
| `getConnectorLogs`                                                                                            | Query connector request/error statistics over a time range.    |
| `refreshMcpTools`                                                                                             | Refresh tools discovered from an MCP connector.                |
| `upsertConnectorApiKey`, `upsertConnectorOAuth`, `upsertConnectorCertificate`                                 | Configure API-key, client-credentials OAuth, or mTLS material. |
| `listConnectorTools`, `getConnectorTool`, `createConnectorTool`, `updateConnectorTool`, `deleteConnectorTool` | Manage callable connector tool definitions.                    |
| `runConnectorTool`                                                                                            | Execute a connector tool with string or structured input.      |

Connector creation supports `HTTP` and `MCP`; implemented authentication modes
are `NONE`, `API_KEY`, and `OAUTH2_CLIENT_CREDENTIALS`. Credentials are sent
only in their dedicated configuration requests.

### Instructions and business knowledge

| Methods                                                                                                                      | Purpose                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `listSkills`, `getSkill`, `createSkill`, `updateSkill`, `deleteSkill`                                                        | Manage behavioral instructions.                                                                            |
| `listUiSkills`, `getUiSkill`, `createUiSkill`, `updateUiSkill`, `deleteUiSkill`                                              | Manage interactive-message instructions for carousels, URLs, Flows, images, lists, buttons, and locations. |
| `getBusinessInfo`, `replaceBusinessInfo`, `resetBusinessInfo`                                                                | Manage description, policies, payment/shipping details, and contact information.                           |
| `listFaqs`, `getFaq`, `createFaq`, `updateFaq`, `deleteFaq`                                                                  | Manage question/answer knowledge.                                                                          |
| `listKnowledgeFiles`, `getKnowledgeFile`, `uploadKnowledgeFile`, `deleteKnowledgeFile`                                       | Manage uploaded knowledge documents.                                                                       |
| `listKnowledgeWebsites`, `getKnowledgeWebsite`, `createKnowledgeWebsite`, `updateKnowledgeWebsite`, `deleteKnowledgeWebsite` | Manage crawled sites, subdomains, patterns, and single URLs.                                               |

Knowledge uploads are limited to 100 MB and support CSV, DOC/DOCX, JPEG/JPG,
PDF, PNG, and XLSX files.

### Evaluations, events, insights, and control

| Methods                                                    | Purpose                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `listEvaluationCases`, `runEvaluation`, `getEvaluationJob` | Discover cases, start an asynchronous evaluation, and inspect progress/result/error. |
| `getEvaluationDetails`, `getEvaluationSummaries`           | Retrieve detailed scores/transcripts and aggregate summaries.                        |
| `sendAgentEvent`, `getAgentEvent`                          | Submit an asynchronous business event and inspect processing status.                 |
| `getAgentEventInsights`                                    | Aggregate event receipt, success, and latency by date/type.                          |
| `getConversationTurns`                                     | Page through LLM/tool steps for a consumer conversation.                             |
| `getConversationInsights`                                  | Query AI-thread and handoff metrics.                                                 |
| `getToolCallInsights`                                      | Query tool volume, latency, success, error, and timeout rates.                       |
| `transferThreadControl`                                    | `take`, `pass`, or `release` control of a WhatsApp thread.                           |

MBA does not automatically retry. Coordinate polling and retries centrally,
especially for asynchronous evaluation/event jobs and rate-limited resources.

## Typical integration sequence

1. Discover the target account with `wa-waba`.
2. Verify and register its phone number with `wa-registration`.
3. Subscribe the app and configure callbacks with `wa-subscriptions`.
4. Create templates and Flows with `wa-templates` and `wa-flows`.
5. Create click-to-chat QR codes with `wa-qr` when needed.
6. Upload reusable media with `wa-media` and send through `wa-messaging`.
7. Authenticate and parse callbacks with `wa-webhooks`.
8. Use `wa-moderation`, `wa-analytics`, and `wa-mba` as required by the product.

## Verification

Each client package defines `typecheck`, `test`, and `build` scripts. The
webhook schema package defines `typecheck` and `build` because it currently has
no test script.

```bash
yarn workspace @mba-demo/wa-messaging typecheck
yarn workspace @mba-demo/wa-messaging test
yarn workspace @mba-demo/wa-messaging build

# Full repository gate
yarn quality
```

The checked-in [`WhatsApp Cloud API`](../../WhatsApp%20Cloud%20API) collection
contains request examples and links to the canonical Meta documentation used by
these clients.
