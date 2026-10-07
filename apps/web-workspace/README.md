# MBA Desk workspace frontend

This React/Vite application owns Home, Queue, Chat, Teams, Contacts, Groups,
Templates, and Sending. Organization management and application administration
are shared with the manager app through `@mba-desk/web-shared`. Organization
management includes accepting or rejecting pending invitations.

Run it at <http://localhost:5173> with `yarn workspace
@mba-desk/web-workspace dev`. Its API requests use the relative `/api` proxy to
port 3000.

Validate with:

```sh
yarn workspace @mba-desk/web-workspace typecheck
yarn workspace @mba-desk/web-workspace build
```
