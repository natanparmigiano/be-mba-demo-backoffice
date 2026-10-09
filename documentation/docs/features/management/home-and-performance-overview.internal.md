---
title: Management home and performance overview
slug: /internal/features/management/home-and-performance-overview
---

# Management home and performance overview

:::warning Internal documentation

This page covers the Management application and is not available in the
external Workspace documentation.

:::

The Management home page combines Meta Business Agent analytics with local,
organization-scoped operational data for the selected WhatsApp channel.

## What it covers

- AI-message, tool-call, conversation, handoff, human-queue, and local-message
  counters.
- Seven-day inbound/outbound activity and message-type charts.
- Agent-versus-human outbound-message share.
- Average time from a handoff to the first human reply.
- Conversation assignments ranked by team and user.

Dashboard snapshots are cached in the configured KV adapter for five minutes.
Choosing **Refresh** bypasses and replaces the current snapshot. Event-based
rates and rankings begin when database migration `0044` is applied; historical
activity is not backfilled.
