# Applications

This directory contains the repository's four executable boundaries: the HTTP
API, browser application, SSO administration CLI, and webhook load generator.
Applications may depend on `lib` packages; shared libraries must never depend
on applications.

| Workspace                                          | Primary responsibility                          |
| -------------------------------------------------- | ----------------------------------------------- |
| [`api`](api/README.md)                             | HTTP, auth, workers, and production web serving |
| [`web`](web/README.md)                             | React browser application                       |
| [`sso-cli`](sso-cli/README.md)                     | SSO provider administration over HTTP           |
| [`webhook-generator`](webhook-generator/README.md) | Stateful signed webhook load generation         |

## API

[`api`](api/README.md) is the Node.js Hono application. It owns HTTP routing, process startup and shutdown, event subscriber registration, and production static-file delivery. It exports the inferred Hono `AppType` as a type-sharing boundary for consumers.

## Web

[`web`](web/README.md) contains the React/Vite application. Hono serves its
production build from the shared image; local development uses Vite.

## Webhook generator

[`webhook-generator`](webhook-generator/README.md) is a stateful CLI load generator for signed WhatsApp Cloud API and MBA webhook traffic. It creates reusable contact/group pools, preserves message-status and handover ordering, and supports both live HTTP delivery and NDJSON dry runs.

## SSO CLI

[`sso-cli`](sso-cli/README.md) manages the authenticated Better Auth SSO provider lifecycle without requiring hand-written cookie or XML handling.
