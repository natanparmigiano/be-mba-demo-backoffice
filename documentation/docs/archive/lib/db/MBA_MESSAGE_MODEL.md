---
title: MBA message persistence model
sidebar_label: Message persistence model
sidebar_position: 2
---

# MBA message persistence model

The PostgreSQL `chats` schema turns inbound WhatsApp webhooks and outbound
Cloud API operations into an organization-scoped chat model. Its tables live
in `src/schema/chats.ts`; channel-adjacent archives remain in
`src/schema/mba.ts`. This document defines the data contracts, ingestion
transactions, indexing rationale, and remaining design decisions.

## Quick start

Read the guarantees below before changing persistence. Make schema changes in
`lib/db/src/schema/chats.ts`, generate a new migration, and validate retries,
ordering, and tenant isolation before applying it.

## Core guarantees

- PostgreSQL organization ownership is the tenant boundary from channels
  through chats, messages, and events.
- A durable `chat_id` identifies each direct or group stream; Meta billing
  “conversation” IDs never replace it.
- Provider IDs, client IDs, and deterministic event keys make webhook retries
  idempotent.
- Status history remains append-only, while timestamp and precedence rules
  prevent out-of-order delivery updates from regressing the current message.
- Normalized columns serve known query paths, and typed JSONB preserves the
  complete additive provider payload.

The primary ownership path is:

```text
auth.organization -> chats.channels -> chats.contacts / chats.groups
                                   -> chats.chats -> chats.messages
                                                   -> chats.message_status_events
                                                   -> chats.chat_events
```

## Scope

The model handles:

- Incoming `value.messages[]` messages.
- Meta Business AI `value.standby[]` messages.
- Message-shaped history records.
- SMB message echoes representing outbound messages.
- Incoming messages receive the local `read` status when the chat is handled by the MBA agent and `delivered` otherwise. AI-owned inbound traffic advances the local read cursor without increasing the unread count. Provider delivery statuses remain `sent`, `delivered`, `read`, `played`, `failed`, and `deleted`.
- Status-associated recipients, conversation data, pricing, callback data, and errors.
- Edit, revoke, reaction, context, referral, identity, group, contact, and media information carried by message objects.
- Outbound text, media, contact, location, reaction, template, product, catalog, list, reply-button, and Flow messages.
- The local outbound dispatch lifecycle before Meta assigns a `wamid`.
- WhatsApp channel configuration and credentials.
- Durable direct and group chat identities.
- Current group metadata from lifecycle, settings, participant, and status webhooks.
- Chat-level billing-window, Business Agents, handover, group, call, and user-preference events.

Payment statuses, template events, account events, and generic webhook fields without a resolvable chat identity are deliberately outside the chat model.

## Core entities

### `chats.channels`

Channels are provider accounts owned by an application agent. The discriminator is a Drizzle text enum containing only `whatsapp` today; Instagram and Messenger can be added when their provider-specific fields and ingestion paths are designed. Only contacts and groups reference channels. Chats derive their channel through that participant, and messages derive it through their chat.

| Column                        | Purpose                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                          | Internal channel identity used by the webhook route and foreign keys.                         |
| `organization_id`             | Required tenant owner referencing Better Auth's `auth.organization`.                          |
| `type`                        | Provider discriminator; currently restricted in TypeScript to `whatsapp`.                     |
| `agent_id`                    | Application agent that owns the channel; remains text until an agent entity exists.           |
| `wa_phone_number`             | Display/dialable number matching webhook `metadata.display_phone_number`.                     |
| `wa_phone_number_id`          | Meta phone-number ID matching webhook `metadata.phone_number_id` and used by Cloud API calls. |
| `wa_waba_id`                  | WhatsApp Business Account ID matching webhook `entry[].id`.                                   |
| `wa_business_id`              | Meta Business Portfolio ID that owns the WABA.                                                |
| `wa_app_id`                   | Meta application ID used by the webhook integration.                                          |
| `wa_app_secret`               | Sensitive application secret used for webhook signatures; never expose or log it.             |
| `wa_webhook_verify_token`     | Sensitive per-channel token used for Meta's webhook subscription challenge.                   |
| `wa_system_user_access_token` | Sensitive Cloud API token; never expose or log it.                                            |
| `created_at`                  | Local creation time.                                                                          |
| `updated_at`                  | Local configuration-update time.                                                              |

`(type, wa_phone_number_id)` is unique, and `organization_id` is indexed for tenant-scoped channel listings. The WhatsApp columns are required while WhatsApp is the only supported channel type; introducing another provider will require making them conditional or moving provider credentials into provider-specific tables.

### `chats.groups`

Groups are first-class WhatsApp entities, symmetrical with contacts. They can be discovered by a message or by a group webhook before any message exists. Each group is unique by `(channel_id, provider_group_id)` and owns the mutable metadata projected from Meta's group webhooks.

| Column               | Webhook mapping and purpose                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Internal stable group identity used by `chats.group_id`.                                                                                              |
| `channel_id`         | Foreign key to the channel selected by endpoint `:id`; scopes Meta group identifiers.                                                                 |
| `provider_group_id`  | `messages[].group_id` or `groups[].group_id`.                                                                                                         |
| `subject`            | Latest `groups[].subject`.                                                                                                                            |
| `description`        | Latest `groups[].description`.                                                                                                                        |
| `invite_link`        | Latest `groups[].invite_link`.                                                                                                                        |
| `join_approval_mode` | Latest `groups[].join_approval_mode`.                                                                                                                 |
| `last_webhook_field` | Outer field: `group_lifecycle_update`, `group_participants_update`, `group_settings_update`, or `group_status_update`.                                |
| `last_event_type`    | Inner `groups[].type`. It remains raw text because the checked-in webhook contract intentionally leaves this set open.                                |
| `last_event_at`      | Parsed `groups[].timestamp`.                                                                                                                          |
| `raw_group`          | Deeply typed latest `groups[]` object, retaining request/join IDs, actor, participant changes, profile/subject/description objects, errors, and more. |
| `first_seen_at`      | Local first-observation time.                                                                                                                         |
| `updated_at`         | Local projection-update time.                                                                                                                         |

No group lifecycle or status event deletes a group. A removal/closure event only updates its latest event fields and JSONB snapshot.

### `chats.chats`

This is the durable message-stream identity used by application code. A direct
chat points to exactly one contact and a group chat points to exactly one group.
A database check enforces that exclusive identity based on `kind`. The chat
deliberately duplicates the identity's channel and organization so
tenant-scoped inbox reads use one composite index instead of joining and
sorting both identity branches.

The distinction matters because Meta uses the word “conversation” for unrelated billing windows in message status webhooks. Those temporary values are stored on messages as `billing_conversation_*`; they never identify an application chat.

| Column                   | Webhook mapping and purpose                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `id`                     | Internal durable chat identity and the target of `messages.chat_id`.                        |
| `kind`                   | `group` when a message has `group_id` or the event is a group webhook; otherwise `direct`.  |
| `handled_by`             | Current owner inferred from routing: `mba` for `standby[]`, `application` for `messages[]`. |
| `channel_id`             | Denormalized source channel for direct chat-to-channel joins.                               |
| `organization_id`        | Denormalized tenant key leading the organization inbox index.                               |
| `contact_id`             | Internal `contacts.id` for the one remote party in a direct chat; null for group chats.     |
| `group_id`               | Internal `groups.id` for a group chat; null for direct chats.                               |
| `latest_message_id`      | Denormalized pointer to the newest message, indexed for cursor and range lookups.           |
| `latest_read_message_id` | Application read cursor; distinct from Meta's outbound delivery status.                     |
| `unread_message_count`   | Denormalized unread inbound count for constant-time inbox rendering.                        |
| `created_at`             | Local first-observation time.                                                               |
| `updated_at`             | Local projection-update time.                                                               |

Both message pointers are nullable for an empty chat and use `ON DELETE SET NULL`. Persistence code must only assign messages belonging to the same chat; the circular foreign keys guarantee existence but PostgreSQL cannot express that same-chat invariant with an ordinary foreign key. A newly inserted inbound message increments `unread_message_count` in the same transaction that advances the latest-message pointer. Marking a chat read copies that pointer to `latest_read_message_id` and resets the counter atomically, avoiding per-chat counting in inbox reads.

Composite foreign keys make the denormalization database-enforced rather than advisory: `(contact_id, channel_id)` must resolve to the same contact row, `(group_id, channel_id)` must resolve to the same group row, and `(channel_id, organization_id)` must resolve to the same channel owner. Supporting unique indexes on those referenced pairs allow PostgreSQL to reject any future insert or update that would drift from the normalized ownership chain.

### `chats.chat_events`

This append-only timeline stores activity that changes or describes a chat but is not itself a message or a message delivery status. It includes Meta billing windows announced inside status payloads, Business Agents handovers and agent events, group lifecycle/participant/settings/status changes, calls and call statuses, and user-preference changes.

`event_type` is the normalized application category and `source` records the outer webhook field. Provider-owned event/action names remain raw text because Business Agents and group event taxonomies are additive. `provider_conversation_id` preserves Business Agents correlation values, while `billing_conversation_id` preserves WhatsApp's unrelated temporary billing window. Neither replaces the eternal `chat_id`.

Every row has a deterministic `deduplication_key`, allowing retry-safe upserts without a pre-read. `raw_event` is deeply typed JSONB and retains additive provider fields. Promoted agent, owner, actor, billing, pricing, and time columns cover the application query paths without querying JSONB.

Indexes cover the main timeline `(chat_id, occurred_at, id)`, filtered chat timeline `(chat_id, event_type, occurred_at)`, provider event investigation, actor history, billing-window correlation, and the unique retry key. There is deliberately no JSONB GIN index until a concrete JSON-path query exists.

#### Chat resolution

| Input shape                           | Resolution                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Inbound message with `group_id`       | Upsert `groups` by `(channel_id, provider_group_id)`, upsert its chat, and attach the message.          |
| Inbound direct message                | Upsert the contact from `value.contacts[]`, then upsert direct chat by `(channel_id, contact_id)`.      |
| Outbound individual request           | Resolve `to` through the contact, then upsert its direct chat.                                          |
| Message status with `recipient_type`  | Resolve the existing message first; if status arrives first, use recipient identity to create the chat. |
| Any `group_*` webhook with `groups[]` | Upsert `groups` by its provider ID, apply present metadata, and ensure its group chat exists.           |
| History thread or SMB message echo    | Determine the remote party from `from`/`to`, then resolve the same direct chat.                         |

`added_participants` and `removed_participants` identify contacts affected by a group event; `failed_participants` reports failed mutations and must not change membership. The complete arrays are retained in `groups.raw_group`. A normalized membership/history table should only be added when participant querying is required, rather than duplicating that data speculatively.

### `chats.messages`

This is the canonical message projection used by application queries. It contains stable identifiers, searchable fields, and UI-facing content as columns. Scalar text and media metadata avoid JSON traversal on hot timeline reads; dedicated typed JSONB columns expose structured message variants. A deeply typed `raw_message` JSONB value remains the lossless source payload.

The current status and its associated metadata are copied onto this row so reads do not need to reconstruct the latest state from an event stream.

A status webhook can arrive before the full message is available, and an outbound row exists before Meta returns a provider ID. For those reasons, provider- and message-only fields are nullable. A later response, message, echo, or status event completes the same row.

`provider_message_id` is globally unique, while `(chat_id, client_message_id)` scopes application idempotency to one chat. PostgreSQL permits multiple nulls in these indexes, allowing status-first and queued-outbound rows while retaining idempotent upsert keys once an identifier exists.

## Type and payload strategy

Finite text values use Drizzle's `text(name, { enum: values })` form. This produces precise TypeScript unions without creating PostgreSQL enum types, check constraints, or other database objects. The exported `as const` arrays are the single source for both column inference and application types.

JSONB remains native PostgreSQL JSONB, but every JSON column uses a concrete
TypeScript type from `@mba-desk/wa-webhooks` or `@mba-desk/wa-messaging`. No
complete persisted message or status is typed as a generic record; unknown
values remain only where Meta explicitly permits custom Flow data or additive
loose-object fields.

The outbound schemas cover the checked-in Cloud API collection, including contacts, templates and their parameters, media by ID or link, list and reply-button messages, single- and multi-product messages, catalog messages, and published or draft Flows.

## `chats.contacts` column rationale

This table represents WhatsApp participants from webhook `value.contacts`, plus the normalized recipient returned by the outbound send API. Contact cards attached to a `contacts` message are message content and are projected into `messages.contact_data`; they do not create participant rows.

| Column              | Why it exists                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                | Stable internal identity used by messages.                                                        |
| `channel_id`        | Required channel foreign key that scopes the contact's Meta identifiers.                          |
| `wa_id`             | Primary individual identifier supplied by standard Cloud API webhooks.                            |
| `user_id`           | Newer user/group identity supplied when a phone-style `wa_id` is insufficient.                    |
| `parent_user_id`    | Parent identity included in group-aware webhook payloads.                                         |
| `identity_key_hash` | Latest identity-key metadata; optional because most ordinary contacts omit it.                    |
| `input`             | Original recipient input returned by outbound send responses; optional for inbound-only contacts. |
| `profile_name`      | Searchable display name from `profile.name`.                                                      |
| `profile_username`  | Optional username from newer profile payloads.                                                    |
| `raw_contact`       | Deeply typed JSONB preserving the complete webhook or send-response contact object.               |
| `first_seen_at`     | First local observation time.                                                                     |
| `last_seen_at`      | Most recent observation time, updated on contact upsert.                                          |

Channel-scoped unique indexes on `wa_id` and `user_id` provide the two supported upsert paths. Both identifiers remain nullable because the webhook schema permits partial contact shapes. A contact without either identifier can be retained, but cannot be safely deduplicated until the upstream contract supplies one.

## `chats.messages` column rationale

| Column                            | Why it exists                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                              | Stable internal identity and foreign-key target independent of Meta identifiers.                                                                                                                             |
| `chat_id`                         | Required eternal direct/group chat owning the message.                                                                                                                                                       |
| `contact_id`                      | Nullable link to the remote participant; group/system events may not resolve to one contact.                                                                                                                 |
| `client_message_id`               | Idempotency key for an outbound message before Meta returns a `wamid`; optional for webhook-created rows.                                                                                                    |
| `provider_message_id`             | Meta `wamid` used by statuses and replies; optional while an outbound request is queued.                                                                                                                     |
| `source`                          | Typed first-observed source: message webhook, standby, history, echo, status, or outbound API.                                                                                                               |
| `direction`                       | Typed inbound/outbound partition used by virtually every conversation query.                                                                                                                                 |
| `ai_generated`                    | Marks outbound messages observed through a Business AI standby echo; false for ordinary application and customer traffic.                                                                                    |
| `message_type`                    | Typed union of every inbound type plus outbound-only `template`; nullable only for status-first rows.                                                                                                        |
| `interactive_type`                | Typed subtype for reply/list/flow/product/catalog behavior without inspecting JSONB.                                                                                                                         |
| `text_content`                    | Primary display text extracted from text, reply, caption, location, order, reaction, system, template, contact-card, or edited content.                                                                      |
| `media_*`                         | Media ID, URL/link, MIME type, SHA-256, filename, caption, voice-note flag, and animated-sticker flag.                                                                                                       |
| `media_file_path`                 | Durable `@mba-desk/files` object key after verified provider media has been archived; nullable until media bytes are available.                                                                              |
| `*_data` content columns          | Typed interactive, contact, location, button, order, reaction, template, system, edit, revoke, context, referral, identity, and error data.                                                                  |
| `dispatch_status`                 | Separate local state machine for queued/sending/accepted/failed/unknown outbound requests; provider delivery status has different semantics.                                                                 |
| `sender_phone`                    | Normalized `from` value for direct chat lookup.                                                                                                                                                              |
| `sender_user_id`                  | Group/user addressing supplied by newer webhook shapes.                                                                                                                                                      |
| `sender_parent_user_id`           | Parent identity supplied by newer webhook shapes.                                                                                                                                                            |
| `recipient_id`                    | Outbound `to` or status `recipient_id`; central to outbound conversation lookup.                                                                                                                             |
| `recipient_user_id`               | User recipient supplied by status webhooks.                                                                                                                                                                  |
| `recipient_parent_user_id`        | Parent recipient identity supplied by status webhooks.                                                                                                                                                       |
| `recipient_type`                  | Typed `individual`/`group` distinction shared by outbound requests and statuses.                                                                                                                             |
| `recipient_participant_id`        | Group participant from status webhooks; optional because direct messages do not provide it.                                                                                                                  |
| `recipient_identity_key_hash`     | Status identity metadata; optional and retained because it is not recoverable elsewhere.                                                                                                                     |
| `provider_timestamp`              | Exact original message timestamp string for audit and reparsing.                                                                                                                                             |
| `occurred_at`                     | Parsed UTC message time used for sorting and range queries.                                                                                                                                                  |
| `webhook_entry_time`              | Optional envelope time, useful for lag analysis but unavailable for locally created outbound rows.                                                                                                           |
| `context_message_id`              | Reply/forward relationship extracted for indexed lookup.                                                                                                                                                     |
| `target_message_id`               | Reaction/edit/revoke target kept separate because it is not ordinary reply context.                                                                                                                          |
| `raw_message`                     | Deeply typed lossless union of inbound, outbound, history, and echo message bodies.                                                                                                                          |
| `send_response`                   | Deeply typed Cloud API response containing normalized contacts and assigned `wamid`.                                                                                                                         |
| `status`                          | Local `read` state for MBA-owned inbound messages, `delivered` for other inbound messages, or the latest typed Meta delivery state for outbound messages; intentionally separate from local dispatch status. |
| `status_provider_timestamp`       | Exact source timestamp of the projected status.                                                                                                                                                              |
| `status_occurred_at`              | Parsed status time used to reject out-of-order updates.                                                                                                                                                      |
| `status_updated_at`               | Local time at which the current projection changed.                                                                                                                                                          |
| `biz_opaque_callback_data`        | Application correlation data returned by Meta in statuses.                                                                                                                                                   |
| `billing_conversation_id`         | Meta billing-window identifier; deliberately distinct from the internal chat foreign key.                                                                                                                    |
| `billing_conversation_expires_at` | Parsed billing-window expiration used for service-window decisions.                                                                                                                                          |
| `billing_conversation_origin`     | Typed billing origin from the webhook contract.                                                                                                                                                              |
| `pricing_billable`                | Directly queryable billing flag.                                                                                                                                                                             |
| `pricing_model`                   | Optional raw text because the checked-in webhook schema does not publish a closed value set.                                                                                                                 |
| `pricing_category`                | Optional raw text for the same compatibility reason. Revisit when the source contract becomes closed.                                                                                                        |
| `pricing_type`                    | Optional raw text for the same compatibility reason. Revisit when the source contract becomes closed.                                                                                                        |
| `status_errors`                   | Deeply typed errors associated with the current status projection.                                                                                                                                           |
| `raw_status`                      | Deeply typed complete latest status, preserving additive loose-object fields.                                                                                                                                |
| `received_at`                     | First local observation time.                                                                                                                                                                                |
| `updated_at`                      | Last projection mutation time, set explicitly by persistence code.                                                                                                                                           |

## `chats.message_status_events` column rationale

| Column                            | Why it exists                                                       |
| --------------------------------- | ------------------------------------------------------------------- |
| `id`                              | Stable event identity.                                              |
| `message_id`                      | Required owner; cascades when the canonical message is deleted.     |
| `status`                          | Typed immutable status value for this event.                        |
| `provider_timestamp`              | Exact timestamp string and part of retry deduplication.             |
| `occurred_at`                     | Parsed UTC time for event ordering.                                 |
| `recipient_id`                    | Standard recipient identifier from message statuses.                |
| `recipient_user_id`               | User-addressing variant from newer status payloads.                 |
| `recipient_parent_user_id`        | Parent identity supplied by newer status payloads.                  |
| `recipient_type`                  | Typed group/individual recipient classification.                    |
| `recipient_participant_id`        | Participant within a group status.                                  |
| `recipient_identity_key_hash`     | Identity metadata that cannot be reconstructed later.               |
| `biz_opaque_callback_data`        | Correlates the delivery event to application-defined outbound data. |
| `billing_conversation_id`         | Meta conversation/billing identifier at this status transition.     |
| `billing_conversation_expires_at` | Conversation window expiration at this transition.                  |
| `billing_conversation_origin`     | Typed conversation category.                                        |
| `pricing_billable`                | Billing decision attached to this transition.                       |
| `pricing_model`                   | Raw provider text; optional pending a closed upstream value set.    |
| `pricing_category`                | Raw provider text; optional pending a closed upstream value set.    |
| `pricing_type`                    | Raw provider text; optional pending a closed upstream value set.    |
| `errors`                          | Deeply typed failure details for this specific transition.          |
| `raw_status`                      | Complete typed source object for audit and future additive fields.  |
| `received_at`                     | Local receipt time for retry and lag analysis.                      |

### `chats.message_status_events`

This append-only table preserves every distinct status delivery. It protects the audit trail when the mutable status projection on `chats.messages` changes.

`(message_id, status, provider_timestamp)` is unique so webhook retries are idempotent. Each event retains the complete raw status object along with normalized recipient, conversation, pricing, callback, and error fields.

Deleting a message cascades to its status history.

## Status ingestion transaction

Process a message status inside one database transaction:

1. Parse the webhook with `whatsappWebhookSchema`.
2. Find or create `chats.messages` using the globally unique `status.id`.
3. For a status-first row, resolve the channel and recipient chat, set `source = 'status'`, and set `direction = 'outbound'`.
4. Insert `chats.message_status_events`, ignoring an exact retry conflict.
5. Update the current status projection only when the incoming parsed timestamp is newer than `status_occurred_at`.
6. For equal timestamps, apply a deterministic precedence rule so retries cannot downgrade state.
7. Commit the event and projection together.

Suggested equal-timestamp precedence is:

```text
sent < delivered < read < played
```

`failed` and `deleted` are terminal branches and should replace the current value only when their timestamp is newer, rather than being assigned an arbitrary rank in the delivery sequence.

Never update status solely based on webhook arrival time: Meta can retry or deliver webhooks out of order.

## Webhook transaction and index coverage

Each validated event is persisted in one transaction. Every equality lookup used by ingestion is backed by a primary key or unique B-tree index:

- Channel lookup: `channels.id` primary key.
- Contact reconciliation: `(channel_id, wa_id)` and `(channel_id, user_id)`.
- Group upsert: `(channel_id, provider_group_id)`.
- Direct/group chat upsert: unique `contact_id` and `group_id` indexes.
- Message and status lookup: unique `provider_message_id`.
- Outbound idempotency: `(chat_id, client_message_id)`.
- Status retry deduplication: `(message_id, status, provider_timestamp)`.
- Inbox cursor lookup: `(organization_id, updated_at, id)`.
- Message timeline cursor lookup: `(chat_id, occurred_at, id)`.

Potential bottlenecks to monitor:

- Large history webhooks are currently processed sequentially inside one transaction. Batch inserts should be considered if production history payloads create measurable lock time.
- The HTTP process loads channel credentials by primary key before every POST, and the worker loads them again before persistence. A bounded cache could remove those reads, but it needs explicit invalidation when secrets rotate.
- Contact reconciliation checks both indexed external identities. If Meta supplies identifiers that already belong to different rows, ingestion intentionally fails rather than merging contacts implicitly.
- Kafka processing is at least once. Persistent poison events will need a retry/dead-letter policy before operating at high volume.
- JSONB columns intentionally have no GIN indexes because ingestion never searches inside them. Add targeted indexes only after concrete JSON query patterns appear.

## Message ingestion transaction

For inbound messages, standby, history, message echoes, or outbound sends:

1. Resolve or upsert the eternal direct/group chat.
2. Set `chats.handled_by` to `mba` for `standby[]` or `application` for `messages[]`; history, echoes, and statuses do not change ownership.
3. Upsert by the provider message ID or the chat-scoped client message ID.
4. Fill message fields without clearing status fields already received by a status-first row.
5. Preserve the original provider timestamp string and also store its parsed UTC value.
6. Extract edit, revoke, or reaction targets into `target_message_id` without mutating the target message.
7. Project UI-facing text, media metadata, the pre-archived media file key when supplied, and structured variant data into dedicated nullable columns.
8. Store the exact typed object in `raw_message` as the lossless source payload.
9. Advance `chats.latest_message_id` in the same transaction when the inserted message is newer.
10. For a newly inserted Business Agent message, append the idempotent
    `stats.events` `agent_message` fact in the same transaction.

Human composer sends append an idempotent `human_message` fact after the
outbound row is persisted. The first such send after a handoff also appends one
`first_human_response` fact keyed by the chat and handoff timestamp, with the
elapsed milliseconds. Handoff and assignment state changes append their
corresponding statistics fact inside the same transaction as the chat update.

## Field mapping

| Webhook data                  | Message projection                                         |
| ----------------------------- | ---------------------------------------------------------- |
| Endpoint `:id`                | Resolve `chats.channels.id`                                |
| `entry.id`                    | Validate/update `channels.wa_waba_id`                      |
| `entry.time`                  | `webhook_entry_time`                                       |
| `value.metadata.*`            | Validate/update channel phone-number fields                |
| `value.contacts`              | Upsert `chats.contacts`; link `contact_id`                 |
| Contact or message `group_id` | Upsert `chats.groups` and its chat; link `chat_id`         |
| `message.id` / `status.id`    | `provider_message_id`                                      |
| `message.from*`               | Sender columns                                             |
| Status `recipient_*`          | Recipient columns                                          |
| Message context               | `context_message_id`, forwarding flags, and `context_data` |
| History `history_context`     | `raw_message`                                              |
| Reaction/edit/revoke target   | `target_message_id`                                        |
| Text and media content        | `text_content` and the `media_*` columns                   |
| Archived provider media key   | `media_file_path`                                          |
| Referral and identity         | `referral_data` and `identity_data`                        |
| Type-specific message object  | Its dedicated typed `*_data` JSONB column                  |
| Unsupported/unknown errors    | `errors_data`                                              |
| Status `conversation`         | `billing_conversation_*` columns                           |
| Status `pricing`              | Pricing columns                                            |
| Status `errors`               | `status_errors` and status-event `errors`                  |
| Complete source objects       | `raw_message` and `raw_status`                             |

## Open design decisions

- The composer supplies a UUID `client_message_id`; decide whether other outbound producers should use the same caller-owned idempotency contract.
- Decide whether failed outbound HTTP response bodies need a separately typed `send_error` JSONB column; it is omitted until the sending client contract exists.
- Define whether generic `message_echoes` payloads can be promoted into this model once their public payload contract stabilizes.
- Add JSONB GIN indexes only for demonstrated query patterns; they add meaningful write and storage cost.
- Consider partitioning status events only after real volume requires it.
