import { Check, Clipboard, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select } from '../ui'

export interface PlaygroundRequestExample {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, unknown>
  body?: unknown
  contentType?:
    | 'application/json'
    | 'multipart/form-data'
    | 'application/x-www-form-urlencoded'
  auth?: 'bearer' | 'none'
  headers?: Record<string, string>
}

type CodeFormat = 'curl' | 'fetch' | 'hack'

export function PlaygroundRequestActions({
  request,
  defaultMethod,
  title,
  variableReplacements,
}: {
  request: PlaygroundRequestExample
  defaultMethod: 'GET' | 'POST' | 'PUT' | 'DELETE'
  title: string
  variableReplacements?: Record<string, string>
}) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<CodeFormat>('curl')
  const [copied, setCopied] = useState(false)
  const normalized = { ...request, method: request.method ?? defaultMethod }

  const copy = async () => {
    await navigator.clipboard.writeText(buildCode(format, normalized))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const downloadJson = (value: unknown, fileName: string) => {
    const contents = JSON.stringify(value, null, 2)
    const url = URL.createObjectURL(
      new Blob([contents], { type: 'application/json;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <h3 className="text-sm font-bold">{t('apiPlayground.codeExamples')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-full sm:w-44"
          aria-label={t('apiPlayground.codeFormat')}
          value={format}
          onChange={(event) =>
            setFormat(event.currentTarget.value as CodeFormat)
          }
        >
          <option value="curl">cURL</option>
          <option value="fetch">JavaScript fetch</option>
          <option value="hack">Meta Hack</option>
        </Select>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Clipboard className="size-4" aria-hidden />
          )}
          {copied ? t('apiPlayground.codeCopied') : t('apiPlayground.copyCode')}
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          onClick={() =>
            downloadJson(
              buildOpenApi(title, normalized),
              `${slugify(title)}.openapi.json`,
            )
          }
        >
          <Download className="size-4" aria-hidden />
          {t('apiPlayground.downloadOpenApi')}
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          onClick={() =>
            downloadJson(
              buildPostmanCollection(title, normalized, variableReplacements),
              `${slugify(title)}.postman_collection.json`,
            )
          }
        >
          <Download className="size-4" aria-hidden />
          {t('apiPlayground.downloadPostman')}
        </Button>
      </div>
    </div>
  )
}

function requestUrl(request: PlaygroundRequestExample) {
  const url = new URL(request.path, window.location.origin)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(
      key,
      Array.isArray(value) ? value.join(',') : String(value),
    )
  }
  return restoreVariables(url.toString())
}

function buildCode(format: CodeFormat, request: PlaygroundRequestExample) {
  const url = requestUrl(request)
  const method = request.method ?? 'GET'
  const body =
    request.body === undefined ? undefined : JSON.stringify(request.body)
  const multipart = request.contentType === 'multipart/form-data'
  const formEncoded =
    request.contentType === 'application/x-www-form-urlencoded'
  const headers = requestHeaders(
    request,
    body
      ? formEncoded
        ? 'application/x-www-form-urlencoded'
        : multipart
          ? undefined
          : 'application/json'
      : undefined,
  )
  const fetchHeaders = Object.keys(headers).length
    ? `\n  headers: ${JSON.stringify(headers)},`
    : ''
  if (format === 'fetch') {
    if (multipart) {
      const fields = multipartFields(request.body)
        .map(({ name, value, fileName }) =>
          fileName
            ? `form.append(${JSON.stringify(name)}, fileInput.files[0], ${JSON.stringify(fileName)});`
            : `form.append(${JSON.stringify(name)}, ${JSON.stringify(String(value ?? ''))});`,
        )
        .join('\n')
      return `const form = new FormData();\n${fields}\n\nconst response = await fetch(${JSON.stringify(url)}, {\n  method: '${method}',${fetchHeaders}\n  body: form,\n});\n\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst result = await response.json();`
    }
    if (formEncoded) {
      return `const form = new URLSearchParams(${JSON.stringify(request.body)});\n\nconst response = await fetch(${JSON.stringify(url)}, {\n  method: '${method}',${fetchHeaders}\n  body: form,\n});\n\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst result = await response.json();`
    }
    const options = [
      `method: '${method}'`,
      ...(Object.keys(headers).length
        ? [`headers: ${JSON.stringify(headers)}`]
        : []),
      ...(body ? [`body: ${JSON.stringify(body)}`] : []),
    ]
    return `const response = await fetch(${JSON.stringify(url)}, {\n  ${options.join(',\n  ')},\n});\n\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst result = await response.json();`
  }
  if (format === 'hack') {
    if (multipart) {
      const fields = multipartFields(request.body)
        .map(({ name, value, fileName }) =>
          fileName
            ? `  ${hackString(name)} => new CURLFile(${hackString(`/path/to/${fileName}`)}),`
            : `  ${hackString(name)} => ${hackString(String(value ?? ''))},`,
        )
        .join('\n')
      return `<?hh\n\n$handle = curl_init(${hackString(url)});\ncurl_setopt($handle, CURLOPT_CUSTOMREQUEST, ${hackString(method)});${hackHeaders(headers)}\ncurl_setopt($handle, CURLOPT_POSTFIELDS, dict[\n${fields}\n]);\ncurl_setopt($handle, CURLOPT_RETURNTRANSFER, true);\n$response = curl_exec($handle);\nif ($response === false) {\n  throw new Exception(curl_error($handle));\n}\ncurl_close($handle);`
    }
    if (formEncoded) {
      return `<?hh\n\n$handle = curl_init(${hackString(url)});\ncurl_setopt($handle, CURLOPT_CUSTOMREQUEST, ${hackString(method)});${hackHeaders(headers)}\ncurl_setopt($handle, CURLOPT_POSTFIELDS, http_build_query(${hackValue(request.body)}));\ncurl_setopt($handle, CURLOPT_RETURNTRANSFER, true);\n$response = curl_exec($handle);\nif ($response === false) {\n  throw new Exception(curl_error($handle));\n}\ncurl_close($handle);`
    }
    return `<?hh\n\n$handle = curl_init(${hackString(url)});\ncurl_setopt($handle, CURLOPT_CUSTOMREQUEST, ${hackString(method)});${hackHeaders(headers)}\ncurl_setopt($handle, CURLOPT_RETURNTRANSFER, true);${body ? `\ncurl_setopt($handle, CURLOPT_POSTFIELDS, ${hackString(body)});` : ''}\n$response = curl_exec($handle);\nif ($response === false) {\n  throw new Exception(curl_error($handle));\n}\ncurl_close($handle);`
  }
  const parts = [`curl --request ${method}`, `  --url ${shellQuote(url)}`]
  for (const [name, value] of Object.entries(headers))
    parts.push(`  --header ${shellQuote(`${name}: ${value}`)}`)
  if (body) {
    if (multipart) {
      for (const { name, value, fileName } of multipartFields(request.body)) {
        parts.push(
          fileName
            ? `  --form ${shellQuote(`${name}=@/path/to/${fileName}`)}`
            : `  --form ${shellQuote(`${name}=${String(value ?? '')}`)}`,
        )
      }
    } else if (formEncoded) {
      for (const [name, value] of Object.entries(objectValue(request.body))) {
        parts.push(
          `  --data-urlencode ${shellQuote(`${name}=${String(value)}`)}`,
        )
      }
    } else {
      parts.push(`  --data ${shellQuote(body)}`)
    }
  }
  return parts.join(' \\\n')
}

function buildOpenApi(title: string, request: PlaygroundRequestExample) {
  const method = (request.method ?? 'GET').toLowerCase()
  const requestAddress = new URL(request.path, window.location.origin)
  const parameters = [
    ...Object.entries(request.query ?? {})
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== '',
      )
      .map(([name, value]) => ({
        name,
        in: 'query',
        required: false,
        schema: inferSchema(value),
        example: value,
      })),
    ...Object.entries(request.headers ?? {}).map(([name, value]) => ({
      name,
      in: 'header',
      required: true,
      schema: { type: 'string' },
      example: value,
    })),
  ]
  return {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    servers: [{ url: requestAddress.origin }],
    paths: {
      [restoreVariables(requestAddress.pathname)]: {
        [method]: {
          summary: title,
          ...(request.auth === 'none'
            ? {}
            : { security: [{ bearerAuth: [] }] }),
          ...(parameters.length ? { parameters } : {}),
          ...(request.body === undefined
            ? {}
            : {
                requestBody: {
                  required: true,
                  content: {
                    [request.contentType ?? 'application/json']: {
                      schema:
                        request.contentType === 'multipart/form-data'
                          ? inferMultipartSchema(request.body)
                          : inferSchema(request.body),
                      example: request.body,
                    },
                  },
                },
              }),
          responses: { '200': { description: 'Successful response' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  }
}

export interface PlaygroundPostmanEntry {
  title: string
  request: PlaygroundRequestExample
  defaultMethod: 'GET' | 'POST' | 'PUT' | 'DELETE'
  variableReplacements?: Record<string, string>
}

export interface PlaygroundPostmanFolder {
  name: string
  entries?: PlaygroundPostmanEntry[]
  folders?: PlaygroundPostmanFolder[]
}

interface PostmanCollectionItem {
  name: string
  request?: unknown
  response?: unknown[]
  item?: PostmanCollectionItem[]
}

interface PostmanCollectionVariable {
  key: string
  value: string
  type: 'string'
}

interface PostmanCollection {
  info: {
    name: string
    schema: string
  }
  item: PostmanCollectionItem[]
  variable?: PostmanCollectionVariable[]
}

export function buildPostmanCollection(
  title: string,
  originalRequest: PlaygroundRequestExample,
  variableReplacements?: Record<string, string>,
): PostmanCollection {
  const request = normalizePostmanValue(
    replacePostmanValues(originalRequest, variableReplacements),
  ) as PlaygroundRequestExample
  const method = request.method ?? 'GET'
  const multipart = request.contentType === 'multipart/form-data'
  const formEncoded =
    request.contentType === 'application/x-www-form-urlencoded'
  const explicitHeaders = Object.entries(request.headers ?? {})
  const hasHeader = (name: string) =>
    explicitHeaders.some(([key]) => key.toLowerCase() === name.toLowerCase())
  const customAuthorization = hasHeader('authorization')
  const headers = [...explicitHeaders]
  if (request.body !== undefined && !multipart && !hasHeader('content-type')) {
    headers.push([
      'Content-Type',
      formEncoded ? 'application/x-www-form-urlencoded' : 'application/json',
    ])
  }
  const postmanRequest = {
    method,
    header: headers.map(([key, value]) => ({ key, value, type: 'text' })),
    auth:
      request.auth === 'none' || customAuthorization
        ? { type: 'noauth' }
        : {
            type: 'bearer',
            bearer: [
              {
                key: 'token',
                value: '{{User-Access-Token}}',
                type: 'string',
              },
            ],
          },
    url: { raw: requestUrl(request) },
    ...(request.body === undefined
      ? {}
      : { body: buildPostmanBody(request, multipart, formEncoded) }),
  }
  const variables = collectPostmanVariables(postmanRequest).map((key) => ({
    key,
    value: '',
    type: 'string' as const,
  }))
  return {
    info: {
      name: title,
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [{ name: title, request: postmanRequest, response: [] }],
    ...(variables.length ? { variable: variables } : {}),
  }
}

/**
 * Builds the all-requests download from the same single-request exporter used
 * by every operation card. Requests retain their complete raw URLs, which is
 * important because the playground spans more than one API origin.
 */
export function buildMergedPostmanCollection(
  title: string,
  folders: PlaygroundPostmanFolder[],
): PostmanCollection {
  const items = folders.map(buildPostmanFolder)
  const variables = collectPostmanVariables(items).map((key) => ({
    key,
    value: '',
    type: 'string' as const,
  }))
  return {
    info: {
      name: title,
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    ...(variables.length ? { variable: variables } : {}),
  }
}

function buildPostmanFolder(
  folder: PlaygroundPostmanFolder,
): PostmanCollectionItem {
  return {
    name: folder.name,
    item: [
      ...(folder.folders ?? []).map(buildPostmanFolder),
      ...(folder.entries ?? []).flatMap((entry) => {
        const collection = buildPostmanCollection(
          entry.title,
          {
            ...entry.request,
            method: entry.request.method ?? entry.defaultMethod,
          },
          entry.variableReplacements,
        )
        return collection.item
      }),
    ],
  }
}

function buildPostmanBody(
  request: PlaygroundRequestExample,
  multipart: boolean,
  formEncoded: boolean,
) {
  if (multipart)
    return {
      mode: 'formdata',
      formdata: multipartFields(request.body).map(
        ({ name, value, fileName, mediaType }) =>
          fileName
            ? {
                key: name,
                type: 'file',
                src: isVariable(fileName) ? fileName : '{{File-Path}}',
                ...(mediaType ? { contentType: mediaType } : {}),
              }
            : {
                key: name,
                type: 'text',
                value: escapePostmanPositionalPlaceholders(String(value ?? '')),
              },
      ),
    }
  if (formEncoded)
    return {
      mode: 'urlencoded',
      urlencoded: Object.entries(objectValue(request.body)).map(
        ([key, value]) => ({
          key,
          value: escapePostmanPositionalPlaceholders(String(value ?? '')),
          type: 'text',
        }),
      ),
    }
  return {
    mode: 'raw',
    raw: escapePostmanPositionalPlaceholders(
      JSON.stringify(request.body, null, 2),
    ),
    options: { raw: { language: 'json' } },
  }
}

function collectPostmanVariables(value: unknown) {
  const variables = new Set<string>()
  const visit = (current: unknown) => {
    if (typeof current === 'string') {
      for (const match of current.matchAll(
        /(?<!\\){{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g,
      )) {
        const name = match[1]
        if (name) variables.add(name)
      }
      return
    }
    if (Array.isArray(current)) {
      current.forEach(visit)
      return
    }
    if (current && typeof current === 'object')
      Object.values(current).forEach(visit)
  }
  visit(value)
  return [...variables].sort((left, right) => left.localeCompare(right))
}

function escapePostmanPositionalPlaceholders(value: string) {
  return value.replace(/(?<!\\){{\s*\d+\s*}}/g, '\\$&')
}

const postmanAliases: Record<string, string> = {
  PHONE_NUMBER_ID: 'Phone-Number-ID',
  WABA_ID: 'WABA-ID',
  BUSINESS_ID: 'Business-ID',
  APP_ID: 'App-ID',
  APP_SECRET: 'App-Secret',
  MEDIA_ID: 'Media-ID',
  FLOW_ID: 'Flow-ID',
  SOURCE_WABA_ID: 'Source-WABA-ID',
  TEMPLATE_ID: 'Template-ID',
  TEMPLATE_GROUP_ID: 'Template-Group-ID',
  TEMPLATE_NAME: 'Template-Name',
  GROUP_ID: 'Group-ID',
  QR_CODE: 'QR-Code',
}

function normalizePostmanValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let normalized = value.replace(/<([A-Z][A-Z0-9_-]*)>/g, (_, alias) => {
      const name =
        postmanAliases[alias] ??
        alias
          .toLowerCase()
          .split('_')
          .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('-')
      return `{{${name}}}`
    })
    for (const [alias, name] of Object.entries(postmanAliases))
      normalized = normalized.replace(
        new RegExp(`\\b${alias}\\b`, 'g'),
        `{{${name}}}`,
      )
    return normalized
  }
  if (Array.isArray(value)) return value.map(normalizePostmanValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        normalizePostmanValue(child),
      ]),
    )
  return value
}

function replacePostmanValues(
  value: unknown,
  replacements: Record<string, string> | undefined,
): unknown {
  if (typeof value === 'string') {
    let replaced = value
    for (const [literal, variable] of Object.entries(replacements ?? {}).sort(
      ([left], [right]) => right.length - left.length,
    )) {
      if (literal) replaced = replaced.split(literal).join(`{{${variable}}}`)
    }
    return replaced
  }
  if (Array.isArray(value))
    return value.map((child) => replacePostmanValues(child, replacements))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replacePostmanValues(child, replacements),
      ]),
    )
  return value
}

function isVariable(value: string) {
  return /^{{[A-Za-z0-9][A-Za-z0-9_-]*}}$/.test(value)
}

function multipartFields(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  return Object.entries(body).map(([name, value]) => ({
    name,
    value,
    fileName:
      value && typeof value === 'object' && 'name' in value
        ? String(value.name)
        : undefined,
    mediaType:
      value && typeof value === 'object' && 'type' in value
        ? String(value.type)
        : undefined,
  }))
}

function requestHeaders(
  request: PlaygroundRequestExample,
  contentType: string | undefined,
) {
  return {
    ...(request.auth === 'none'
      ? {}
      : { Authorization: 'Bearer {{User-Access-Token}}' }),
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...request.headers,
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function restoreVariables(value: string) {
  return value.replace(/%7B%7B([^%]+)%7D%7D/gi, '{{$1}}')
}

function hackValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `vec[${value.map(hackValue).join(', ')}]`
  if (typeof value === 'object')
    return `dict[${Object.entries(value)
      .map(([key, child]) => `${hackString(key)} => ${hackValue(child)}`)
      .join(', ')}]`
  if (typeof value === 'string') return hackString(value)
  return String(value)
}

function hackHeaders(headers: Record<string, string>) {
  const values = Object.entries(headers).map(([name, value]) =>
    hackString(`${name}: ${value}`),
  )
  return values.length
    ? `\ncurl_setopt($handle, CURLOPT_HTTPHEADER, vec[${values.join(', ')}]);`
    : ''
}

function inferMultipartSchema(body: unknown) {
  return {
    type: 'object',
    properties: Object.fromEntries(
      multipartFields(body).map(({ name, value, fileName }) => [
        name,
        fileName ? { type: 'string', format: 'binary' } : inferSchema(value),
      ]),
    ),
  }
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value))
    return {
      type: 'array',
      items: value.length ? inferSchema(value[0]) : {},
    }
  if (typeof value === 'object')
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, inferSchema(child)]),
      ),
    }
  if (typeof value === 'number')
    return { type: Number.isInteger(value) ? 'integer' : 'number' }
  return { type: typeof value }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function hackString(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$')}"`
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'api-operation'
  )
}
