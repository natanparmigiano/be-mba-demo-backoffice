import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../../../api'
import { PlaygroundOperationCard, type PlaygroundOperationState } from '..'
import type { PlaygroundRequestExample } from '../PlaygroundRequestActions'
import { Checkbox, Input, Select, Textarea } from '@mba-desk/ui'

type Props = {
  channelId: string
  phoneNumberId: string
  businessId: string
  mutationDisabled: boolean
}

type Action =
  | 'listConnectors'
  | 'getConnector'
  | 'createConnector'
  | 'updateConnector'
  | 'deleteConnector'
  | 'getConnectorLogs'
  | 'refreshMcpTools'
  | 'upsertConnectorApiKey'
  | 'upsertConnectorOAuth'
  | 'upsertConnectorCertificate'
  | 'listConnectorTools'
  | 'getConnectorTool'
  | 'createConnectorTool'
  | 'updateConnectorTool'
  | 'runConnectorTool'
  | 'deleteConnectorTool'

type Value = string | boolean
type Values = Record<string, Value>
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

type Operation = {
  title: string
  description: string
  method: HttpMethod
  action: Action
  mutation: boolean
  initial: Values
  fields: (values: Values, set: SetValue) => ReactNode
  request: (phoneNumberId: string, values: Values) => PlaygroundRequestExample
  arguments: (values: Values) => unknown[]
  options?: (values: Values) => Record<string, unknown>
}

type SetValue = (name: string, value: Value) => void

const connectorDefaults = {
  name: 'Order Management API',
  description: 'Looks up orders and helps customers manage them.',
  baseUrl: 'https://api.example.com',
  connectorProtocol: 'HTTP',
  authType: 'NONE',
  requiresCertificate: false,
  authConfig: '',
  userAuthInjectionConfig: '',
}

const connectorOperations: Operation[] = [
  simpleOperation(
    'List Connectors',
    'Lists all external API and MCP connectors configured for the agent.',
    'GET',
    'listConnectors',
    false,
    'agent_connectors',
  ),
  idOperation(
    'Get Connector',
    'Retrieves one connector by ID.',
    'GET',
    'getConnector',
    false,
  ),
  connectorWriteOperation(
    'Create Connector',
    'Creates an HTTP or MCP connector.',
    'POST',
    'createConnector',
    false,
  ),
  connectorWriteOperation(
    'Update Connector',
    'Updates the selected connector. Connector protocol cannot be changed after creation.',
    'PUT',
    'updateConnector',
    true,
  ),
  idOperation(
    'Delete Connector',
    'Deletes the selected connector and makes its operations unavailable to the agent.',
    'DELETE',
    'deleteConnector',
    true,
  ),
  {
    title: 'Get Connector Logs',
    description: 'Retrieves connector error logs from the last seven days.',
    method: 'GET',
    action: 'getConnectorLogs',
    mutation: false,
    initial: {
      connectorId: 'CONNECTOR_ID',
      startTime: '',
      endTime: '',
      limit: '',
      toolId: '',
      includeStats: '',
      summaryOnly: '',
      topN: '',
    },
    fields: (v, set) => (
      <>
        <Input
          label="Connector ID"
          value={s(v.connectorId)}
          onChange={(e) => set('connectorId', e.currentTarget.value)}
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Start time"
            hint="Optional Unix timestamp within the last seven days."
            type="number"
            value={s(v.startTime)}
            onChange={(e) => set('startTime', e.currentTarget.value)}
          />
          <Input
            label="End time"
            hint="Optional Unix timestamp; range cannot exceed seven days."
            type="number"
            value={s(v.endTime)}
            onChange={(e) => set('endTime', e.currentTarget.value)}
          />
          <Input
            label="Limit"
            type="number"
            min="1"
            max="1000"
            value={s(v.limit)}
            onChange={(e) => set('limit', e.currentTarget.value)}
          />
          <Input
            label="Tool ID"
            value={s(v.toolId)}
            onChange={(e) => set('toolId', e.currentTarget.value)}
          />
          <Input
            label="Top N"
            type="number"
            min="1"
            max="50"
            value={s(v.topN)}
            onChange={(e) => set('topN', e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <OptionalBoolean
            label="Include statistics"
            value={v.includeStats}
            set={(value) => set('includeStats', value)}
          />
          <OptionalBoolean
            label="Summary only"
            value={v.summaryOnly}
            set={(value) => set('summaryOnly', value)}
          />
        </div>
      </>
    ),
    request: (phone, v) =>
      request(
        'GET',
        connectorUrl(exportPhoneNumberId(phone), exportConnectorId(v), 'logs'),
        undefined,
        compact({
          start_time: v.startTime,
          end_time: v.endTime,
          limit: v.limit,
          tool_id: exportToolId(v.toolId),
          include_stats: v.includeStats,
          summary_only: v.summaryOnly,
          top_n: v.topN,
        }),
      ),
    arguments: (v) => [required(v, 'connectorId')],
    options: (v) =>
      compact({
        startTime: numberValue(v.startTime),
        endTime: numberValue(v.endTime),
        limit: numberValue(v.limit),
        toolId: v.toolId,
        includeStats: optionalBoolean(v.includeStats),
        summaryOnly: optionalBoolean(v.summaryOnly),
        topN: numberValue(v.topN),
      }),
  },
  connectorActionOperation(
    'Refresh MCP Tools',
    "Rediscovers a remote MCP server's tools.",
    'refreshMcpTools',
    'refreshMCPTools',
  ),
  {
    title: 'Upsert Connector API Key',
    description:
      "Sets or rotates the selected connector's API-key credentials.",
    method: 'POST',
    action: 'upsertConnectorApiKey',
    mutation: true,
    initial: {
      connectorId: 'CONNECTOR_ID',
      headers:
        '[{"field_name":"X-API-Key","value":"{{Connector-API-Key}}","prefix":""}]',
      queryParams: '[]',
      bodyParams: '[]',
    },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        <JsonField
          label="Header credentials"
          value={v.headers}
          set={(x) => set('headers', x)}
        />
        <JsonField
          label="Query parameter credentials"
          value={v.queryParams}
          set={(x) => set('queryParams', x)}
        />
        <JsonField
          label="Body parameter credentials"
          value={v.bodyParams}
          set={(x) => set('bodyParams', x)}
        />
      </>
    ),
    request: (phone, v) =>
      request(
        'POST',
        connectorUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          'upsertApiKey',
        ),
        apiKeyBody(v),
      ),
    arguments: (v) => [required(v, 'connectorId'), apiKeyBody(v)],
  },
  {
    title: 'Upsert Connector OAuth Credentials',
    description: 'Sets or rotates OAuth 2.0 client credentials.',
    method: 'POST',
    action: 'upsertConnectorOAuth',
    mutation: true,
    initial: {
      connectorId: 'CONNECTOR_ID',
      tokenUrl: 'https://api.example.com/oauth/token',
      scopes: 'read',
      contentType: 'application/x-www-form-urlencoded',
      clientId: '{{OAuth-Client-ID}}',
      clientSecret: '{{OAuth-Client-Secret}}',
    },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        <Input
          label="Token URL"
          type="url"
          value={s(v.tokenUrl)}
          onChange={(e) => set('tokenUrl', e.currentTarget.value)}
          required
        />
        <Input
          label="Scopes"
          hint="Comma-separated OAuth scopes."
          value={s(v.scopes)}
          onChange={(e) => set('scopes', e.currentTarget.value)}
        />
        <Select
          label="Token request content type"
          value={s(v.contentType)}
          onChange={(e) => set('contentType', e.currentTarget.value)}
        >
          <option value="application/x-www-form-urlencoded">
            application/x-www-form-urlencoded
          </option>
          <option value="application/json">application/json</option>
        </Select>
        <Input
          label="Client ID"
          value={s(v.clientId)}
          onChange={(e) => set('clientId', e.currentTarget.value)}
          required
        />
        <Input
          label="Client secret"
          type="password"
          value={s(v.clientSecret)}
          onChange={(e) => set('clientSecret', e.currentTarget.value)}
          required
        />
      </>
    ),
    request: (phone, v) =>
      request(
        'POST',
        connectorUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          'upsertOAuth',
        ),
        oauthBody(v),
      ),
    arguments: (v) => [required(v, 'connectorId'), oauthBody(v)],
  },
  {
    title: 'Upsert Connector Certificate',
    description: "Uploads or rotates the selected connector's mTLS material.",
    method: 'POST',
    action: 'upsertConnectorCertificate',
    mutation: true,
    initial: {
      connectorId: 'CONNECTOR_ID',
      clientCertificate: '{{Client-Certificate}}',
      clientKey: '{{Client-Private-Key}}',
      caCertificate: '',
    },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        <Textarea
          label="Client certificate"
          value={s(v.clientCertificate)}
          onChange={(e) => set('clientCertificate', e.currentTarget.value)}
          required
        />
        <Textarea
          label="Client private key"
          value={s(v.clientKey)}
          onChange={(e) => set('clientKey', e.currentTarget.value)}
          required
        />
        <Textarea
          label="CA certificate"
          hint="Optional private CA certificate."
          value={s(v.caCertificate)}
          onChange={(e) => set('caCertificate', e.currentTarget.value)}
        />
      </>
    ),
    request: (phone, v) =>
      request(
        'POST',
        connectorUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          'upsertCertificate',
        ),
        certificateBody(v),
      ),
    arguments: (v) => [required(v, 'connectorId'), certificateBody(v)],
  },
]

const toolDefaults = {
  connectorId: 'CONNECTOR_ID',
  toolId: 'TOOL_ID',
  name: 'lookup_order',
  description:
    'Use when a customer asks for an order status. Requires an order ID and returns status and delivery information.',
  method: 'GET',
  path: '/orders/{order_id}',
  pathParameters:
    '{"order_id":{"type":"string","description":"The customer’s order identifier."}}',
  queryParameters: '{}',
  headers: '{}',
  body: '',
  userAuthRequired: false,
  userAuthActionConfig: '',
  transformationSpec: '',
}

const toolOperations: Operation[] = [
  toolIdOperation(
    'List Connector Tools',
    'Lists every operation the agent can invoke through the selected connector.',
    'GET',
    'listConnectorTools',
    false,
    false,
  ),
  toolIdOperation(
    'Get Connector Tool',
    'Retrieves one connector tool and its complete request definition.',
    'GET',
    'getConnectorTool',
    false,
    true,
  ),
  toolWriteOperation(
    'Create Connector Tool',
    'Creates one operation on the selected connector.',
    'POST',
    'createConnectorTool',
    false,
  ),
  toolWriteOperation(
    'Update Connector Tool',
    'Updates the selected connector tool.',
    'PUT',
    'updateConnectorTool',
    true,
  ),
  {
    title: 'Run Connector Tool',
    description: 'Executes the selected tool for pre-production verification.',
    method: 'POST',
    action: 'runConnectorTool',
    mutation: true,
    initial: {
      connectorId: 'CONNECTOR_ID',
      toolId: 'TOOL_ID',
      input: '{"order_id":"12345"}',
    },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        <ToolId value={v.toolId} set={set} />
        <JsonField
          label="Tool input"
          value={v.input}
          set={(x) => set('input', x)}
        />
      </>
    ),
    request: (phone, v) =>
      request(
        'POST',
        toolUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          exportToolId(v.toolId),
          'run',
        ),
        {
          input: JSON.stringify(jsonObject(v.input, 'Tool input')),
        },
      ),
    arguments: (v) => [
      required(v, 'connectorId'),
      required(v, 'toolId'),
      { input: jsonObject(v.input, 'Tool input') },
    ],
  },
  toolIdOperation(
    'Delete Connector Tool',
    'Deletes the selected operation from the connector.',
    'DELETE',
    'deleteConnectorTool',
    true,
    true,
  ),
]

export function ConnectorsPlaygroundFolder(props: Props) {
  return <Folder operations={connectorOperations} {...props} />
}

export function ConnectorToolsPlaygroundFolder(props: Props) {
  return <Folder operations={toolOperations} {...props} />
}

function Folder({ operations, ...props }: Props & { operations: Operation[] }) {
  return (
    <div className="grid gap-4">
      {operations.map((operation, index) => (
        <OperationCard
          key={operation.title}
          operation={operation}
          defaultOpen={index === 0}
          {...props}
        />
      ))}
    </div>
  )
}

function OperationCard({
  operation,
  channelId,
  phoneNumberId,
  mutationDisabled,
  defaultOpen,
}: Props & { operation: Operation; defaultOpen: boolean }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Values>(operation.initial)
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  const set: SetValue = (name, value) =>
    setValues((current) => ({ ...current, [name]: value }))
  const run = async () => {
    setState({ status: 'loading' })
    try {
      const response = await apiClient.api.playground.mba[':channelId'].$post({
        param: { channelId },
        json: {
          action: operation.action,
          arguments: operation.arguments(values),
          options: operation.options?.(values) ?? {},
        },
      })
      const body: unknown = await response.json()
      if (!response.ok)
        throw new Error(
          message(body) ??
            t('apiPlayground.requestFailed', { status: response.status }),
        )
      const result = record(body).result
      if (!('result' in record(body)))
        throw new Error(t('apiPlayground.unexpectedResponse'))
      setState({ status: 'success', result })
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('apiPlayground.operationFailed'),
      })
    }
  }
  return (
    <PlaygroundOperationCard
      method={operation.method}
      request={operation.request(phoneNumberId, values)}
      title={operation.title}
      description={operation.description}
      action={t('apiPlayground.mba.action')}
      state={state}
      disabled={!channelId || (operation.mutation && mutationDisabled)}
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      buttonVariant={operation.method === 'DELETE' ? 'danger' : 'primary'}
      onSubmit={() => void run()}
    >
      {operation.fields(values, set)}
    </PlaygroundOperationCard>
  )
}

function simpleOperation(
  title: string,
  description: string,
  method: 'GET',
  action: Action,
  mutation: boolean,
  segment: string,
): Operation {
  return {
    title,
    description,
    method,
    action,
    mutation,
    initial: {},
    fields: () => null,
    request: (phone) =>
      request(method, entityUrl(exportPhoneNumberId(phone), segment)),
    arguments: () => [],
  }
}

function idOperation(
  title: string,
  description: string,
  method: 'GET' | 'DELETE',
  action: Action,
  mutation: boolean,
): Operation {
  return {
    title,
    description,
    method,
    action,
    mutation,
    initial: { connectorId: 'CONNECTOR_ID' },
    fields: (v, set) => <ConnectorId value={v.connectorId} set={set} />,
    request: (phone, v) =>
      request(
        method,
        connectorUrl(exportPhoneNumberId(phone), exportConnectorId(v)),
      ),
    arguments: (v) => [required(v, 'connectorId')],
  }
}

function connectorWriteOperation(
  title: string,
  description: string,
  method: 'POST' | 'PUT',
  action: Action,
  withId: boolean,
): Operation {
  return {
    title,
    description,
    method,
    action,
    mutation: true,
    initial: {
      ...(withId ? { connectorId: 'CONNECTOR_ID' } : {}),
      ...connectorDefaults,
    },
    fields: (v, set) => (
      <>
        {withId && <ConnectorId value={v.connectorId} set={set} />}
        <Input
          label="Connector name"
          value={s(v.name)}
          onChange={(e) => set('name', e.currentTarget.value)}
          required
        />
        <Textarea
          label="Connector description"
          value={s(v.description)}
          onChange={(e) => set('description', e.currentTarget.value)}
          required
        />
        <Input
          label="Base URL"
          type="url"
          value={s(v.baseUrl)}
          onChange={(e) => set('baseUrl', e.currentTarget.value)}
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Connector protocol"
            value={s(v.connectorProtocol)}
            onChange={(e) => set('connectorProtocol', e.currentTarget.value)}
          >
            <option value="HTTP">HTTP</option>
            <option value="MCP">MCP</option>
          </Select>
          <Select
            label="Authentication type"
            value={s(v.authType)}
            onChange={(e) => set('authType', e.currentTarget.value)}
          >
            <option value="NONE">None</option>
            <option value="API_KEY">API key</option>
            <option value="OAUTH2_CLIENT_CREDENTIALS">
              OAuth 2.0 client credentials
            </option>
          </Select>
        </div>
        <Checkbox
          label="Requires client certificate"
          checked={b(v.requiresCertificate)}
          onChange={(e) => set('requiresCertificate', e.currentTarget.checked)}
        />
        <JsonField
          label="Authentication configuration"
          optional
          value={v.authConfig}
          set={(x) => set('authConfig', x)}
        />
        <JsonField
          label="User authentication injection configuration"
          optional
          value={v.userAuthInjectionConfig}
          set={(x) => set('userAuthInjectionConfig', x)}
        />
      </>
    ),
    request: (phone, v) =>
      request(
        method,
        withId
          ? connectorUrl(exportPhoneNumberId(phone), exportConnectorId(v))
          : entityUrl(exportPhoneNumberId(phone), 'agent_connectors'),
        connectorBody(v),
      ),
    arguments: (v) =>
      withId
        ? [required(v, 'connectorId'), connectorBody(v)]
        : [connectorBody(v)],
  }
}

function connectorActionOperation(
  title: string,
  description: string,
  action: Action,
  suffix: string,
): Operation {
  return {
    title,
    description,
    method: 'POST',
    action,
    mutation: true,
    initial: { connectorId: 'CONNECTOR_ID' },
    fields: (v, set) => <ConnectorId value={v.connectorId} set={set} />,
    request: (phone, v) =>
      request(
        'POST',
        connectorUrl(exportPhoneNumberId(phone), exportConnectorId(v), suffix),
      ),
    arguments: (v) => [required(v, 'connectorId')],
  }
}

function toolIdOperation(
  title: string,
  description: string,
  method: 'GET' | 'DELETE',
  action: Action,
  mutation: boolean,
  needsTool: boolean,
): Operation {
  return {
    title,
    description,
    method,
    action,
    mutation,
    initial: {
      connectorId: 'CONNECTOR_ID',
      ...(needsTool ? { toolId: 'TOOL_ID' } : {}),
    },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        {needsTool && <ToolId value={v.toolId} set={set} />}
      </>
    ),
    request: (phone, v) =>
      request(
        method,
        toolUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          ...(needsTool ? [exportToolId(v.toolId)] : []),
        ),
      ),
    arguments: (v) =>
      needsTool
        ? [required(v, 'connectorId'), required(v, 'toolId')]
        : [required(v, 'connectorId')],
  }
}

function toolWriteOperation(
  title: string,
  description: string,
  method: 'POST' | 'PUT',
  action: Action,
  withTool: boolean,
): Operation {
  return {
    title,
    description,
    method,
    action,
    mutation: true,
    initial: { ...toolDefaults, ...(withTool ? {} : { toolId: '' }) },
    fields: (v, set) => (
      <>
        <ConnectorId value={v.connectorId} set={set} />
        {withTool && <ToolId value={v.toolId} set={set} />}
        <Input
          label="Tool name"
          value={s(v.name)}
          onChange={(e) => set('name', e.currentTarget.value)}
          required
        />
        <Textarea
          label="Tool description"
          value={s(v.description)}
          onChange={(e) => set('description', e.currentTarget.value)}
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="HTTP method"
            value={s(v.method)}
            onChange={(e) => set('method', e.currentTarget.value)}
          >
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
          <Input
            label="Path"
            value={s(v.path)}
            onChange={(e) => set('path', e.currentTarget.value)}
            required
          />
        </div>
        <JsonField
          label="Path parameters"
          value={v.pathParameters}
          set={(x) => set('pathParameters', x)}
        />
        <JsonField
          label="Query parameters"
          value={v.queryParameters}
          set={(x) => set('queryParameters', x)}
        />
        <JsonField
          label="Headers"
          value={v.headers}
          set={(x) => set('headers', x)}
        />
        <JsonField
          label="Request body definition"
          optional
          value={v.body}
          set={(x) => set('body', x)}
        />
        <Checkbox
          label="User authentication required"
          checked={b(v.userAuthRequired)}
          onChange={(e) => set('userAuthRequired', e.currentTarget.checked)}
        />
        <JsonField
          label="User authentication action configuration"
          optional
          value={v.userAuthActionConfig}
          set={(x) => set('userAuthActionConfig', x)}
        />
        <JsonField
          label="Transformation specification"
          optional
          value={v.transformationSpec}
          set={(x) => set('transformationSpec', x)}
        />
      </>
    ),
    request: (phone, v) =>
      request(
        method,
        toolUrl(
          exportPhoneNumberId(phone),
          exportConnectorId(v),
          ...(withTool ? [exportToolId(v.toolId)] : []),
        ),
        encodedToolBody(v),
      ),
    arguments: (v) =>
      withTool
        ? [required(v, 'connectorId'), required(v, 'toolId'), toolBody(v)]
        : [required(v, 'connectorId'), toolBody(v)],
  }
}

function ConnectorId({
  value,
  set,
}: {
  value: Value | undefined
  set: SetValue
}) {
  return (
    <Input
      label="Connector ID"
      value={s(value)}
      onChange={(e) => set('connectorId', e.currentTarget.value)}
      required
    />
  )
}
function ToolId({ value, set }: { value: Value | undefined; set: SetValue }) {
  return (
    <Input
      label="Tool ID"
      value={s(value)}
      onChange={(e) => set('toolId', e.currentTarget.value)}
      required
    />
  )
}
function JsonField({
  label,
  value,
  set,
  optional = false,
}: {
  label: string
  value: Value | undefined
  set: (value: string) => void
  optional?: boolean
}) {
  return (
    <Textarea
      label={label}
      hint={optional ? 'Optional JSON object.' : 'JSON object or array.'}
      rows={4}
      value={s(value)}
      onChange={(e) => set(e.currentTarget.value)}
      required={!optional}
    />
  )
}

function OptionalBoolean({
  label,
  value,
  set,
}: {
  label: string
  value: Value | undefined
  set: (value: string) => void
}) {
  return (
    <Select
      label={label}
      value={s(value)}
      onChange={(event) => set(event.currentTarget.value)}
    >
      <option value="">Omit parameter</option>
      <option value="true">True</option>
      <option value="false">False</option>
    </Select>
  )
}

function connectorBody(v: Values) {
  return {
    name: required(v, 'name'),
    description: required(v, 'description'),
    base_url: required(v, 'baseUrl'),
    connector_protocol: s(v.connectorProtocol),
    auth_type: s(v.authType),
    requires_certificate: b(v.requiresCertificate),
    ...optionalJson('auth_config', v.authConfig),
    ...optionalJson('user_auth_injection_config', v.userAuthInjectionConfig),
  }
}
function apiKeyBody(v: Values) {
  return {
    api_key_config: {
      headers: jsonArray(v.headers, 'Header credentials'),
      query_params: jsonArray(v.queryParams, 'Query parameter credentials'),
      body_params: jsonArray(v.bodyParams, 'Body parameter credentials'),
    },
  }
}
function oauthBody(v: Values) {
  return {
    oauth_config: {
      token_url: required(v, 'tokenUrl'),
      scopes_to_request: s(v.scopes)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      token_request_content_type: s(v.contentType),
      client_id: required(v, 'clientId'),
      client_secret: required(v, 'clientSecret'),
    },
  }
}
function certificateBody(v: Values) {
  return compact({
    client_certificate: required(v, 'clientCertificate'),
    client_key: required(v, 'clientKey'),
    ca_certificate: v.caCertificate,
  })
}
function toolBody(v: Values) {
  return {
    name: required(v, 'name'),
    description: required(v, 'description'),
    request_definition: {
      method: s(v.method),
      path: required(v, 'path'),
      path_parameters: jsonObject(v.pathParameters, 'Path parameters'),
      query_parameters: jsonObject(v.queryParameters, 'Query parameters'),
      headers: jsonObject(v.headers, 'Headers'),
      ...(s(v.body)
        ? { body: jsonObject(v.body, 'Request body definition') }
        : {}),
    },
    user_auth_required: b(v.userAuthRequired),
    ...optionalJson('user_auth_action_config', v.userAuthActionConfig),
    ...(s(v.transformationSpec)
      ? {
          transformation_spec: jsonObject(
            v.transformationSpec,
            'Transformation specification',
          ),
        }
      : {}),
  }
}
function encodedToolBody(v: Values) {
  const body = toolBody(v)
  return {
    ...body,
    request_definition: encodeRequestDefinition(
      record(body.request_definition),
    ),
  }
}
function encodeRequestDefinition(definition: Record<string, unknown>) {
  const body = record(definition.body)
  const params = record(body.params)
  if (!Object.keys(params).length) return definition
  return {
    ...definition,
    body: {
      ...body,
      params: Object.fromEntries(
        Object.entries(params).map(([name, node]) => [
          name,
          encodeBodyNode(record(node)),
        ]),
      ),
    },
  }
}
function encodeBodyNode(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const { items, properties, ...rest } = node
  return {
    ...rest,
    ...(properties === undefined
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(record(properties)).map(([name, child]) => [
              name,
              JSON.stringify(encodeBodyNode(record(child))),
            ]),
          ),
        }),
    ...(items === undefined
      ? {}
      : { items: JSON.stringify(encodeBodyNode(record(items))) }),
  }
}

function request(
  method: PlaygroundRequestExample['method'],
  path: string,
  body?: unknown,
  query?: Record<string, unknown>,
): PlaygroundRequestExample {
  return {
    method,
    path,
    headers: {
      'X-API-Version': '2.0.0',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body }),
    ...(query && Object.keys(query).length ? { query } : {}),
  }
}
function entityUrl(phone: string, ...parts: string[]) {
  return `https://api.facebook.com/${[phone || 'PHONE_NUMBER_ID', ...parts].map(encodeURIComponent).join('/')}`
}
function connectorUrl(phone: string, connectorId: string, ...parts: string[]) {
  return entityUrl(
    phone,
    'agent_connectors',
    connectorId || 'CONNECTOR_ID',
    ...parts,
  )
}
function toolUrl(phone: string, connectorId: string, ...parts: string[]) {
  return connectorUrl(phone, connectorId, 'tools', ...parts)
}
function exportPhoneNumberId(phone: string) {
  void phone
  return '{{Phone-Number-ID}}'
}
function exportConnectorId(values: Values) {
  const connectorId = s(values.connectorId).trim()
  return connectorId && connectorId !== 'CONNECTOR_ID'
    ? connectorId
    : '{{MBA-Connector-ID}}'
}
function exportToolId(value: Value | undefined) {
  const toolId = s(value).trim()
  return toolId && toolId !== 'TOOL_ID' ? toolId : '{{MBA-Tool-ID}}'
}
function s(value: Value | undefined) {
  return typeof value === 'string' ? value : ''
}
function b(value: Value | undefined) {
  return value === true
}
function required(values: Values, name: string) {
  const value = s(values[name]).trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function numberValue(value: Value | undefined) {
  const text = s(value)
  return text ? Number(text) : undefined
}
function optionalBoolean(value: Value | undefined) {
  return value === 'true' ? true : value === 'false' ? false : undefined
}
function compact(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  )
}
function parseJson(value: Value | undefined, label: string) {
  try {
    return JSON.parse(s(value)) as unknown
  } catch {
    throw new Error(`${label} must contain valid JSON.`)
  }
}
function jsonObject(value: Value | undefined, label: string) {
  const parsed = parseJson(value, label)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`${label} must be a JSON object.`)
  return parsed as Record<string, unknown>
}
function jsonArray(value: Value | undefined, label: string) {
  const parsed = parseJson(value, label)
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`)
  return parsed as unknown[]
}
function optionalJson(name: string, value: Value | undefined) {
  return s(value).trim() ? { [name]: jsonObject(value, name) } : {}
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function message(value: unknown) {
  return typeof record(value).message === 'string'
    ? String(record(value).message)
    : undefined
}
