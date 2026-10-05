# Pages

Pages own route-level API calls, navigation, metadata, and local state. Keep
reusable visual and domain presentation in `components/`, and keep access
decisions in route guards or server authorization rather than page-local
redirects.

## `LoginPage`

Guest-only sign-in screen wired to Better Auth.

- Uses a two-column card on large screens and a single-column form on smaller screens.
- Applies the reusable four-stop brand gradient to the desktop branding panel.
- Uses the light monochrome signifier on the gradient and theme-appropriate monochrome marks on mobile.
- Provides language and theme controls without requiring a session.
- Supports persistent sessions through the `rememberMe` value.
- Supports SSO discovery by work email through Better Auth's SSO plugin.
- Shows the SSO form only when at least one provider has a domain-verified
  configuration.
- Restores the private URL captured by `PrivateRoute` after successful sign-in.
- Updates the document title and description through translated metadata.

The page should not contain backend-specific authentication details. Keep sign-in transport inside `authClient` and visible messages inside the locale resources.

## Authenticated pages

`AppShell` owns authenticated navigation, session actions, and the organization
switcher. Each page then owns one route-level workflow:

- `HomePage`: organization landing dashboard with channel-scoped WhatsApp and
  Business Agent performance counters, feature links, and quick references.
- `ChatPage`: organization-scoped inbox and message/event timeline.
- `StudioHomePage`: recent-project dashboard, project search, new project, and
  local AGTX import entry points.
- `StudioPage`: full-screen persisted AGTX project editor and downloader with a
  Hashbrown-powered assistant in the right panel. The assistant receives the
  AGTX v1 authoring reference and can inspect or merge-patch the manifest and
  MCPX definitions, add remote MCP connectors, and manage packaged files.
  Dirty projects autosave through the organization-scoped API every five
  seconds.
- `OrganizationPage`: organizations, members, and invitations.
- `AgentsPage`: channel grid with Meta Business Agent and Cloud API phone
  registration state plus the first configured WhatsApp message QR code.
- `AgentPage`: treats Cloud API phone-number registration as a prerequisite;
  unregistered channels expose only the registration card and do not load or
  render agent management, backup, import, or export workflows.
- `ChannelsPage`: named WhatsApp connections, with display phone numbers shown
  as secondary identity. `/channels/new` and `/channels/:id`
  provide route-backed, tabbed channel configuration for identity,
  provider-backed phone registration, message QR codes, conversational
  icebreakers and commands, webhook forwarding, and credentials. The directory
  retains impact-previewed, typed-confirmation deletion of local channel data.
- `ContactsPage` and `GroupsPage`: searchable, cursor-paginated browsing and
  read-only detail.
- `FunctionsPage`: organization-scoped function editing, revision restore,
  typed parameters, and isolated test execution.
- `McpsPage`: organization-scoped MCP pack creation, function membership, and
  reviewed MCPX export/import with explicit overwrite approval.
- `ApiKeysPage`: organization-scoped API key creation, function/MCP
  allow-lists, and revocation.
- `ApiPlaygroundPage`: channel-scoped request forms for WhatsApp registration,
  messaging, marketing messages, media, message QR codes, conversational components, Flows, and
  templates, including direct presigned uploads.
- `TemplatesPage`: channel-scoped provider template CRUD, WhatsApp previews,
  filtering, cursor pagination, visual header/body/footer/button component
  editing with operation-specific validation, template example media uploads
  through `wa-media`, advanced carousel/LTO JSON, and Meta approval lifecycle
  status.
- `TemplateSendingPage`: channel-scoped template composition with parameter and
  media inputs, WhatsApp preview, explicit Messages or Marketing Messages API
  selection, plus a separate filtered, cursor-paginated table of persisted
  template sends.
- `AdminPage`: global user administration for Better Auth `admin` users.

- `/organization` is available to authenticated users; Better Auth enforces owner/admin permissions for mutations.
- `/chat` lists contact and group chats for the active organization and opens with no conversation selected. Selecting an inbox row navigates to `/chat/:chatId`, so refresh, back/forward navigation, and copied links preserve the selected conversation. The selected chat is fetched through its tenant-scoped detail endpoint and merged ahead of the current inbox page when it falls outside that page; list cursor semantics remain unchanged. If later pagination reaches that chat's canonical page, the incoming page replaces the supplemental copy and moves the same keyed row into its natural sort position without duplication or changing the route. Invalid, missing, and cross-organization IDs render the same unavailable state without exposing another tenant's data. The inbox and merged message/event timeline use opaque cursor pagination behind prefetching infinite scroll. Once a selected conversation has rendered, the page asks the server to mark its latest inbound message at Meta before transactionally updating the local message statuses, read cursor, and unread count. The render callback changes only when that latest inbound provider message changes, avoiding duplicate acknowledgements during unrelated rerenders. The page subscribes to the active organization's inbox SSE stream so every conversation preview and unread count refreshes; events for the selected chat also refresh its timeline. A lost stream displays a persistent warning with a reconnect action that reloads the snapshot before opening a new connection. Timeline projections are adapted to the typed text, media, contact, location, and interactive renderers. The header identifies whether a human or AI owns the conversation and can transfer Meta thread control in either direction. Human ownership reveals the outbound composer for every non-interactive WhatsApp message variant, including presigned media uploads and compatible in-browser voice recording with a live waveform; AI ownership removes it. Human-owned messages with provider IDs expose reactions from their right-click context menu and send the selected emoji without asking for an ID.
- `/contacts` is available to authenticated organization members and only displays contacts owned through channels in the active organization. Owners and admins can create and edit contacts by WhatsApp ID and profile fields without supplying a provider user ID. Creation immediately provisions the direct chat. The impact-previewed, identifier-confirmed deletion flow removes that direct conversation data.
- `/agents` displays active-organization channels as the entry point for agent
  configuration.
- `/agents/:id` lets organization managers onboard the selected channel, toggle
  rollout, choose its audience, configure human-handoff messaging and
  prohibited phrases, manage allowed phone numbers, edit business information
  and skills, maintain FAQ, website, and file knowledge sources, and manage the
  channel's message QR codes, icebreakers, and commands through the same shared
  cards used by channel configuration. Its Connectors and Evals tabs link to
  their respective grids. Skill titles are
  restricted to kebab-case. Its right-aligned Export tab explains and creates
  a portable ZIP-based `.agtx` package containing `agent.yaml` and locally
  available knowledge files while displaying live progress. Meta-only files
  are marked as missing for a future import prompt; connector secrets are
  intentionally requested separately. Its adjacent Import tab validates the
  package, previews `agent.yaml` locally in expandable resource sections before
  upload, then replaces that preview with explicit server inspection results.
  The inspected state identifies the selected package, summarizes its
  resources, lets the manager customize which components to import, prompts
  only for missing files, credentials, and certificates needed by that
  selection, and confirms when every requirement is complete before displaying
  separate progress stages for each action. Unselected stages remain visible
  as skipped while reconciling the selected agent. Import failures identify the
  failed reconciliation step and preserve the sanitized provider or validation
  reason both in the page alert and browser console; the page separately warns
  when earlier steps may already have changed provider state. The package
  preview states that exported rollout is ignored. Import preserves the
  destination rollout state so an enabled agent stays enabled while a disabled
  agent cannot be unintentionally enabled by the package.
- `/agents/:id/connectors/:connectorId` provides the full connector form,
  connector-tool CRUD, and recent connector logs. The `new` connector ID opens
  the creation form. New connectors can be associated with a local MCP, which
  creates a dedicated 12-month API key and locks the provider-managed fields;
  associated connectors expose key rotation and expiry warnings. Connector
  names are normalized to snake_case while skill
  titles are normalized to kebab-case. Connector tool names also normalize to
  snake_case.
- `/agents/:id/evals/:evalCaseId` shows an MBA evaluation scenario, starts its
  asynchronous run for organization managers, polls the job, and presents its
  progress, scores, summary, highlights, and failures.
- `/groups` is available to authenticated organization members and only displays groups owned through channels in the active organization.
- `/templates`, `/templates/new`, and `/templates/:channelId/:templateId`
  provide provider-backed template browsing and route-backed create/edit
  workflows. Members can inspect templates and approval states; organization
  owners and admins can create, update, and delete them.
- `/functions` lists active-organization functions for members. Function
  mutations and UI test execution require an owner or administrator and are
  enforced again by the API. Test execution is disabled while editor changes
  are unsaved, and the function workspace shows its 20 latest executions.
  Function names are normalized to `snake_case` while typing.
- `/mcps` lists and edits organization-scoped packages of existing active
  functions. MCP names are normalized to `snake_case` while typing. MCP
  details show the stable `/api/mcp/:id` Streamable HTTP endpoint and its
  Bearer-authentication instructions. Managers can export complete revision
  history or preview imported names, removals, affected history, key scopes,
  and blockers before approving a transactional YAML import.
- `/api-keys` provides organization API-key management to owners and
  administrators. Restricted keys authorize the union of selected individual
  functions and the live membership of selected MCP packs.
- `/playground` lets members inspect registration, media, message QR code,
  conversational-component, and template state and lets organization
  owners/admins run registration, messaging, media, QR-code, component, and
  template mutations using server-side channel credentials. Messaging
  attachments use short-lived file-store URLs; the media package tab uploads
  directly through the API. The QR tab covers create, get, image URL, list,
  update, and delete operations from `@mba-demo/wa-qr`. The Components tab
  covers get-configuration and set-configuration operations from
  `@mba-demo/wa-components`. The Flows tab covers the complete management
  surface from `@mba-demo/wa-flows`, including assets, lifecycle transitions,
  metrics, migration, previews, and encryption keys.
  The Templates tab covers create, list, get, namespace, update, and delete
  operations from `@mba-demo/wa-templates`.
  The Marketing tab sends approved templates through `@mba-demo/wa-marketing`
  with product policy, activity-sharing, and per-message bid controls.
- `/admin` is guarded in the client and every admin endpoint independently enforces permissions on the server.
- Application admin roles and organization member roles are separate concepts.

Future conversation or handover pages should receive their own route-level modules instead of expanding `HomePage` indefinitely.

## Page conventions

- Set localized document title and description in an effect.
- Keep loading, empty, error, and submitting states explicit.
- Use route navigation for page transitions rather than assigning `window.location`.
- Compose primitives from `components/ui`.
- Keep reusable domain components in a dedicated feature folder.
- Do not bypass the route guards with page-local session redirects.
