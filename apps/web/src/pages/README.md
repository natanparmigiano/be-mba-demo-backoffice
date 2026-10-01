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

- `HomePage`: landing content.
- `ChatPage`: organization-scoped inbox and message/event timeline.
- `OrganizationPage`: organizations, members, and invitations.
- `AgentsPage`: read-only channel grid with Meta Business Agent configuration
  state for the upcoming setup workflow.
- `ChannelsPage`: WhatsApp connections, including impact-previewed,
  typed-confirmation deletion of local channel data.
- `ContactsPage` and `GroupsPage`: searchable, cursor-paginated browsing and
  read-only detail.
- `FunctionsPage`: organization-scoped function editing, revision restore,
  typed parameters, and isolated test execution.
- `McpsPage`: organization-scoped MCP pack creation and function membership.
- `ApiKeysPage`: organization-scoped API key creation, function/MCP
  allow-lists, and revocation.
- `ApiPlaygroundPage`: channel-scoped request forms for WhatsApp registration
  and messaging, including direct presigned media uploads.
- `AdminPage`: global user administration for Better Auth `admin` users.

- `/organization` is available to authenticated users; Better Auth enforces owner/admin permissions for mutations.
- `/chat` lists contact and group chats for the active organization and opens with no conversation selected. Selecting an inbox row navigates to `/chat/:chatId`, so refresh, back/forward navigation, and copied links preserve the selected conversation. The selected chat is fetched through its tenant-scoped detail endpoint and merged ahead of the current inbox page when it falls outside that page; list cursor semantics remain unchanged. If later pagination reaches that chat's canonical page, the incoming page replaces the supplemental copy and moves the same keyed row into its natural sort position without duplication or changing the route. Invalid, missing, and cross-organization IDs render the same unavailable state without exposing another tenant's data. The inbox and merged message/event timeline use opaque cursor pagination behind prefetching infinite scroll. Once a selected conversation has rendered, the page asks the server to mark its latest inbound message at Meta before transactionally updating the local message statuses, read cursor, and unread count. The render callback changes only when that latest inbound provider message changes, avoiding duplicate acknowledgements during unrelated rerenders. The page subscribes to the active organization's inbox SSE stream so every conversation preview and unread count refreshes; events for the selected chat also refresh its timeline. A lost stream displays a persistent warning with a reconnect action that reloads the snapshot before opening a new connection. Timeline projections are adapted to the typed text, media, contact, location, and interactive renderers. The header identifies whether a human or AI owns the conversation and can transfer Meta thread control in either direction. Human ownership reveals the outbound composer for every non-interactive WhatsApp message variant, including presigned media uploads and compatible in-browser voice recording with a live waveform; AI ownership removes it. Human-owned messages with provider IDs expose reactions from their right-click context menu and send the selected emoji without asking for an ID.
- `/contacts` is available to authenticated organization members and only displays contacts owned through channels in the active organization.
- `/agents` displays active-organization channels as the entry point for agent
  configuration.
- `/agents/:id` lets organization managers onboard the selected channel, toggle
  rollout, choose its audience, configure human-handoff messaging and
  prohibited phrases, manage allowed phone numbers, edit business information
  and skills, and maintain FAQ, website, and file knowledge sources. Its
  Connectors and Evals tabs link to their respective grids. Skill titles are
  restricted to kebab-case. Its right-aligned Export tab explains and creates
  a portable ZIP-based `.agtx` package containing `agent.yaml` and locally
  available knowledge files while displaying live progress. Meta-only files
  are marked as missing for a future import prompt; connector secrets are
  intentionally requested separately. Its adjacent Import tab validates the
  package, previews `agent.yaml` locally in expandable resource sections before
  upload, then replaces that preview with explicit server inspection results.
  The inspected state identifies the selected package, summarizes its
  resources, prompts for missing files, credentials, and certificates, and
  confirms when every requirement is complete before displaying import
  progress while reconciling the selected agent. Import failures identify the
  failed reconciliation step and preserve the sanitized provider or validation
  reason both in the page alert and browser console; the page separately warns
  when earlier steps may already have changed provider state. The package
  preview states that exported rollout is ignored, and successful import warns
  that the agent remains disabled until a manager enables it manually.
- `/agents/:id/connectors/:connectorId` provides the full connector form,
  connector-tool CRUD, and recent connector logs. The `new` connector ID opens
  the creation form. Connector names are normalized to snake_case while skill
  titles are normalized to kebab-case. Connector tool names also normalize to
  snake_case.
- `/agents/:id/evals/:evalCaseId` shows an MBA evaluation scenario, starts its
  asynchronous run for organization managers, polls the job, and presents its
  progress, scores, summary, highlights, and failures.
- `/groups` is available to authenticated organization members and only displays groups owned through channels in the active organization.
- `/functions` lists active-organization functions for members. Function
  mutations and UI test execution require an owner or administrator and are
  enforced again by the API. Test execution is disabled while editor changes
  are unsaved, and the function workspace shows its 20 latest executions.
  Function names are normalized to `snake_case` while typing.
- `/mcps` lists and edits organization-scoped packages of existing active
  functions. MCP names are normalized to `snake_case` while typing. MCP
  details show the stable `/api/mcp/:id` Streamable HTTP endpoint and its
  Bearer-authentication instructions.
- `/api-keys` provides organization API-key management to owners and
  administrators. Restricted keys authorize the union of selected individual
  functions and the live membership of selected MCP packs.
- `/api-playground` lets members inspect registration and media state and lets
  organization owners/admins run registration, messaging, and media mutations
  using server-side channel credentials. Messaging attachments use short-lived
  file-store URLs; the media package tab uploads directly through the API.
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
