# Shared web application layer

`@mba-desk/web-shared` contains browser orchestration used by both split
frontends: the typed API and auth clients, session guards, login,
organization management, administration, and shared shell building blocks.

It lives under `apps/` because it consumes the API application's `AppType`;
generic presentation remains in `@mba-desk/ui`.

Both applications import `@mba-desk/web-shared/styles.css`, which loads the
shared theme and registers this package as an explicit Tailwind source.
