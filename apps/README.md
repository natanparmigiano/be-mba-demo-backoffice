# Applications

This directory contains executable application workspaces.

## API

[`api`](api/README.md) is the Node.js Hono application. It owns HTTP routing, process startup and shutdown, event subscriber registration, and production static-file delivery. It exports the inferred Hono `AppType` as a type-sharing boundary for consumers.

## Web

`web` contains the React/Vite application. Its implementation documentation is intentionally outside the scope of this backend guide. The production build is copied into the shared image and served by Hono; development uses its own Vite process.

Application workspaces may depend on packages under `lib`, but shared libraries should not depend on either application.

## Webhook generator

[`webhook-generator`](webhook-generator/README.md) is a stateful CLI load generator for signed WhatsApp Cloud API and MBA webhook traffic. It creates reusable contact/group pools, preserves message-status and handover ordering, and supports both live HTTP delivery and NDJSON dry runs.
