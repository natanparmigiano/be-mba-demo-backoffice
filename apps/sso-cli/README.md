# `@mba-desk/sso-cli`

Use this HTTP CLI to administer the complete Better Auth SSO provider
lifecycle without hand-writing cookies, JSON payloads, or escaped SAML XML. It
supports availability checks, provider lists, OIDC/SAML registration, DNS
token renewal, verification, and deletion against a running application.

```bash
yarn sso help
```

Authenticate commands with either `SSO_SESSION_COOKIE` or an email/password
session created from `SSO_ADMIN_EMAIL` and `SSO_ADMIN_PASSWORD`. Keep secrets
out of provider JSON by referencing an OIDC secret environment variable and a
SAML metadata file.

See the [SSO guide](../../docs/sso/) for configuration examples and the full
setup workflow.
