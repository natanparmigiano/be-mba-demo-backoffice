# `@mba-demo/runner`

`@mba-demo/runner` stores organization-scoped JavaScript functions, creates an
immutable revision for every update, validates revision-specific typed
parameters, executes a selected revision in a resource-limited `isolated-vm`
V8 isolate, and records every started execution in PostgreSQL.

## Public API

```ts
import { runner } from '@mba-demo/runner'

const definition = await runner.createFunction('organization-id', {
  name: 'greet',
  code: `({ name }) => ({ greeting: 'Hello, ' + name })`,
  parameters: [{ name: 'name', type: 'string', required: true }],
})

await runner.updateFunction('organization-id', definition.id, {
  code: `({ name }) => ({ greeting: 'Welcome, ' + name })`,
  parameters: [{ name: 'name', type: 'string', required: true }],
})

const mcp = await runner.createMcp('organization-id', {
  name: 'customer_tools',
  description: 'Functions exposed as one MCP pack',
  functionIds: [definition.id],
})

const key = await runner.createApiKey('organization-id', {
  name: 'production',
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  allowedFunctionIds: [definition.id],
  allowedMcpIds: [mcp.id],
})

const execution = await runner.executeFunction(definition.id, key.apiKey, {
  arguments: { name: 'Ada' },
})

await runner.archiveFunction('organization-id', definition.id)
```

Create an organization API key with an obligatory future expiration using
`createApiKey`. Restricted keys receive the union of `allowedFunctionIds` and
the current membership of `allowedMcpIds`; setting both to `null` allows every
function in the organization. MCP membership is live, so adding or removing a
function changes what MCP-scoped keys can execute. The plaintext `rnr_...` key
is returned once; PostgreSQL stores only its SHA-256 hash and a display prefix.
`executeFunction` checks organization ownership, the optional allow-list, key
hash, revocation state, and expiration in one scoped lookup. Keys can be
invalidated immediately with `revokeApiKey`.

`Runner` accepts injected repository and executor implementations for tests.
The default singleton uses `@mba-demo/db`, publishes the versioned
`runner.execution.requested.v1` event, and waits for the worker's durable
PostgreSQL result without changing the public `execute*()` method signatures or
return values. The event contains only a schema version and execution-log ID;
API keys, function source, and arguments remain in PostgreSQL. A `Runner`
constructed without an execution publisher executes inline, which keeps unit
tests independent from Kafka.

`listFunctions` and `getFunction` provide organization-scoped management
views. `getFunction` includes the complete immutable revision history.
`listMcps`, `getMcp`, `createMcp`, `updateMcp`, and `deleteMcp` manage named
packs of existing active functions.
An MCP associated with a Meta agent connector cannot be deleted until that
connector is explicitly removed; the association is never cascade-deleted.
Function and MCP names have a 512-character limit and use `snake_case`;
functions additionally allow a double underscore as an import namespace
separator. The management UI normalizes names as they are entered, and the
shared schemas enforce the same contract at the API boundary.
`getMcpRuntime` authenticates a runner key and returns the active MCP tools
covered by its effective function and MCP scopes. `executeMcpFunction` binds a
tool call to both the requested MCP and function, then rechecks the key,
membership, scope, revocation, and expiration before using the same
worker-backed isolated executor and execution log as direct calls.
`restoreRevision` copies an older revision's code and parameters into a new
latest revision, leaving the original history unchanged. `listApiKeys` returns
organization key metadata only and never exposes stored key material. Browser
test execution rotates and reuses one short-lived organization key named `UI`.
`listExecutions` returns the 20 most recent organization-scoped execution logs
for a function.

`deleteFunction` is organization-scoped and permanent. It refuses deletion
while an execution is queued or running. Otherwise one transaction deletes the
function's terminal execution logs and MCP memberships, removes its ID from
direct API-key allowlists, and deletes the function; revision and parameter
rows then follow their database cascades.

`exportMcpPackage`, `inspectMcpImport`, and `importMcpPackage` implement the
versioned `mba-mcp` MCPX lifecycle. An `.mcpx` file is a directly readable YAML
document carrying MCP metadata and every
revision, parameter declaration, and revision timestamp for each ordered
function. New imports store functions as `<mcp_name>__<function_name>`;
already-prefixed reimports keep the name unchanged. Replacement keeps the MCP
ID but removes its old functions, history, terminal executions, and direct
function scopes before recreating the exported history in the same database
transaction. Preview blocks shared functions, active executions, collisions,
duplicate resolved names, and names beyond 512 characters.

Archiving preserves revisions and logs, marks the function inactive, and
renames it to `<name>#Archived<ISO timestamp>`. This frees the original
organization-scoped name for reuse.

## Revisions and parameters

Function source belongs to immutable `runner.function_revisions` rows. The
`runner.functions.current_revision` field identifies the default revision;
callers may execute an older revision explicitly. Updating a function locks its
definition while atomically incrementing the revision and inserting its source
and parameter declarations.

Parameters are passed to user code as one object. Supported declared types are
`boolean`, `integer`, `json`, `number`, and `string`. Unknown parameters,
missing required parameters, non-finite numbers, and non-JSON values are
rejected before an execution starts.

## Isolation and limits

Each execution gets a new `isolated-vm` isolate with inspector support disabled,
an 8 MiB V8 heap limit, and a 500 ms CPU/wall deadline. It receives a deep-frozen
JSON copy of its parameters and no `process`, `require`, filesystem, timers, or
other application references. Its only host capability is `fetch`: HTTPS is
mandatory, credentials in URLs and private/loopback destinations are rejected,
redirects are revalidated and capped, dangerous transport headers are blocked,
and request/response bodies are bounded. Results must be JSON-serializable.

The V8 memory ceiling is the smallest supported by `isolated-vm`; as documented
by that dependency, hostile code may briefly exceed the configured heap ceiling.
These controls are defense in depth rather than an OS/container security
boundary, so use an additional process/container sandbox for mutually untrusted
tenants.

`isolated-vm` requires Node.js to start with `--no-node-snapshot`. The API
development, test, production-start scripts and container environment already
set this flag. Embedders that launch a different process must set it too.

Execution-log statuses are `queued`, `running`, `succeeded`, `failed`, and
`timed_out`. The API validates and persists a queued row before publishing its
ID. A worker atomically claims that row, executes the immutable revision, and
completes it with the result or bounded error, duration, and timestamps. The
calling `execute*()` promise waits up to 30 seconds for that terminal row, so
its existing API remains synchronous from the caller's perspective. Archived
functions cannot be updated or
executed.

## Verification

```bash
yarn workspace @mba-demo/runner typecheck
yarn workspace @mba-demo/runner test
yarn workspace @mba-demo/runner build
yarn smoke:runner # requires the development PostgreSQL container
```
