---
title: MBA Desk product context
sidebar_label: Product context
sidebar_position: 2
---

# MBA Desk — Product Context Pack

This is the product-positioning source for MBA Desk. It is written for BE
leadership, product partners, and authors of demos or launch material. Use the
[feature inventory](./) for implemented capabilities and the
[documentation index](../) for engineering setup.

MBA Desk fills the human-operations gap for WhatsApp numbers registered
directly through Cloud API. It combines an operational Workspace with a
separate Manager surface for high-impact configuration and developer tooling.
The immediate product is an internal BE accelerator; evidence from that use
can inform, but must not be conflated with, a future externally sold product.

## Quick start

Use the identity and positioning sections when preparing product material, then
confirm implementation claims against the [feature inventory](./). For
engineering setup and package ownership, start from the
[documentation index](../).

## 1. Identity and naming

|                           |                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Current product name**  | **MBA Desk**                                                                                                                                |
| **Prior / working names** | MBA Demo Backoffice · MBA Demo Inbox · "Agent Desk" (used on the Oct 5 pitch deck)                                                          |
| **One-liner**             | An organization-scoped workspace for operating WhatsApp channels and Meta Business Agents, including human takeover of agent conversations. |

---

## 2. Why the product exists

### The gap it fills

Meta Business Agent handles the automated conversation. When the agent needs to escalate,
there is **no first-party destination for a human to pick up the thread** on WhatsApp
numbers that were registered **directly through Cloud API**.

- MBS Inbox ("WhatsApp in Inbox") is the only 1P surface with a human handoff destination,
  and it only works for numbers that came up through the **Coexistence (CoEx)** path
  (registered on the WhatsApp Business App first, Cloud API added as a companion).
- An Aug 2026 investigation on an enterprise client confirmed: _AI escalates_ = supported;
  _human sees the handed-off thread in MBS Inbox_ = **not supported**.
- The recommended viable pattern in that investigation was **Cloud API + a third-party
  agent desktop**. MBA Desk is that agent desktop, but owned by Meta BE.

### Framing correction to carry forward (Natan's, adopt it)

"Enterprise vs SMB" is a **commercial** term, not the real axis. The real axis is **how the
number got onto Cloud API**:

- **(a) CoEx path** — WhatsApp Business App first, Cloud API added as companion. _Has_ a 1P
  handoff destination, but the hardest ceilings (5 devices, no Data Localization, template
  management UI disabled, no official business account, excluded markets, numbers can't
  migrate between accounts).
- **(b) Direct Cloud API path** — via Embedded Signup, self-serve or through a provider.
  **No 1P handoff destination at all** — regardless of business size.

Useful inversion: the only deployment path _with_ 1P handoff is also the one that punishes
growth.

### Two products, one codebase — keep them separate

1. **Internal BE accelerator / demo + runbook tooling.** Squarely BE's own remit. Needs no
   MBA or Weave buy-in. Actionable immediately. Scoped to demos on test data, the privacy
   surface is ~nil. **Primary audience: BE leadership, not MBA PMs.** This is what "MBA Demo
   Backoffice / Demo Inbox" named.
2. **A 1P product sold to businesses.** Needs MBA/Weave alignment and a full Service-Provider
   privacy review.

(1) builds the evidence for (2). Do not blur them in the pitch.

### Origin story (keep it accurate)

The original rough prototype was built by **BE itself**, not the customer, a rush job so the
team wouldn't have to tell a client that Meta had no handoff solution. Seeing that presented
to a client is what motivated formalizing it. It was presented honestly, as a prototype, and
is being open-sourced and handed to the customer to develop their own.

Natan's argument: _"we're not a software house. It's not our job to write software and give it
to the customer. We have to use that to enhance our own internal tools and runbooks."_
→ This is an **internal-cost + BE-leverage** signal, not a customer-demand signal.

Corroborating signal: at least two regions are independently absorbing this cost — an APAC
runbook for a large retail client describes the same thing (bespoke throwaway demo
infrastructure hand-built around the same product gap).

### Related surface, adjacent not competing

- **MBS Inbox** is in maintenance mode with zero investment from its owning org; a funding
  decision on P0 fixes was live as of Oct 2026. "Extend MBS Inbox to enterprise" is likely a
  dead ask.
- **Weave** is the long-term 1P destination, but its MVP has no Cloud API and no multi-admin,
  and "escalation to a human is unbuilt."
- **Bring-Your-Own-Inbox via conversation routing** is an explicitly planned feature grouping.
  That is the opening MBA Desk should align to, not replace.

### Monetization ammunition (for the pitch, not the product)

- Clean-inbox advertisers monetize at **~$397/page/28d** click-to-WhatsApp vs **~$162** for
  CoEx — **2.4×**.
- 24M monthly-active Business Suite businesses → 7M use the messaging inbox → **only ~66K buy
  WhatsApp API**.
- **85%+ of revenue runs through third parties today**, adding cost, complexity, and
  feature-gating dependency.
- Being on WhatsApp API today essentially requires a provider/developer — which is why 91% of
  the eligible-now cohort is provider-managed.

---

## 3. Product shape

MBA Desk is a **multi-tenant, organization-scoped web application**. Everything — channels,
conversations, contacts, groups, agents, custom code, API keys, operational data — is scoped
to the active organization.

**Role model, two independent layers:**

- **Application roles:** application user · application admin.
- **Organization roles:** owner · admin · member.

Capability gating runs off both. Notable pattern: members can inspect read operations while
mutations are restricted to organization owners and admins (explicit in the API playground,
and the general posture for destructive actions).

**Safety posture** (a deliberate, repeated product pattern worth preserving):
destructive actions preview their blast radius first and require typed confirmation of the
identifier — contacts, channels, organizations, and MCPX imports all follow this.

---

## 4. Feature inventory

> This is the authoritative feature list, carried over verbatim in substance.

### 4.1 Organization workspaces

- Create organizations with a name, slug, primary brand color, and custom logo.
- Use the organization's custom logo in place of the default corner logo.
- Switch the active organization from the application shell.
- Rename or delete an organization, subject to the member's organization role.
- List organization members, invite members as admins or members, and remove members.
- Scope channels, conversations, contacts, groups, agents, custom code, API keys, and
  operational data to the active organization.

### 4.2 Authentication and session management

- Sign in with email and password, optionally keeping the session persistent.
- Discover a domain-verified SSO provider by entering a work email.
- Return users to the originally requested private route after sign-in.
- Sign out from the application shell.
- Separate application-wide admin roles from organization owner/admin/member roles.

### 4.3 Localization, themes, and branding

- Interface in English, Brazilian Portuguese, or Spanish.
- Light, dark, or system appearance.
- Apply the active organization's primary color throughout the authenticated interface.

### 4.4 Performance dashboard

- Channel-scoped WhatsApp and Meta Business Agent performance counters for the active
  organization.
- Entry points to the product's main workflows and quick references.

### 4.5 Organization-scoped inbox ← _the centerpiece_

- Browse direct-contact and group conversations with previews and unread counts.
- Open a conversation through a stable, shareable URL; retain selection across refresh and
  browser navigation.
- Load older inbox and timeline entries with cursor-based infinite scrolling.
- Live inbox and selected-conversation updates, with a visible warning and reconnect action
  if the event stream is lost.
- Mark the latest inbound WhatsApp message as read after the conversation is rendered.
- View message events **and ownership changes** in one chronological timeline.
- See whether the conversation is controlled by a **human operator or the AI**, and
  **transfer control in either direction**.

### 4.6 Rich WhatsApp messaging

- Render text, images, videos, documents, voice notes, audio, stickers, contacts, locations,
  location requests, reply buttons, lists, URL buttons, and carousels.
- Display timestamps, reactions, forwarding state, **AI-generated markers**, and sending /
  error / sent / delivered / read / played status.
- Open images in a keyboard- and touch-accessible lightbox.
- Format WhatsApp-style message text safely.
- When a human owns the conversation, send text, media, contacts, locations, and approved
  templates from the composer.
- Record compatible voice notes in the browser with a live waveform before sending.
- React to provider-backed messages from the message context menu, with a searchable,
  categorized emoji picker.

### 4.7 Contacts management

- Search and cursor-paginate contacts belonging to the active organization's channels.
- Inspect contact details and WhatsApp profile fields.
- Create and edit contacts by WhatsApp ID without requiring a provider user ID.
- Automatically create the direct conversation when a contact is created.
- Preview the impact of deletion and confirm with the contact identifier before removing the
  contact and its direct conversation data.

### 4.8 Groups directory

- Search and cursor-paginate WhatsApp groups belonging to the active organization's channels.
- Open read-only group details.

### 4.9 WhatsApp channel management

- Create and edit named WhatsApp connections, retaining the display phone number as secondary
  identity.
- View channel identity and provider status.
- Request a verification code by SMS or voice, verify it, register or deregister a Cloud API
  phone number, and manage the two-step PIN.
- Create, list, update, download, and delete message QR codes.
- Configure conversational icebreakers and commands.
- Configure webhook forwarding for the channel.
- Manage channel credentials.
- Preview the local data affected by deletion and require typed confirmation before deleting a
  channel.

### 4.10 Meta Business Agent management

One channel-scoped workspace for onboarding, configuring, extending, evaluating, and backing
up an agent.

**Onboarding and controls**

- Registered WhatsApp channels are the entry point; agent configuration stays unavailable
  until Cloud API registration is confirmed.
- Check a channel's Meta Business Agent eligibility and onboard an eligible channel.
- Enable or disable rollout and select the rollout audience.
- Configure human-handoff behavior and its customer-facing message.
- Maintain prohibited phrases and an allowlist of phone numbers.
- Edit the agent's business information.
- Manage the agent's QR codes, icebreakers, and commands from the same shared channel controls.

**Skills and knowledge**

- Create, edit, and delete agent skills with a title, description, instructions, and displayed
  status.
- Create, edit, and delete question-and-answer FAQs.
- Add and remove website knowledge sources.
- Upload, inspect, and remove knowledge files.

**Connectors**

- Create and edit HTTPS connectors and their individual tools.
- Normalize connector and tool names for their API-facing identifiers.
- Associate a connector with an organization MCP package; MBA Desk then creates a dedicated
  12-month API key and supplies its MCP endpoint.
- Rotate keys for MCP-associated connectors, with expiry warnings.
- Inspect recent connector request logs.

**Evaluations**

- Browse the evaluation scenarios configured for an agent.
- Open a scenario and start an asynchronous evaluation run when authorized.
- Follow job progress and review scores, summaries, highlights, and failures.

**Backups and restore preparation**

- Create durable AGTX snapshots of an agent's current configuration and locally archived
  knowledge files.
- Browse backups with creation date, filename, and size.
- Select a backup for restoration; it opens in the import workflow so required files and
  credentials can be reviewed before applying changes.

### 4.11 Portable agent export and import (`.agtx`)

- Export settings, allowlists, business information, skills, QR codes, conversational
  components, FAQs, websites, connectors and tools, associated MCPs, and locally available
  knowledge files as a **versioned `.agtx` package**.
- Show staged export progress and identify provider-only knowledge files that cannot be
  included.
- Preview a local package before upload, then inspect its resources on the server.
- Select which configuration areas to import; leave unselected areas unchanged.
- Request only the missing files, connector credentials, certificates, and private keys
  required by the selected import areas.
- Optionally create a backup before importing.
- Show imported, skipped, and failed stages; retain provider validation details; warn when a
  failed import may have applied earlier changes.
- Preserve the destination agent's existing rollout state during import.

### 4.12 Agent Studio

- Create, search, rename, and delete organization-scoped AGTX projects.
- Import a local AGTX project; download the current project as a package.
- Edit the AGTX manifest, MCPX definitions, remote MCP connectors, and packaged files in a
  full-screen workspace.
- Autosave changed projects every five seconds.
- An AI authoring assistant that can inspect the project, merge-patch the manifest and MCP
  definitions, add remote MCP connectors, and manage packaged files.

### 4.13 Template message management

- Browse provider-backed templates by channel with name, category, and approval status filters
  plus cursor pagination.
- Preview templates in a WhatsApp-style message view.
- Create, edit, and delete templates when the organization role permits it.
- Configure language, category, named or positional parameters, and optional category changes.
- Visually compose header, body, footer, and button components with operation-specific
  validation.
- Upload example header media.
- Configure advanced carousel and limited-time-offer content as JSON.
- Review approval state, quality score, rejection reason, and update time.

### 4.14 Template sending and delivery history

- Select a channel, recipient, and approved template.
- Fill named or positional text parameters and provide supported header media.
- Preview the resolved WhatsApp message before sending.
- Choose the Messages API or Marketing Messages API for delivery.
- Browse cursor-paginated sends; filter by template, recipient, API, and delivery status.

### 4.15 Webhook activity explorer

- Browse the archive of received and processed webhook payloads.
- Filter events by channel and arrival date range.
- Inspect the full JSON payload plus processing and total elapsed time.
- Load additional results, refresh the archive, and export matching activity.

### 4.16 Custom functions

- Browse and edit organization-scoped JavaScript functions.
- Define typed function parameters; normalize function names to snake case.
- Restore an earlier function revision.
- Run saved code in an isolated test environment.
- Inspect the latest 20 executions for a function.

### 4.17 MCP package management

- Create organization-scoped MCP packages from active custom functions.
- Add or remove functions from a package.
- Copy the stable, Bearer-authenticated Streamable HTTP endpoint for a package.
- Export an MCP package, including its revision history, as MCPX YAML.
- Preview an MCPX import's names, removals, affected history, API-key scopes, and blockers
  before explicitly approving the transactional overwrite.

### 4.18 API key management

- Create and revoke organization API keys.
- Restrict a key to selected individual functions and MCP packages.
- Authorize the **live membership** of an allowed MCP package, so its function scope follows
  later package membership changes.

### 4.19 WhatsApp API playground

- Select an organization channel; inspect the request and response for each supported
  operation.
- Exercise Meta Business Agent, phone registration, messaging, media, Marketing Messages,
  message QR code, conversational component, Flow, template, analytics, moderation,
  subscription, business-account, and webhook APIs.
- Cover the complete Flow management surface: assets, lifecycle transitions, metrics,
  migration, previews, and encryption keys.
- Upload media directly, or use short-lived file-store URLs for messaging attachments.
- Export registered playground operations as a Postman collection.
- Members may inspect read operations; mutations are restricted to organization owners and
  admins.

### 4.20 Application administration

- Search application users; create users with a temporary password and an application user or
  admin role.
- Change application roles, rename users, reset passwords, revoke sessions, ban or unban,
  impersonate, and remove users.
- Search all organizations, inspect their members and the current admin's access, and open an
  organization for management.
- Add or promote the current application admin as an organization admin.
- Delete an organization after explicit confirmation.

### 4.21 Public design system catalog

- View reusable foundations, forms, navigation, data-display, feedback, and chat components
  **without signing in**.
- Inspect representative component states and chat message variants in both application themes
  and supported responsive layouts.

---

## 5. Product themes worth naming explicitly

These cut across the inventory and are the real design identity of MBA Desk:

1. **Human↔AI co-ownership of a thread is the core primitive.** Control state is visible,
   ownership changes are first-class timeline entries, and the composer is gated on ownership.
   AI-generated messages are explicitly marked.
2. **Everything is organization-scoped and role-gated.** Two role layers, read/write split,
   live-membership-following key scopes.
3. **Full-fidelity WhatsApp, not a lowest-common-denominator chat.** Every message type
   renders; voice notes record in-browser; reactions, carousels, location requests, and
   limited-time offers are all first-class.
4. **Portability is a product feature, not an ops detail.** `.agtx` export/import, AGTX
   backups, Agent Studio, MCPX YAML export, and Postman collection export all exist so
   configuration can leave the tool. This is what makes it a BE accelerator: an agent built in
   a demo can be handed to a customer.
5. **The agent is extensible from inside the product.** Custom JavaScript functions → MCP
   packages → API keys → connectors → agent tools, end to end, without leaving MBA Desk.
6. **Observability for demos and debugging.** Webhook activity archive with elapsed times,
   connector request logs, function execution history, evaluation runs.
7. **Destructive actions always preview blast radius and demand typed confirmation.**
8. **Localized and brandable out of the box** — three languages, per-organization color and
   logo. Spanish is explicitly _not_ a personal requirement for the owner, but the product
   supports it.

---

## 6. Materials that already exist

| Artifact                                                                                         | Where                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Pitch deck — "Agent Desk — Human Handoff for Cloud API WABAs", 4 slides, official brand template | `https://docs.google.com/presentation/d/1AF_3Q1Vml_jpZYpoIfMnjeKif-OCi_0dGw6oqCHgU_k/edit`                     |
| Backing sheet for the deck's chart ($397 vs $162 click-to-WhatsApp)                              | `https://docs.google.com/spreadsheets/d/1kKQfFe3CpAE04wvqIfLDMNCkkyK_VHmSTQXzTzoav2g/edit`                     |
| Product spec draft — "Agent Desk — Product Spec (Draft)"                                         | `https://metamate.internalmeta.com/view/artifact/d7da60fd-e8e1-493d-b71d-3a9d8cc39c74/agent_desk_product_spec` |

⚠️ The spec draft still uses **enterprise-vs-SMB** framing. It needs a terminology pass to the
**deployment-path** framing in §2. The deck also predates the "MBA Desk" name.

---

## 7. Adjacent workstream (don't conflate)

There is a **separate, related reference app**: a customer-side Meta Business Agent reference
implementation intended for public samples — showing enterprise customers what _they_ must
build on _their_ side to get a CRM-like view over agent conversations. Public APIs only,
customer-owned credentials. Four pieces: conversation history persistence · agent↔human handoff
visibility · agent setup UI as an alternative to Business Manager · chat/thread management.

MBA Desk and that reference app overlap heavily — MBA Desk's inbox is arguably the reference
app's centerpiece. A standing task exists to **unify the repos rather than duplicate them**,
and shareable-repo approval is required before code goes to a customer.

Constraint to carry: the evaluation surface is **run-only** for external consumers — eval case
_authoring_ is BE-internal, so a customer-facing build can list and run eval cases but not
create them.

---

## 8. Open product questions to carry into the new Space

1. Does the product keep both identities (internal BE accelerator vs 1P customer product), or
   does the new Space pick one? The feature list currently serves both.
2. Terminology pass on the spec: enterprise/SMB → deployment path. And a naming pass:
   Agent Desk / MBA Demo Backoffice / MBA Demo Inbox → **MBA Desk**.
3. How does MBA Desk position against **Bring-Your-Own-Inbox via conversation routing** once
   that ships — complement, reference implementation, or replaced by it?
4. Repo unification with the customer-side reference app, and shareable-repo approval.
5. Hard line to preserve in all materials: **demo / test data = cheap. Real customer
   production traffic = full privacy review.** Do not let the pitch blur this.

---

## 9. Explicitly out of scope for this pack

Architecture (ingress, queueing, storage, hosting, real-time transport), privacy/Service-Provider
review detail, platform blockers, and the Cloud API / webhook / thread-control mechanics. All of
that is recorded separately and should be ported deliberately, not by accident.
