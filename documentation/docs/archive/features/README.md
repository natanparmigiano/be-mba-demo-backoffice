# Product features

MBA Desk is an organization-scoped workspace for operating WhatsApp channels
and Meta Business Agents. The product exposes the following features.

## Quick start

- **Workspace** owns daily operations: home, queue, chat, teams, contacts,
  groups, templates, and sending.
- **Manager** owns configuration and developer tooling: agents, channels,
  webhooks, functions, MCPs, API keys, Studio, and playgrounds.
- **Both applications** expose organization and application administration.

Use this document as the capability inventory. Start with the application
guides under [Applications](../apps/README.md) for setup and implementation boundaries.

## Organization workspaces

- Create organizations with a name, slug, primary brand color, and custom
  logo.
- Use the organization's custom logo in place of the default corner logo.
- Switch the active organization from the application shell.
- Rename or delete an organization, subject to the member's organization role.
- List organization members, invite members as admins or members, and remove
  members.
- Scope channels, conversations, contacts, groups, agents, custom code, API
  keys, and operational data to the active organization.

## Authentication and session management

- Sign in with email and password and optionally keep the session persistent.
- Discover a domain-verified SSO provider by entering a work email.
- Return users to the originally requested private route after sign-in.
- Sign out from the application shell.
- Separate application-wide admin roles from organization owner, admin, and
  member roles.

## Localization, themes, and branding

- Use the interface in English, Brazilian Portuguese, or Spanish.
- Select light, dark, or system appearance.
- Apply the active organization's primary color throughout the authenticated
  interface.

## Performance dashboard

- View channel-scoped WhatsApp and Meta Business Agent performance counters for
  the active organization.
- Open the product's main workflows and quick references from the dashboard.

## Organization-scoped inbox

- Browse direct-contact and group conversations with previews and unread
  counts.
- Open a conversation through a stable, shareable URL and retain the selection
  across refresh and browser navigation.
- Load older inbox and timeline entries with cursor-based infinite scrolling.
- Receive live inbox and selected-conversation updates, with a visible warning
  and reconnect action if the event stream is lost.
- Mark the latest inbound WhatsApp message as read after the conversation is
  rendered.
- View message events and ownership changes in the chronological timeline.
- See whether the conversation is controlled by a human operator or the AI,
  and transfer control in either direction.

## Rich WhatsApp messaging

- Render text, images, videos, documents, voice notes, audio, stickers,
  contacts, locations, location requests, reply buttons, lists, URL buttons,
  and carousels.
- Display timestamps, reactions, forwarding state, AI-generated markers, and
  sending, error, sent, delivered, read, or played status.
- Open images in a keyboard- and touch-accessible lightbox.
- Format WhatsApp-style message text safely.
- When a human owns the conversation, send text, media, contacts, locations,
  and approved templates from the composer.
- Record compatible voice notes in the browser with a live waveform before
  sending.
- React to provider-backed messages from the message context menu with a
  searchable, categorized emoji picker.

## Contacts management

- Search and cursor-paginate contacts belonging to the active organization's
  channels.
- Inspect contact details and WhatsApp profile fields.
- Create and edit contacts by WhatsApp ID without requiring a provider user ID.
- Automatically create the direct conversation when a contact is created.
- Preview the impact of deletion and confirm it with the contact identifier
  before removing the contact and its direct conversation data.

## Groups directory

- Search and cursor-paginate WhatsApp groups belonging to the active
  organization's channels.
- Open read-only group details.

## WhatsApp channel management

- Create and edit named WhatsApp connections while retaining the display phone
  number as secondary identity.
- View channel identity and provider status.
- Manage the public WhatsApp business profile, including its display name,
  about text, description, contact details, category, websites, and profile
  picture.
- Request a verification code by SMS or voice, verify it, register or
  deregister a Cloud API phone number, and manage the two-step PIN.
- Create, list, update, download, and delete message QR codes.
- Configure conversational icebreakers and commands.
- Configure webhook forwarding for the channel.
- Manage channel credentials.
- Preview the local data affected by deletion and require typed confirmation
  before deleting a channel.

## Meta Business Agent management

MBA Desk provides one channel-scoped workspace for onboarding, configuring,
extending, evaluating, and backing up a Meta Business Agent.

### Onboarding and controls

- Use registered WhatsApp channels as the entry point to agent management;
  agent configuration stays unavailable until Cloud API registration is
  confirmed.
- Check a channel's Meta Business Agent eligibility and onboard an eligible
  channel.
- Enable or disable rollout and select the rollout audience.
- Configure human-handoff behavior and its customer-facing message.
- Maintain prohibited phrases and an allowlist of phone numbers.
- Edit the agent's business information.
- Manage the agent's QR codes, icebreakers, and commands from the same shared
  channel controls.

### Skills and knowledge

- Create, edit, and delete agent skills with a title, description,
  instructions, and displayed status.
- Create, edit, and delete question-and-answer FAQs.
- Add and remove website knowledge sources.
- Upload, inspect, and remove knowledge files.

### Connectors

- Create and edit HTTPS connectors and their individual tools.
- Normalize connector and tool names for their API-facing identifiers.
- Associate a connector with an organization MCP package; MBA Desk then
  creates a dedicated 12-month API key and supplies its MCP endpoint.
- Rotate keys for MCP-associated connectors and show expiry warnings.
- Inspect recent connector request logs.

### Evaluations

- Browse the evaluation scenarios configured for an agent.
- Open a scenario and start an asynchronous evaluation run when authorized.
- Follow job progress and review scores, summaries, highlights, and failures.

### Backups and restore preparation

- Create durable AGTX snapshots of an agent's current configuration and locally
  archived knowledge files.
- Browse backups with creation date, filename, and size.
- Select a backup for restoration; MBA Desk opens it in the import workflow so
  required files and credentials can be reviewed before applying changes.

## Portable agent export and import

- Export settings, allowlists, business information, skills, QR codes,
  conversational components, FAQs, websites, connectors and tools, associated
  MCPs, and locally available knowledge files as a versioned `.agtx` package.
- Show staged export progress and identify provider-only knowledge files that
  cannot be included in the package.
- Preview a local package before upload, then inspect its resources on the
  server.
- Select which configuration areas to import and leave unselected areas
  unchanged.
- Request only the missing files, connector credentials, certificates, and
  private keys required by the selected import areas.
- Optionally create a backup before importing.
- Show imported, skipped, and failed stages, retain provider validation
  details, and warn when a failed import may have applied earlier changes.
- Preserve the destination agent's existing rollout state during import.

## Agent Studio

- Create, search, rename, and delete organization-scoped AGTX projects.
- Import a local AGTX project and download the current project as a package.
- Edit the AGTX manifest, MCPX definitions, remote MCP connectors, and packaged
  files in a full-screen workspace.
- Autosave changed projects every five seconds.
- Use an AI authoring assistant that can inspect the project, merge-patch the
  manifest and MCP definitions, add remote MCP connectors, and manage packaged
  files.

## Template message management

- Browse provider-backed templates by channel with name, category, and approval
  status filters and cursor pagination.
- Preview templates in a WhatsApp-style message view.
- Create, edit, and delete templates when the organization role permits it.
- Configure language, category, named or positional parameters, and optional
  category changes.
- Visually compose header, body, footer, and button components with
  operation-specific validation.
- Upload example header media.
- Configure advanced carousel and limited-time-offer content as JSON.
- Review Meta approval state, quality score, rejection reason, and update time.

## Template sending and delivery history

- Select a channel, recipient, and approved template.
- Fill named or positional text parameters and provide supported header media.
- Preview the resolved WhatsApp message before sending.
- Choose the Messages API or Marketing Messages API for delivery.
- Browse cursor-paginated sends and filter them by template, recipient, API,
  and delivery status.

## Webhook activity explorer

- Browse the archive of received and processed webhook payloads.
- Filter events by channel and arrival date range.
- Inspect the full JSON payload plus processing and total elapsed time.
- Load additional results, refresh the archive, and export matching activity.

## Custom functions

- Browse and edit organization-scoped JavaScript functions.
- Define typed function parameters and normalize function names to snake case.
- Restore an earlier function revision.
- Run saved code in an isolated test environment.
- Inspect the latest 20 executions for a function.

## MCP package management

- Create organization-scoped MCP packages from active custom functions.
- Add or remove functions from a package.
- Copy the stable, Bearer-authenticated Streamable HTTP endpoint for a package.
- Export an MCP package, including its revision history, as MCPX YAML.
- Preview an MCPX import's names, removals, affected history, API-key scopes,
  and blockers before explicitly approving the transactional overwrite.

## API key management

- Create and revoke organization API keys.
- Restrict a key to selected individual functions and MCP packages.
- Authorize the live membership of an allowed MCP package, so its function
  scope follows later package membership changes.

## WhatsApp API playground

- Select an organization channel and inspect the request and response for each
  supported operation.
- Exercise Meta Business Agent, phone registration, messaging, media, Marketing
  Messages, message QR code, conversational component, Flow, template,
  analytics, moderation, subscription, WABA, and webhook APIs.
- Cover the complete Flow management surface, including assets, lifecycle
  transitions, metrics, migration, previews, and encryption keys.
- Upload media directly or use short-lived file-store URLs for messaging
  attachments.
- Export registered playground operations as a Postman collection.
- Allow members to inspect read operations while restricting mutations to
  organization owners and admins.

## Application administration

- Search application users and create users with a temporary password and an
  application user or admin role.
- Change application roles, rename users, reset passwords, revoke sessions,
  ban or unban users, impersonate users, and remove users.
- Search all organizations, inspect their members and the current admin's
  access, and open an organization for management.
- Add or promote the current application admin as an organization admin.
- Delete an organization after explicit confirmation.

## Public design system catalog

- View reusable foundations, forms, navigation, data-display, feedback, and
  chat components without signing in.
- Inspect representative component states and chat message variants in both
  application themes and supported responsive layouts.
