# SSO administration CLI

`@mba-desk/sso-cli` manages the Better Auth SSO provider lifecycle through a
running MBA Desk API. It avoids hand-written cookies, JSON payloads, and
escaped SAML XML.

## Quick start

```bash
yarn sso help
```

Authenticate with an existing `SSO_SESSION_COOKIE`, or set
`SSO_ADMIN_EMAIL` and `SSO_ADMIN_PASSWORD` so the CLI creates an
email/password session.

## Supported workflows

The CLI checks SSO availability, lists providers, registers OIDC and SAML
providers, renews DNS verification tokens, verifies providers, and deletes
providers.

Keep secrets out of provider JSON. Reference an environment variable for an
OIDC client secret and a local metadata file for SAML XML.

## Troubleshooting

- Confirm the target API is running and reachable before diagnosing provider
  configuration.
- A rejected administrative operation usually means the session is missing,
  expired, or lacks application-administrator privileges.
- Validate SAML metadata as XML and use the DNS token from the current
  provider record.

## Verification

```bash
yarn workspace @mba-desk/sso-cli typecheck
yarn workspace @mba-desk/sso-cli test
yarn workspace @mba-desk/sso-cli build
```

## Related documentation

- [Complete SSO setup guide](../../sso/README.md)
- [Application overview](../README.md)
