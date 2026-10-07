# SSO setup

Use `yarn sso` to register an organization-linked OIDC or SAML provider, verify
its email domain through DNS, and test sign-in. The login page does not expose
SSO until at least one provider has a verified domain, and there is no
provider-management screen yet.

At sign-in, a user's work-email domain selects the provider. A successful first
login creates the Better Auth user and adds it to the linked organization with
the `member` role. Provider configuration remains restricted to an
authenticated provider owner or organization administrator; the public
capability endpoint reveals only `{ "enabled": boolean }`.

## Setup workflow

1. Configure the application URLs, auth secret, and shared verification
   storage where required.
2. Authenticate the CLI and identify the owning organization.
3. Register an OIDC or SAML provider with a stable provider ID.
4. Publish the returned DNS TXT record and verify the domain.
5. Confirm `yarn sso status` returns `{ "enabled": true }`.
6. Complete a login from `/login` and verify the new organization membership.

The following sections provide the exact commands and protocol-specific
configuration.

## Prerequisites

1. Deploy or start the application and apply all database migrations.
2. Set `BETTER_AUTH_URL` to the public application origin. Do not append
   `/api/auth`; Better Auth adds that base path.
3. Set `CORS_ORIGIN` to the browser application's exact origin.
4. Use a stable, high-entropy `BETTER_AUTH_SECRET`.
5. Sign in as an owner or administrator of the organization that will own the
   provider and note its organization ID.
6. Use shared secondary storage such as Redis in multi-instance deployments.
   Pending DNS verification and SAML request correlation use Better Auth's
   verification storage; process-memory mode does not survive a restart.

For local host-based development, the public auth URL is normally
`http://localhost:3000`. For the Compose profiles it is normally
`http://localhost:8080`.

## Authenticate the setup CLI

The `@mba-desk/sso-cli` workspace is the supported setup path. It handles
authentication, provider payloads, SAML metadata files, and secret redaction:

```bash
yarn sso help
```

Set the application URL and one authentication method:

```bash
export SSO_BASE_URL=http://localhost:3000

# Option A: create a short-lived session with email/password.
export SSO_ADMIN_EMAIL=admin@example.com
export SSO_ADMIN_PASSWORD=replace-me

# Option B: reuse the Cookie header from an authenticated browser request.
# export SSO_SESSION_COOKIE='better-auth.session_token=replace-me'
```

Keep these values out of commits and shared shell scripts. The CLI uses the
password only for sign-in and retains the returned session cookie in memory for
the current command.

Find the organization ID and check current SSO availability:

```bash
yarn sso organizations
yarn sso status
```

Register an OIDC or SAML provider using the appropriate template below. Then
complete or inspect its lifecycle with:

```bash
yarn sso request-verification --provider-id acme-oidc
yarn sso verify --provider-id acme-oidc
yarn sso list
yarn sso delete --provider-id acme-oidc
```

`status` is public. The other commands use the configured credentials or
session cookie.

## Configure OIDC

Choose the provider ID before creating the client in the identity provider;
changing it also changes the callback URL. Configure this redirect URI:

```text
<BETTER_AUTH_URL>/api/auth/sso/callback/<providerId>
```

For example:

```text
https://desk.example.com/api/auth/sso/callback/acme-oidc
```

The registration response also returns `redirectURI`; treat that returned value
as authoritative and make sure it exactly matches the IdP client configuration.

Trust every OIDC endpoint origin before registration or discovery will fail.
Better Auth validates the issuer, discovery, authorization, token, user-info,
and JWKS URLs before each server-side request:

```env
BETTER_AUTH_TRUSTED_ORIGINS=https://login.example.com,https://keys.example.com
```

Set this before registering the provider and restart the app. The Compose files
pass this variable into the application container. On Render or another hosted
platform, add it to the service environment. Use exact trusted origins; do not
use a broad wildcard. Private, loopback, link-local, and cloud-metadata hosts
are rejected by Better Auth's OIDC discovery protections.

Create an ignored local config such as `acme-oidc.local`:

```json
{
  "protocol": "oidc",
  "providerId": "acme-oidc",
  "issuer": "https://login.example.com",
  "domain": "example.com",
  "organizationId": "replace-with-organization-id",
  "oidcConfig": {
    "clientId": "replace-with-client-id",
    "clientSecretEnv": "SSO_CLIENT_SECRET",
    "discoveryEndpoint": "https://login.example.com/.well-known/openid-configuration",
    "pkce": true,
    "scopes": ["openid", "email", "profile"]
  }
}
```

Load the secret from the environment and register:

```bash
export SSO_CLIENT_SECRET=replace-with-client-secret
yarn sso register --config ./acme-oidc.local
```

OIDC discovery is preferred. Only use `skipDiscovery: true` when the IdP has no
valid discovery document; in that mode, supply `authorizationEndpoint`,
`tokenEndpoint`, and `jwksEndpoint` explicitly. The endpoint origins must still
be trusted.

## Configure SAML

Configure the IdP for SP-initiated SSO with a stable provider ID. IdP-initiated
SSO is disabled. For `acme-saml`, use these application endpoints:

```text
ACS URL:     <BETTER_AUTH_URL>/api/auth/sso/saml2/sp/acs/acme-saml
SP entity ID: <BETTER_AUTH_URL>/api/auth/sso/saml2/sp/metadata?providerId=acme-saml
SP metadata:  <BETTER_AUTH_URL>/api/auth/sso/saml2/sp/metadata?providerId=acme-saml
```

Save the IdP metadata XML as an ignored local file such as
`idp-metadata.local`, then create `acme-saml.local` beside it. Set
`spMetadata.entityID` explicitly so the IdP and application agree on a stable,
application-owned audience:

```json
{
  "protocol": "saml",
  "providerId": "acme-saml",
  "issuer": "https://idp.example.com/saml",
  "domain": "example.com",
  "organizationId": "replace-with-organization-id",
  "samlConfig": {
    "entryPoint": "https://idp.example.com/saml/sso",
    "idpMetadataFile": "./idp-metadata.local",
    "spMetadata": {
      "entityID": "https://desk.example.com/api/auth/sso/saml2/sp/metadata?providerId=acme-saml"
    },
    "wantAssertionsSigned": true
  }
}
```

Register it without manually escaping the XML:

```bash
yarn sso register --config ./acme-saml.local
```

Replace the example SP entity ID with the real `BETTER_AUTH_URL`. IdP metadata
should contain the signing certificate. If it does not, provide the IdP
certificate through the supported `cert` field. After registration, the SP
metadata URL returns the generated XML that can be imported into the IdP.
SP-initiated request correlation and replay protections are explicitly enabled;
IdP-initiated SSO is explicitly disabled by this application.

The CLI resolves `clientSecretEnv`, reads `idpMetadataFile` relative to the
config, removes those helper fields before the request, and redacts returned
secrets. It intentionally prints the DNS verification token needed next.

## Verify domain ownership

SSO remains hidden until the provider domain is verified. Registration returns
a `domainVerificationToken`; for provider `acme-oidc` and domain
`example.com`, publish this DNS TXT record:

```text
Name:  _better-auth-token-acme-oidc.example.com
Value: <domainVerificationToken>
```

The token is valid for seven days. For comma-separated provider domains, create
the corresponding record under every domain. Better Auth also accepts the TXT
value in `_better-auth-token-<providerId>=<token>` form, but the bare token is
simpler.

If the token expired, request another one:

```bash
yarn sso request-verification --provider-id acme-oidc
```

After DNS has propagated, complete verification:

```bash
yarn sso verify --provider-id acme-oidc
```

A successful verification returns HTTP `204`. Confirm that the public login
capability is now enabled:

```bash
yarn sso status
```

Expected response:

```json
{ "enabled": true }
```

Reload `/login`, enter an address under the verified domain, and complete the
provider redirect. The first successful login provisions a Better Auth account
and organization membership.

## Inspect or remove providers

Use `yarn sso list` and `yarn sso delete --provider-id <id>` for routine
administration. Use the authenticated Better Auth endpoints for advanced
inspection, updates, and credential rotation:

| Method | Path                                        | Purpose                        |
| ------ | ------------------------------------------- | ------------------------------ |
| `GET`  | `/api/auth/sso/providers`                   | List providers you can manage  |
| `GET`  | `/api/auth/sso/get-provider`                | Read one provider              |
| `POST` | `/api/auth/sso/update-provider`             | Rotate or update configuration |
| `POST` | `/api/auth/sso/delete-provider`             | Delete a provider              |
| `POST` | `/api/auth/sso/request-domain-verification` | Issue a new DNS token          |
| `POST` | `/api/auth/sso/verify-domain`               | Verify the DNS record          |

Provider client secrets and SAML key material are sensitive. Protect database
backups, avoid printing registration responses into shared logs, and rotate
credentials through the authenticated API rather than editing the generated
auth tables directly.

## Troubleshooting

| Symptom                                          | Check                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| SSO form is hidden                               | Verify DNS, then check `/api/auth/sso-availability`; unverified providers intentionally do not enable the form. |
| Registration returns `401`                       | The cookie is missing or expired. Sign in again with an account allowed to manage the target organization.      |
| Registration says the user is not an owner/admin | Include the correct `organizationId` and use an organization owner or administrator session.                    |
| `discovery_untrusted_origin`                     | Add every exact OIDC endpoint origin to `BETTER_AUTH_TRUSTED_ORIGINS` and restart the app.                      |
| OIDC callback uses the wrong host                | Correct `BETTER_AUTH_URL`; it must be the public application origin visible to the IdP.                         |
| Provider cannot be found at login                | The email domain must match the provider's verified `domain` value.                                             |
| Domain verification fails                        | Confirm the TXT record name, token, DNS propagation, and seven-day token lifetime.                              |
| SAML response fails correlation                  | Start from this application's login page and use shared verification storage in multi-instance deployments.     |
| First login does not create a membership         | Register the provider with the intended `organizationId`; organization provisioning uses the `member` role.     |
