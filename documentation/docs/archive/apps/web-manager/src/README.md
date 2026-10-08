# Manager frontend source

The Manager source tree contains product-specific routes and presentation plus
thin adapters around shared frontend behavior.

## Quick start

Begin with `src/router/AppRouter.tsx` to trace a URL to its page, then follow
page imports into feature components and the typed API client.

## Directory map

| Directory     | Responsibility                                                 |
| ------------- | -------------------------------------------------------------- |
| `pages/`      | Route-level API orchestration and page state                   |
| `router/`     | Guest, session, private, organization, and admin access policy |
| `components/` | Manager-only presentation and thin shared-shell adapters       |
| `auth/`       | Re-exports of the shared Better Auth client and provider       |
| `assets/`     | Manager-local bundled assets                                   |

Shared authentication, common pages, organization controls, shell behavior,
theme integration, and brand assets live in `@mba-desk/web-shared`.

## Troubleshooting

If identical code exists in both frontend source trees, first determine
whether it belongs in `@mba-desk/web-shared` or `@mba-desk/ui`.

## Verification

Run the Manager frontend typecheck and build after changing source boundaries.

## Related documentation

- [Manager frontend](../README.md)
- [Components](components/README.md)
- [Pages](pages/README.md)
- [Routing](router/README.md)
