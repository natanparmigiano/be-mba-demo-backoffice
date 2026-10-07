# Applications

This directory contains the repository's executable API, browser applications,
and SSO administration CLI.
Applications may depend on `lib` packages; shared libraries must never depend
on applications.

| Workspace                                  | Primary responsibility                          |
| ------------------------------------------ | ----------------------------------------------- |
| [`api`](api/README.md)                     | HTTP, auth, workers, and production web serving |
| [`web`](web/README.md)                     | React browser application                       |
| [`web-shared`](web-shared/README.md)       | Shared browser application layer                |
| [`web-workspace`](web-workspace/README.md) | Operational React application                   |
| [`web-manager`](web-manager/README.md)     | Management React application                    |
| [`sso-cli`](sso-cli/README.md)             | SSO provider administration over HTTP           |

## API

[`api`](api/README.md) is the Node.js Hono application. It owns HTTP routing, process startup and shutdown, event subscriber registration, and production static-file delivery. It exports the inferred Hono `AppType` as a type-sharing boundary for consumers.

## Web

[`web`](web/README.md) contains the React/Vite application. Hono serves its
production build from the shared image. The split `web-workspace` and
`web-manager` applications run as separate Vite servers during development;
the legacy app remains the production static target until deployment changes
are made separately.

## SSO CLI

[`sso-cli`](sso-cli/README.md) manages the authenticated Better Auth SSO provider lifecycle without requiring hand-written cookie or XML handling.
