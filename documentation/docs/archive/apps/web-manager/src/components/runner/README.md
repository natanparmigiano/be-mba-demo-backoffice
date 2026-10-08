# Function Runner editor

`RunnerCodeEditor` provides the browser-only Monaco editor used by Manager
Function screens. It owns editor presentation and language-service lifecycle;
the page owns persistence, revisions, keys, and execution state.

## Quick start

Render the editor from a Function page and pass the selected revision's source
and typed parameters. Keep API calls and revision state in the page.

## Runtime behavior

The component loads Monaco and its JavaScript language worker only when the
editor opens. It publishes typed revision parameters as an in-memory type
library so completion and diagnostics match the Function contract.

## Troubleshooting

- Missing completion usually means the page did not supply the current typed
  parameter contract.
- Avoid importing Monaco at application startup; preserve lazy loading to keep
  the initial Manager bundle smaller.
- Do not move persistence or execution status into the editor component.

## Verification

Open an existing revision, check diagnostics and completion, edit source, and
confirm the Manager production build succeeds.

## Related documentation

- [Manager components](../README.md)
- [Manager frontend](../../../README.md)
