import { parseAgentYaml } from './agent-import-preview'

/**
 * The complete authoritative data model for an open Studio workspace.
 *
 * `manifest` is the only in-memory representation of agent.yaml. `entries`
 * contains package assets only (knowledge files and MCPX packages), avoiding a
 * second, stale copy of the manifest. UI selections and invalid editor drafts
 * intentionally live outside this serializable document.
 */
export interface StudioDocument {
  name: string
  manifest: Record<string, unknown>
  entries: Map<string, Uint8Array>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export async function openAgtx(file: File): Promise<StudioDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return deserializeAgtx(file.name, bytes)
}

export function deserializeAgtx(
  name: string,
  bytes: Uint8Array,
): StudioDocument {
  const entries = readZip(bytes)
  const manifestBytes = entries.get('agent.yaml')
  if (!manifestBytes) throw new TypeError('AGTX package is missing agent.yaml')
  const manifest = withoutProviderConnectorMetadata(
    asRecord(parseAgentYaml(decoder.decode(manifestBytes))),
  )
  if (manifest.format !== 'agtx' || manifest.version !== 1)
    throw new TypeError('Unsupported AGTX format or version')
  entries.delete('agent.yaml')
  return { name, manifest, entries }
}

export function newAgtx(): StudioDocument {
  const manifest = {
    format: 'agtx',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      channel: {
        type: 'whatsapp',
        phoneNumber: '',
        phoneNumberId: '',
        wabaId: '',
        businessId: '',
        appId: '',
      },
    },
    security: {
      connectorCredentialsIncluded: false,
      connectorCertificatesIncluded: false,
      knowledgeFiles: { total: 0, included: 0, missing: 0 },
    },
    importRequirements: {
      requestConnectorCredentials: false,
      requestConnectorCertificates: false,
      requestMissingKnowledgeFiles: false,
    },
    agent: {
      settings: {
        agentId: 'new-agent',
        rolloutEnabled: false,
        audience: 'EVERYONE',
        handoff: { enabled: false, messageSelection: 'DEFAULT', message: '' },
        neverSayPhrases: [],
      },
      allowlist: [],
      businessInfo: {
        businessDescription: '',
        paymentMethod: '',
        purchaseInfo: '',
        deliveryAndShipping: '',
        returnPolicy: '',
        contactEmail: '',
        hoursOfOperation: '',
        address: '',
      },
      qrCodes: [],
      components: { prompts: [], commands: [] },
      skills: [],
      knowledge: { faqs: [], websites: [], files: [] },
      connectors: [],
    },
  }
  return { name: 'new-agent.agtx', manifest, entries: new Map() }
}

export function serializeAgtx(studioDocument: StudioDocument): Uint8Array {
  const portableManifest = withoutProviderConnectorMetadata(
    studioDocument.manifest,
  )
  const entries = new Map<string, Uint8Array>([
    ['agent.yaml', encoder.encode(stringifyAgentYaml(portableManifest))],
    ...studioDocument.entries,
  ])
  return writeZip(entries)
}

const providerConnectorFields = new Set([
  'hasAuthConfiguration',
  'hasCertificate',
  'connectionStatus',
  'connectionError',
  'mcpToolSync',
])

/** Removes transient provider observations from the portable package model. */
function withoutProviderConnectorMetadata(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const copy = structuredClone(manifest)
  const agent = copy.agent
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return copy
  const connectors = (agent as Record<string, unknown>).connectors
  if (!Array.isArray(connectors)) return copy
  ;(agent as Record<string, unknown>).connectors = (
    connectors as unknown[]
  ).map((connector) => {
    if (!connector || typeof connector !== 'object' || Array.isArray(connector))
      return connector
    return Object.fromEntries(
      Object.entries(connector as Record<string, unknown>).filter(
        ([field]) => !providerConnectorFields.has(field),
      ),
    )
  })
  return copy
}

export function downloadAgtx(studioDocument: StudioDocument): void {
  const archive = serializeAgtx(studioDocument)
  const blob = new Blob([archive.buffer as ArrayBuffer], {
    type: 'application/vnd.mba.agent+zip',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = studioDocument.name.toLowerCase().endsWith('.agtx')
    ? studioDocument.name
    : `${studioDocument.name}.agtx`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function stringifyAgentYaml(value: unknown, depth = 0): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value
      .map((item) => {
        const rendered = stringifyAgentYaml(item, depth + 1)
        return isScalar(item)
          ? `${'  '.repeat(depth)}- ${rendered}`
          : `${'  '.repeat(depth)}-\n${rendered}`
      })
      .join('\n')
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (!entries.length) return '{}'
    return entries
      .map(([key, item]) => {
        const rendered = stringifyAgentYaml(item, depth + 1)
        const safeKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)
          ? key
          : JSON.stringify(key)
        return isScalar(item)
          ? `${'  '.repeat(depth)}${safeKey}: ${rendered}`
          : `${'  '.repeat(depth)}${safeKey}:\n${rendered}`
      })
      .join('\n')
  }
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (value === undefined) return 'null'
  throw new TypeError('Unsupported YAML value')
}

/** Parses an MCPX document, including JavaScript stored in YAML literal blocks. */
export function parseMcpxYaml(source: string): unknown {
  const lines = source.split(/\r?\n/)
  const normalized: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = /^( *)([^:]+): *\|([+-]?) *$/.exec(line)
    if (!match) {
      normalized.push(line)
      continue
    }
    const parentIndent = match[1]?.length ?? 0
    const contentLines: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? ''
      const indentation = candidate.length - candidate.trimStart().length
      if (candidate.trim() && indentation <= parentIndent) break
      contentLines.push(candidate)
      cursor += 1
    }
    const indents = contentLines
      .filter((contentLine) => contentLine.trim())
      .map((contentLine) => contentLine.length - contentLine.trimStart().length)
    const contentIndent = indents.length ? Math.min(...indents) : 0
    let value = contentLines
      .map((contentLine) =>
        contentLine.trim() ? contentLine.slice(contentIndent) : '',
      )
      .join('\n')
    if (match[3] !== '-') value += '\n'
    normalized.push(`${match[1]}${match[2]}: ${JSON.stringify(value)}`)
    index = cursor - 1
  }
  return parseAgentYaml(normalized.join('\n'))
}

function isScalar(value: unknown) {
  return (
    value === null ||
    typeof value !== 'object' ||
    (Array.isArray(value) && value.length === 0) ||
    (!!value && !Array.isArray(value) && Object.keys(value).length === 0)
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('AGTX manifest must be an object')
  return value as Record<string, unknown>
}

function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    if (view.getUint32(0, true) !== 0x04034b50) break
    const flags = view.getUint16(6, true)
    const method = view.getUint16(8, true)
    const size = view.getUint32(18, true)
    const uncompressed = view.getUint32(22, true)
    const nameLength = view.getUint16(26, true)
    const extraLength = view.getUint16(28, true)
    if (method !== 0 || flags & 0x0008 || size !== uncompressed)
      throw new TypeError('AGTX package uses an unsupported ZIP feature')
    const start = offset + 30
    const name = decoder.decode(bytes.slice(start, start + nameLength))
    if (
      !name ||
      name.includes('\\') ||
      name.split('/').some((part) => !part || part === '..')
    )
      throw new TypeError('AGTX entry path is unsafe')
    const bodyStart = start + nameLength + extraLength
    const body = bytes.slice(bodyStart, bodyStart + size)
    if (body.length !== size || crc32(body) !== view.getUint32(14, true))
      throw new TypeError(`AGTX entry is invalid: ${name}`)
    entries.set(name, body)
    offset = bodyStart + size
  }
  return entries
}

function writeZip(entries: Map<string, Uint8Array>): Uint8Array {
  const files = [...entries].map(([name, body]) => ({
    name,
    nameBytes: encoder.encode(name),
    body,
    crc: crc32(body),
    offset: 0,
  }))
  let localSize = 0
  for (const file of files) {
    file.offset = localSize
    localSize += 30 + file.nameBytes.length + file.body.length
  }
  const centralSize = files.reduce(
    (sum, file) => sum + 46 + file.nameBytes.length,
    0,
  )
  const output = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(output.buffer)
  let position = 0
  for (const file of files) {
    view.setUint32(position, 0x04034b50, true)
    view.setUint16(position + 4, 20, true)
    view.setUint16(position + 6, 0x0800, true)
    view.setUint32(position + 14, file.crc, true)
    view.setUint32(position + 18, file.body.length, true)
    view.setUint32(position + 22, file.body.length, true)
    view.setUint16(position + 26, file.nameBytes.length, true)
    output.set(file.nameBytes, position + 30)
    output.set(file.body, position + 30 + file.nameBytes.length)
    position += 30 + file.nameBytes.length + file.body.length
  }
  const centralOffset = position
  for (const file of files) {
    view.setUint32(position, 0x02014b50, true)
    view.setUint16(position + 4, 20, true)
    view.setUint16(position + 6, 20, true)
    view.setUint16(position + 8, 0x0800, true)
    view.setUint32(position + 16, file.crc, true)
    view.setUint32(position + 20, file.body.length, true)
    view.setUint32(position + 24, file.body.length, true)
    view.setUint16(position + 28, file.nameBytes.length, true)
    view.setUint32(position + 42, file.offset, true)
    output.set(file.nameBytes, position + 46)
    position += 46 + file.nameBytes.length
  }
  view.setUint32(position, 0x06054b50, true)
  view.setUint16(position + 8, files.length, true)
  view.setUint16(position + 10, files.length, true)
  view.setUint32(position + 12, centralSize, true)
  view.setUint32(position + 16, centralOffset, true)
  return output
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
