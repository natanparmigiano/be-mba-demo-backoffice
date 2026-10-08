---
id: internal
title: MBA Desk [INTERNAL]
sidebar_label: MBA Desk [INTERNAL]
slug: /internal
hide_table_of_contents: true
pagination_prev: null
pagination_next: null
---

# MBA Desk

:::warning Internal documentation

This page is part of the internal portion of the documentation. It includes the
Management application and its administrative and integration features. For
external sharing, this page will not be available.

:::

MBA Desk is a tool developed by Meta's Business Engineering team for clients
that operate conversations handled by Meta Business Agents. It provides an
inbox for monitoring those conversations, handling escalations that require a
person, and sending WhatsApp messages.

MBA Desk is split into two applications. Workspace contains the daily
conversation, contact, group, template, and sending workflows. Management
contains agent, channel, integration, credential, and diagnostic
configuration. Both applications use the same organizations, memberships, and
permissions.

## Feature summary

### Workspace

- [Home and performance overview](./features/workspace/home-and-performance-overview.md) — channel
  activity and links to the main operational workflows.
- [Queue and team coordination](./features/workspace/queue-and-team-coordination.md) — incoming work,
  team membership, conversation assignment, and human handoffs.
- [WhatsApp inbox](./features/workspace/whatsapp-inbox.md) — direct and group conversations with their
  complete message timelines.
- [Human and AI handoff](./features/workspace/human-and-ai-handoff.md) — conversation ownership and
  transfers between an agent and a person.
- [Contacts](./features/workspace/contacts.md) — customer records associated with the active
  organization.
- [Groups](./features/workspace/groups.md) — a directory of WhatsApp group conversations.
- [Template management](./features/workspace/template-management.md) — creation, review, and approval
  status for WhatsApp templates.
- [Template sending](./features/workspace/template-sending.md) — personalized template delivery and
  send history.
- [Organization management](./features/workspace/organization-management.md) — organizations,
  branding, membership, and invitations.
- [Channel administration](./features/workspace/channel-administration.md) —
  WhatsApp channel identity, registration, profile, components, forwarding,
  and credentials in both applications.
- [User administration](./features/workspace/user-administration.md) — application users, roles,
  sessions, and organization access.

### Management

- [Agent lifecycle management](./features/management/agent-lifecycle-management.internal.md) — onboarding,
  rollout, handoff, business information, allowlists, and safety settings.
- [Agent skills and knowledge](./features/management/agent-skills-and-knowledge.internal.md) — instructions,
  FAQs, websites, knowledge files, connectors, and tools.
- [Agent evaluations](./features/management/agent-evaluations.internal.md) — evaluation scenarios, runs, scores,
  and failures.
- [Backups, export, and import](./features/management/backups-export-and-import.internal.md) — configuration
  snapshots, portable packages, and restore preparation.
- [Agent Studio](./features/management/agent-studio.internal.md) — editing portable agent projects and their
  packaged resources.
- [Webhook visibility](./features/management/webhook-visibility.internal.md) — payloads, processing details,
  timing, and exports.
- [Functions and MCP packages](./features/management/functions-and-mcp-packages.internal.md) — custom functions
  and authenticated MCP endpoints.
- [API keys and access control](./features/management/api-keys-and-access-control.internal.md) — scoped
  organization credentials.
- [API playgrounds](./features/management/api-playgrounds.internal.md) — supported WhatsApp and agent operations
  with request and response inspection.
- [Organization and application administration](./features/management/organization-and-application-administration.internal.md)
  — privileged organization, user, role, session, and access controls.

## Workspace features

### [Home and performance overview](./features/workspace/home-and-performance-overview.md)

The home page displays activity for the selected WhatsApp channel and provides
links to conversations, contacts, organization settings, groups, and other
frequently used Workspace areas.

### [Queue and team coordination](./features/workspace/queue-and-team-coordination.md)

The queue organizes conversations that require attention. Teams define groups
of operators, while assignment and ownership information identifies who is
responsible for each conversation and supports coordinated handoffs.

### [WhatsApp inbox](./features/workspace/whatsapp-inbox.md)

The inbox lists direct and group conversations with previews and unread state.
Each conversation includes its chronological message and event history,
including text, media, documents, voice notes, locations, contacts, reactions,
interactive messages, timestamps, and delivery status.

### [Human and AI handoff](./features/workspace/human-and-ai-handoff.md)

Each conversation indicates whether it is currently controlled by a Meta
Business Agent or a human operator. Authorized users can take control when an
escalation requires a person and return control to the agent afterward.

### [Contacts](./features/workspace/contacts.md)

The contacts directory supports searching and reviewing customer records for
the active organization. Users with the required permissions can create,
update, and remove contacts and open their associated conversations.

### [Groups](./features/workspace/groups.md)

The groups directory lists WhatsApp groups associated with the organization's
channels. Users can search the directory and inspect the available details for
each group conversation.

### [Template management](./features/workspace/template-management.md)

The templates area lists WhatsApp message templates by channel, category,
language, status, and name. Authorized users can create and edit template
content, preview the resulting message, and review approval state, quality, and
rejection information.

### [Template sending](./features/workspace/template-sending.md)

The sending workflow lets users select an approved template, recipient, and
channel; provide the required parameters and media; and preview the resolved
message before sending it. Send history records the selected API and delivery
status.

### [Organization management](./features/workspace/organization-management.md)

Organization management covers the active organization, its branding, and its
members. Depending on their role, users can switch organizations, update
organization details, invite or remove members, and accept pending
invitations.

### [Channel administration](./features/workspace/channel-administration.md)

Channel administration is available in both applications. It lists the
WhatsApp channels connected to the active organization and lets authorized
users create channels or update their identity, webhook forwarding, and
credentials, registration, business profile, QR codes, commands, and
icebreakers. Management retains its existing navigation placement, while
Workspace presents Channels under Configuration.

### [User administration](./features/workspace/user-administration.md)

Authorized application administrators can search and create users, manage
application roles, reset passwords, revoke sessions, control access, and
review organization membership.

## Management features

### [Agent lifecycle management](./features/management/agent-lifecycle-management.internal.md)

Agent management covers eligibility checks, onboarding, rollout state and
audience, human-handoff behavior, prohibited phrases, phone-number allowlists,
and the business information used by an agent.

### [Agent skills and knowledge](./features/management/agent-skills-and-knowledge.internal.md)

Administrators can manage agent instructions, FAQs, website sources, and
uploaded knowledge files. Connectors and their tools define the external
operations available to the agent, with request logs available for review.

### [Agent evaluations](./features/management/agent-evaluations.internal.md)

The evaluation area lists the scenarios configured for an agent and starts
asynchronous evaluation runs. Completed runs include progress, scores,
summaries, highlights, and failure details.

### [Backups, export, and import](./features/management/backups-export-and-import.internal.md)

Agent configurations can be saved as backups or exported as portable AGTX
packages. The import workflow inspects a package, identifies required files and
credentials, lets administrators select configuration areas, and reports each
applied, skipped, or failed stage.

### [Agent Studio](./features/management/agent-studio.internal.md)

Studio manages organization-scoped AGTX projects. It supports editing the
manifest, MCP definitions, remote connectors, and packaged files, with
autosave, package import and download, and an assisted authoring interface.

### [Webhook visibility](./features/management/webhook-visibility.internal.md)

The webhook explorer lists received and processed events by channel and time
range. Each event includes its JSON payload, processing duration, total
duration, and export options.

### [Functions and MCP packages](./features/management/functions-and-mcp-packages.internal.md)

Custom functions define typed inputs and versioned JavaScript behavior that can
be tested and reviewed through execution history. MCP packages group selected
functions behind authenticated endpoints and support MCPX import and export.

### [API keys and access control](./features/management/api-keys-and-access-control.internal.md)

API keys are created and revoked at organization scope. Their permissions can
be restricted to selected functions and MCP packages, including the current
function membership of an authorized package.

### [API playgrounds](./features/management/api-playgrounds.internal.md)

The playgrounds expose supported agent, registration, messaging, media,
marketing, QR code, component, Flow, template, analytics, moderation,
subscription, WABA, and webhook operations. They display request and response
details and can produce a Postman collection.

### [Organization and application administration](./features/management/organization-and-application-administration.internal.md)

Privileged administration includes organization membership and access as well
as application users, roles, password resets, session revocation, bans,
impersonation, and organization deletion with confirmation.
