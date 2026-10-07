# MBA Desk manager frontend

This React/Vite application owns a management dashboard, Agents, Channels,
Webhooks, Functions, MCPs, API Keys, Studio, and API Playground. Organization
management and application administration are shared with the workspace app.
Their implementations live in `@mba-desk/web-shared`, including pending
organization invitation acceptance.

Run it at <http://localhost:5174> with `yarn workspace @mba-desk/web-manager
dev`. Its API requests use the relative `/api` proxy to port 3000.

Validate with:

```sh
yarn workspace @mba-desk/web-manager typecheck
yarn workspace @mba-desk/web-manager build
```
