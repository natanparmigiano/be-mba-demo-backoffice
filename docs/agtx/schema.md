# Agent export formats

## What is an agent export file?

An agent export file is a portable snapshot of a Meta Business Agent's
configuration. It is intended to move an agent configuration between channels
or environments, keep a reviewable backup, and provide the input for the agent
import workflow.

The export describes the agent, its behavior, its knowledge configuration, and
its integrations. When the application has a local copy of a knowledge file,
the export carries the original file as well. When only Meta has the file, the
export records that the file exists but cannot include its bytes. The import UI
then asks the user to provide it.

Agent exports are configuration snapshots, not complete application or
database backups. They do not contain chats, messages, contacts, groups,
analytics, evaluation results, application users, organization membership, or
authentication sessions.

## What is an AGTX file?

AGTX is this application's versioned agent-transfer format. Its file extension
is `.agtx`.

The machine-readable JSON Schema, expressed as YAML, is available in
[`schema.yml`](./schema.yml).

An AGTX version 1 file is a standard ZIP32 container with this layout:

```text
agent-5511999990000.agtx
├── agent.yaml
└── files/
    ├── 001-product-catalog.pdf
    └── 002-return-policy.docx
```

`agent.yaml` is mandatory and is the authoritative manifest. The `files/`
directory is optional: it contains only knowledge files that were available in
the application's configured file store when the export was created.

The current writer stores ZIP entries without compression and uses UTF-8 entry
names. Consumers should treat that as the version 1 encoding. Import currently
accepts AGTX packages up to 512 MiB, up to 1,000 archive entries, and a manifest
up to 5 MiB. Every entry is checksum-validated before import.

The `.agtx` extension does not change the ZIP structure. Standard ZIP tools can
list and extract it directly:

```bash
unzip -l agent-5511999990000.agtx
unzip -p agent-5511999990000.agtx agent.yaml
unzip agent-5511999990000.agtx -d agent-export
```

## Worked sample: Dunder Mifflin

[`sample_dunder_mifflin.agtx`](./sample_dunder_mifflin.agtx) is a complete fictional example
for Dunder Mifflin Paper Company. It demonstrates agent settings, business
information, an allowlist, skills, a QR code, icebreakers, the `/human`
command, FAQs, the Dunder Mifflin Wikipedia knowledge website, and one API-key
MCP connector configured to discover six tools. That
`dunder_mifflin_mcp` connector is the agent-side counterpart of
[`../mcpx/sample_dunder_mifflin.mcpx`](../mcpx/sample_dunder_mifflin.mcpx).
It deliberately contains no knowledge files, API keys, certificates, or other
secrets.

The connector host uses the reserved `.example` domain. It documents the
portable MCP connector and synced-tool shapes but does not provide a working
service. Import the counterpart MCPX package, expose its MCP endpoint, replace
the sample connector URL with that endpoint, and supply a scoped runner bearer
token before expecting its tools to execute.

From the repository root, verify that the ZIP directory and CRC32 checksums are
valid before extracting anything:

```bash
unzip -l docs/agtx/sample_dunder_mifflin.agtx
unzip -t docs/agtx/sample_dunder_mifflin.agtx
```

Read the manifest without extracting it:

```bash
unzip -p docs/agtx/sample_dunder_mifflin.agtx agent.yaml | less
```

To decompress the package into a new temporary directory and print its path:

```bash
agtx_extract_dir="$(mktemp -d)"
unzip docs/agtx/sample_dunder_mifflin.agtx -d "$agtx_extract_dir"
echo "$agtx_extract_dir"
```

Open `$agtx_extract_dir/agent.yaml` in a text editor and analyze it in this
order:

1. Confirm `format: "agtx"` and `version: 1`.
2. Review `security` and `importRequirements` for omitted credentials, files,
   and certificates.
3. Treat `source.channel` as provenance, not destination configuration.
4. Review `agent.settings`, `businessInfo`, `skills`, `qrCodes`, `components`,
   and `knowledge` for the behavior and information that import will reconcile.
5. Review every connector's `baseUrl`, `connectorProtocol`, and `authType`.
   HTTP connectors also carry nested tool definitions; MCP tools are refreshed
   from the server and are intentionally absent. Connector credentials are
   always absent.
6. Compare the manifest with [`schema.yml`](./schema.yml), particularly field
   names, required properties, enums, and nullability.
7. Match each non-null `agent.knowledge.files[].path` to an archive entry under
   `files/`. This sample has no such entries.

`unzip -t` validates ZIP entry checksums; it does not validate the YAML schema
or AGTX security rules. The application's Inspect package action performs the
full manifest, path, reference, and import-requirement validation without
applying the package.

## What information does it contain?

The manifest can contain:

- format identity, schema version, and export timestamp;
- non-secret source channel metadata;
- agent rollout, audience, handoff, and language-safety settings;
- the phone-number allowlist;
- business description, policies, contact information, address, and hours;
- agent skills and their instructions;
- message QR codes and their prefilled messages;
- conversational icebreakers and commands;
- FAQs and knowledge websites;
- Meta knowledge-file references and, when available, their bundled bytes;
- connector definitions and explicit HTTP connector tools, without
  credentials; MCP tools are discovered from their server after import.

The export deliberately excludes:

- Meta system-user tokens, app secrets, and webhook verification tokens;
- API-key values and OAuth client credentials;
- private keys and connector certificates;
- any knowledge-file bytes that were never archived locally;
- conversations and customer data.

The `security` and `importRequirements` sections describe these omissions. On
import, the user is prompted for missing knowledge files, connector
credentials, and certificates before any provider configuration is changed.

## Manifest structure

The root object in `agent.yaml` has the following shape:

```yaml
format: 'agtx'
version: 1
exportedAt: '2026-10-01T12:00:00.000Z'
source:
  channel:
    type: 'whatsapp'
    phoneNumber: '+55 11 99999-0000'
    phoneNumberId: '123456789'
    wabaId: '987654321'
    businessId: '111222333'
    appId: '444555666'
security:
  connectorCredentialsIncluded: false
  connectorCertificatesIncluded: false
  knowledgeFiles:
    total: 2
    included: 1
    missing: 1
importRequirements:
  requestConnectorCredentials: true
  requestConnectorCertificates: false
  requestMissingKnowledgeFiles: true
agent:
  settings: {}
  allowlist: []
  businessInfo: {}
  qrCodes: []
  components:
    prompts: []
    commands: []
  skills: []
  knowledge:
    faqs: []
    websites: []
    files: []
  connectors: []
```

### Format metadata

| Field        | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| `format`     | Always `agtx`. It prevents another ZIP/YAML document being imported.  |
| `version`    | Manifest schema version. The current importer accepts only version 1. |
| `exportedAt` | UTC ISO 8601 time at which the package was assembled.                 |

Importers must use `format` and `version` for compatibility decisions. They
must not infer a version from the filename.

### `source.channel`

This section identifies the channel from which the agent was exported. It
contains the channel type, display phone number, Meta phone-number ID, WABA ID,
Business Portfolio ID, and application ID.

These fields are provenance. Importing does not overwrite the destination
channel's credentials or routing identity with the source values.

### `security`

`connectorCredentialsIncluded` and `connectorCertificatesIncluded` are false
in version 1. Secrets are never portable inside AGTX.

`knowledgeFiles` provides counts:

- `total`: all knowledge files reported by Meta;
- `included`: files whose bytes are present under `files/`;
- `missing`: files represented only by metadata.

### `importRequirements`

This section lets a reader predict whether interactive input will be needed:

- `requestConnectorCredentials` is true if a connector uses authentication;
- `requestConnectorCertificates` is true if any connector requires mTLS;
- `requestMissingKnowledgeFiles` is true if any file is not bundled.

The importer still derives and validates the actual requirements from the
manifest and archive. These flags are informative and are not trusted as a
substitute for validation.

Current version 1 exports include `agent.qrCodes` and `agent.components`.
Version 1 packages created before those fields were introduced remain
importable; the importer treats the missing fields as empty collections.

### `agent.settings`

```yaml
settings:
  agentId: 'provider-agent-id'
  rolloutEnabled: true
  audience: 'ALLOWLISTED_ONLY'
  handoff:
    enabled: true
    messageSelection: 'CUSTOM'
    message: 'A teammate will join shortly.'
  neverSayPhrases:
    - 'guaranteed delivery'
```

`agentId` records the source provider identity; it is not assigned to the
destination. `audience` is `EVERYONE` or `ALLOWLISTED_ONLY`.
`messageSelection` is `AGENT`, `CUSTOM`, or `DEFAULT`. `message` is relevant to
the custom selection. `neverSayPhrases` contains prohibited phrases.

`rolloutEnabled` records the source state for provenance only. Import ignores
that value, disables the destination before applying any other configuration,
and verifies that it remains disabled when import completes. A manager must
review and enable the imported agent manually.

### `agent.allowlist`

Each entry contains its source provider `id` and a normalized `phoneNumber`.
The source ID is informational. Import reconciles entries by phone number.

```yaml
allowlist:
  - id: 'allowlist-entry-id'
    phoneNumber: '+5511999990000'
```

### `agent.businessInfo`

Business information uses application-facing field names:

```yaml
businessInfo:
  businessDescription: 'A short description'
  paymentMethod: 'Cards and Pix'
  purchaseInfo: 'How to place an order'
  deliveryAndShipping: 'Ships in two business days'
  returnPolicy: 'Returns accepted within 30 days'
  contactEmail: 'support@example.com'
  hoursOfOperation: 'Monday-Friday, 09:00-18:00'
  address: 'Example Street, 123'
```

Import replaces the destination business-information object with these values.

### `agent.skills`

Each skill contains its source ID, stable kebab-case title, description,
instructions in `skill`, channel, and provider status. Import reconciles skills
by `title`; source IDs and statuses are informational.

```yaml
skills:
  - id: 'skill-id'
    title: 'order-status'
    description: 'Checks an order'
    skill: 'Look up the order and explain its current status.'
    channel: 'whatsapp'
    status: 'active'
```

### `agent.knowledge.faqs`

FAQs contain `id`, `question`, `answer`, and `createdAt`. Import reconciles FAQs
by their exact question text. IDs and creation times come from the source and
are not reused as destination identities.

### `agent.knowledge.websites`

Website entries contain the root `url`, included and excluded subdomains and
URL patterns, explicitly selected `singleUrls`, and crawl-status metadata.
Import reconciles websites by root URL and reapplies the crawl configuration.
Crawl status, errors, page counts, and last-crawled timestamps are informative.

### `agent.knowledge.files`

Every Meta knowledge file has one manifest entry, whether or not its contents
could be bundled:

```yaml
files:
  - providerFileId: 'meta-file-1'
    fileName: 'product-catalog.pdf'
    path: 'files/001-product-catalog.pdf'
    included: true
  - providerFileId: 'meta-file-2'
    fileName: 'configured-elsewhere.pdf'
    path: null
    included: false
```

Field meanings:

- `providerFileId` is the source Meta file ID and identifies missing-file
  prompts;
- `fileName` is the name to use when uploading the file to the destination;
- `path` is the exact relative ZIP entry containing the bytes, or `null`;
- `included` states whether the exporter found a local archived copy.

The importer verifies referenced paths against actual archive entries. A null
or absent entry is treated as a required file, even if `included` incorrectly
says true. All imported knowledge files receive new Meta IDs and are archived
again in the destination organization's file store.

### `agent.connectors`

Connector entries contain their source ID, snake-case name, description, base
URL, protocol, authentication type, certificate requirements, non-secret
connection metadata, optional user-auth injection configuration, and MCP sync
metadata.

Credential values and certificate material are not present. During inspection,
the importer asks for authentication configuration when `authType` is not
`NONE`, and for PEM certificate material when `requiresCertificate` is true.
Import reconciles connectors by `name`.

HTTP connectors also include `tools`. Each HTTP connector tool contains:

- a source ID, snake-case name, and description;
- an HTTP method and path;
- typed path, query, header, and JSON-body parameter definitions;
- user-auth requirements and optional token paths;
- an optional versioned transformation specification.

Tools are reconciled by name within their connector. Source connector and tool
IDs are not portable identities.

MCP connectors omit `tools` from export because their tool catalog belongs to
the remote MCP server. During import, any legacy MCP `tools` field is ignored.
After the connector, authentication, and certificate configuration are
reconciled, import calls Meta's MCP tool refresh action so the current tools are
discovered from the configured server.

## YAML profile

Although the manifest uses a `.yaml` file, AGTX version 1 intentionally uses a
small, deterministic YAML subset:

- indentation is two spaces;
- strings and non-identifier keys are JSON-quoted;
- supported scalars are strings, finite numbers, booleans, and `null`;
- arrays and objects may be nested;
- empty arrays and objects are written as `[]` and `{}`;
- tabs, tags, anchors, aliases, merge keys, custom types, and unquoted free-form
  strings are not supported.

This profile keeps parsing predictable and prevents executable or ambiguous
YAML features. A general YAML writer may produce valid YAML that the AGTX
importer intentionally rejects. When generating a package outside this
application, follow the profile and the version 1 schema exactly.

## How to read an AGTX file

1. Confirm that the extension is `.agtx`, then open it as a ZIP archive.
2. Confirm that `agent.yaml` exists at the archive root.
3. Read `format` and `version` first. Version 1 requires `format: "agtx"` and
   `version: 1`.
4. Use `source.channel` only to understand where the export came from.
5. Review `security` and `importRequirements` to see which sensitive or binary
   inputs are absent.
6. Read `agent.settings`, `allowlist`, `businessInfo`, and `skills` to
   understand the agent's behavior.
7. Review `agent.knowledge`. For every file, follow `path` into the ZIP. A null
   path means the file must be supplied during import.
8. Review connectors and any explicit HTTP tools, remembering that credentials
   and MCP tool catalogs are not included.
9. Treat provider IDs and status fields as provenance. The importer uses stable
   names, questions, URLs, or phone numbers when reconciling destination data.
10. Validate all paths and checksums before using file bytes. Never extract
    absolute paths, backslashes, empty segments, or `.`/`..` segments.

## Editing and producing AGTX files

An AGTX file can be inspected with standard ZIP and text tools. If it is edited,
rebuild the ZIP so entry sizes and CRC32 checksums are correct. Keep
`agent.yaml` at the root, keep knowledge files under `files/`, and make every
file path in the manifest match the ZIP entry exactly.

Do not add secrets to the manifest. The import workflow intentionally collects
credentials and private keys separately. A manually created package should use
a new producer-specific filename but must retain `format: "agtx"` and the
supported schema version inside the manifest.

Import is a reconciliation operation, not an atomic database transaction.
Destination settings absent from the package may be removed, and a provider
failure can leave part of the configuration applied. Inspect the package and
retain a destination export before importing when rollback may be needed.
