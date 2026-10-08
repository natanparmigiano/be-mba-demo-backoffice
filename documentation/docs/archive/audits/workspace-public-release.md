---
title: Workspace public-release audit
sidebar_label: Workspace public release
sidebar_position: 1
---

# MBA Desk Workspace public-release audit

**Do not publish by deleting only `apps/api-manager` and `apps/web-manager`.**

Workspace does not mount Manager routes or import Manager pages, but the repository, build, image, shared packages, documentation, and deployments remain coupled to Manager.

## Quick start

Treat the recommended release gate at the end of this document as the public
export checklist. Re-run it against a tree where Manager packages are
physically absent before publishing.

## Release blockers

### Build and deployment coupling

- Root `dev`, `build`, `typecheck`, and `test` scripts invoke both Manager workspaces (`package.json:14-20`).
- The Dockerfile requires Manager manifests and copies Manager artifacts (`Dockerfile:11,14,65,67`).
- Simple Compose runs each application's subscriber registry in its own process
  (`compose.simple.yaml`).
- Full Compose and Render explicitly require Manager (`compose.yaml:155-203,228-232`; `render.yaml:40-82`).

### Resolved: Workspace owns inbound WhatsApp webhooks

`/api/wa-cloud/webhook` is now mounted only by Workspace. Manager registers the
canonical callback from `WORKSPACE_URL`, and internal MCP addresses use
`MANAGER_URL`; neither is inferred from the incoming request host.

Memory-event subscribers now run inside their owning Workspace and Manager apps
for Simple Compose and Render. Kafka deployments keep both HTTP apps
publisher-only and use the standalone `workspace-worker` and `manager-worker`
processes.

### Resolved: API and worker implementations are physically separated

Neutral authentication, administration, file delivery, and lifecycle code stays
in `@mba-desk/api-core`. Operational routes and WhatsApp webhook subscribers
live in `@mba-desk/api-workspace-core`. Playground, Studio, MCP, Runner, agent
and channel management, and Runner execution subscribers live in
`@mba-desk/api-manager-core`.

The Workspace channel overview is now independent of the Manager channel
management module. Workspace has no dependency on `api-manager-core`, so a
public allowlist can omit that package and its worker completely.

### Shared frontend shell contains Manager UX

- `lib/web-shared/src/components/app/AppShell.tsx:47-190,463-477` contains both navigation variants.

Manager pages remain unreachable and no credentials were found. The remaining
question is whether to inject navigation or use separate shells so Workspace
does not ship Manager navigation behavior.

### Documentation catalogs Manager capabilities

The checked-in Postman collection catalogs the management API. Root scripts, environment examples, deployment documentation, Docker documentation, and the Blueprint also describe Manager. A public export must omit or filter these artifacts.

## Positive findings

- No Workspace/shared package imports either Manager application package.
- Workspace API typing comes directly from `@mba-desk/api-workspace`.
- Workspace router contains no Manager feature pages.
- Workspace API does not mount Manager playground/Studio/MCP/Runner routes.
- Workspace intentionally retains authenticated user and organization administration.
- Workspace core has no source or package dependency on Manager core.
- Workspace and Manager have independent worker entrypoints and subscriber registries.
- Tests confirm `/api/runner/functions` and `POST /api/channels` return 404 on Workspace.
- Workspace tests, typecheck, and production frontend build pass.
- No build process is currently running.

## Recommended release gate

1. Create a public export allowlist rather than subtracting two folders.
2. Verify public webhook ingress and Workspace worker topology in the exported deployment.
3. Split or inject the shared shell navigation.
4. Add Workspace-only scripts, Dockerfile, Compose, Blueprint, CI, and docs.
5. Remove Manager collections, commands, variables, docs, and artifacts from the public export.
6. Build from an exported tree where Manager paths are physically absent; inspect the final image and assert Manager files/paths are absent while webhook-to-chat ingestion still works.
