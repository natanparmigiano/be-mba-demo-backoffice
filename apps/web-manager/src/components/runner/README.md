# Runner components

`RunnerCodeEditor` owns the browser-only Monaco setup for function source. It
loads Monaco and the JavaScript language worker only when the function editor
is opened, and publishes the revision's typed parameters as an in-memory type
library for completion and diagnostics.

The page owns persistence, revisions, keys, and execution state; this component
only owns editor presentation and language-service lifecycle.
