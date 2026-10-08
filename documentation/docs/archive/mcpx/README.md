# MCPX exports

MCPX is this application's versioned transfer format for an MCP definition and
the runner functions it exposes. MCPX files use the `.mcpx` extension and are
directly readable YAML documents; unlike AGTX agent exports, they are not ZIP
archives.

The machine-readable JSON Schema is available in
[`schema.yml`](./schema.yml). [`sample_dunder_mifflin.mcpx`](./sample_dunder_mifflin.mcpx)
is a complete fictional package that can be inspected or imported through the
MCP management screen.

## Quick start

Open an MCPX file as YAML, verify `format: "mba-mcp"` and `version: 1`, then
review every JavaScript revision. Import it from Manager's MCP screen and
approve the preview only after checking function names, parameters, and code.

Start with [`sample_dunder_mifflin.mcpx`](./sample_dunder_mifflin.mcpx) when
building or validating tooling against the format. MCPX carries executable
source, but never API keys or execution permission.

## Version 1 structure

<!-- prettier-ignore -->
```yaml
format: "mba-mcp"
version: 1
mcp:
  name: "customer_tools"
  description: "Customer-facing tools"
  functions:
    -
      name: "find_customer"
      description: "Looks up a customer."
      currentRevision: 1
      revisions:
        -
          revision: 1
          code: |-
            function findCustomer({ customer_id }) {
              // Return the stable shape expected by callers of this example tool.
              return {
                customer_id,
                found: true,
              };
            }
          parameters:
            -
              name: "customer_id"
              type: "string"
              required: true
              description: "Customer identifier."
          createdAt: "2026-10-01T12:00:00.000Z"
```

`format` and `version` are compatibility identifiers and must not be inferred
from the filename. An MCPX package contains:

- the MCP's snake-case name and optional description;
- its ordered function list;
- each function's name, description, and current revision;
- every immutable revision, including its source, parameter contract, and
  original creation timestamp.

The runtime also enforces invariants that are documented but not fully
expressible in JSON Schema: revision numbers must be contiguous from 1,
`currentRevision` must identify the final revision, and parameter names must be
unique within each revision.

## Import behavior

The import workflow always inspects the package first and presents a preview
for approval. On a new import, stored function names are prefixed with
`<mcp_name>__`. A function already beginning with that exact prefix is not
prefixed again, which makes reimports stable.

If an MCP with the same name exists, the user must explicitly approve an
overwrite. The MCP ID is retained, but its functions, revisions, terminal
execution history, and direct function API-key scopes are replaced inside one
database transaction. MCP-scoped API keys therefore continue to refer to the
same MCP. Import is blocked when an old function belongs to another MCP, has a
queued or running execution, or when a resulting function name conflicts with
an unrelated function.

Version 1 accepts at most 1,000 functions, 1,000 revisions per function, 100
parameters per revision, and 10 MiB per MCPX file. Function and MCP names are
limited to 512 characters.

## Security

MCPX contains executable JavaScript. Treat an untrusted file as source code:
review every revision in the preview before approving the import. Importing a
package does not execute its functions, include API keys, or grant access by
itself. Execution still requires a valid organization runner key whose direct
function or MCP scope permits the call, and runs through the constrained runner
isolate and worker.

## Dunder Mifflin sample

The sample is the server-side counterpart of the single MCP connector in the
[`../agtx/sample_dunder_mifflin.agtx`](../agtx/sample_dunder_mifflin.agtx)
agent export. The AGTX package intentionally omits tool definitions; importing
it refreshes the tool catalog from this MCPX-backed server. The server exposes
these six operations through an MCP named `dunder_mifflin_mcp`:

- `search_paper_catalog`
- `create_paper_quote`
- `check_delivery_status`
- `create_delivery_issue`
- `get_customer_account`
- `get_order_for_reorder`

Each function retains the connector operation's input contract but is a safe
demonstration mock that returns deterministic JSON and performs no network or
database access.

## Mobius Design sample

[`sample_mobius_design.mcpx`](./sample_mobius_design.mcpx) is the MCP package
embedded in the [`../agtx/sample_mobius_design.agtx`](../agtx/sample_mobius_design.agtx)
architecture-studio sample. It exposes `search_portfolio`,
`create_consultation_request`, and `check_project_status`. The functions make
no network or database calls and return fictional demo data.
