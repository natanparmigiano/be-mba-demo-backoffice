export interface AgentImportPreview {
  allowlist: Array<Record<string, unknown>>
  businessInfo: Record<string, unknown>
  connectors: Array<Record<string, unknown>>
  files: Array<Record<string, unknown>>
  format: string
  settings: Record<string, unknown>
  skills: Array<Record<string, unknown>>
  faqs: Array<Record<string, unknown>>
  version: number
  websites: Array<Record<string, unknown>>
}

const maximumArchiveBytes = 512 * 1024 * 1024
const maximumArchiveEntries = 1_000
const maximumManifestBytes = 5 * 1024 * 1024
const decoder = new TextDecoder('utf-8', { fatal: true })

export async function readAgentImportPreview(
  file: File,
): Promise<AgentImportPreview> {
  if (file.size === 0 || file.size > maximumArchiveBytes) {
    throw new TypeError('AGTX package has an invalid size')
  }

  let offset = 0
  for (let entry = 0; entry < maximumArchiveEntries; entry += 1) {
    const header = await readSlice(file, offset, offset + 30)
    if (header.byteLength < 4) break
    const view = new DataView(
      header.buffer,
      header.byteOffset,
      header.byteLength,
    )
    const signature = view.getUint32(0, true)
    if (signature === 0x02014b50) break
    if (signature !== 0x04034b50 || header.byteLength < 30) {
      throw new TypeError('AGTX package contains an invalid ZIP entry')
    }

    const flags = view.getUint16(6, true)
    const method = view.getUint16(8, true)
    const expectedCrc = view.getUint32(14, true)
    const compressedSize = view.getUint32(18, true)
    const size = view.getUint32(22, true)
    const pathLength = view.getUint16(26, true)
    const extraLength = view.getUint16(28, true)
    if (
      method !== 0 ||
      (flags & 0x0008) !== 0 ||
      compressedSize !== size ||
      pathLength === 0
    ) {
      throw new TypeError('AGTX package uses an unsupported ZIP feature')
    }

    const pathBytes = await readSlice(
      file,
      offset + 30,
      offset + 30 + pathLength,
    )
    if (pathBytes.byteLength !== pathLength) {
      throw new TypeError('AGTX entry path is truncated')
    }
    const path = decoder.decode(pathBytes)
    validateEntryPath(path)
    const bodyStart = offset + 30 + pathLength + extraLength
    const bodyEnd = bodyStart + size
    if (bodyEnd > file.size) throw new TypeError('AGTX entry is truncated')

    if (path === 'agent.yaml') {
      if (size > maximumManifestBytes) {
        throw new TypeError('AGTX manifest is too large')
      }
      const body = await readSlice(file, bodyStart, bodyEnd)
      if (crc32(body) !== expectedCrc) {
        throw new TypeError('AGTX manifest failed its checksum')
      }
      return toAgentImportPreview(parseYaml(decoder.decode(body)))
    }
    offset = bodyEnd
  }

  throw new TypeError('AGTX package is missing agent.yaml')
}

async function readSlice(file: File, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

function toAgentImportPreview(value: unknown): AgentImportPreview {
  const root = record(value, 'manifest')
  if (root.format !== 'agtx' || root.version !== 1) {
    throw new TypeError('Unsupported AGTX format or version')
  }
  const agent = record(root.agent, 'agent')
  if ('evaluations' in agent) {
    throw new TypeError('AGTX evaluation cases are no longer supported')
  }
  const knowledge = record(agent.knowledge, 'agent.knowledge')
  return {
    format: root.format,
    version: root.version,
    settings: record(agent.settings, 'agent.settings'),
    allowlist: recordArray(agent.allowlist, 'agent.allowlist'),
    businessInfo: record(agent.businessInfo, 'agent.businessInfo'),
    skills: recordArray(agent.skills, 'agent.skills'),
    faqs: recordArray(knowledge.faqs, 'agent.knowledge.faqs'),
    websites: recordArray(knowledge.websites, 'agent.knowledge.websites'),
    files: recordArray(knowledge.files, 'agent.knowledge.files'),
    connectors: recordArray(agent.connectors, 'agent.connectors'),
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function recordArray(
  value: unknown,
  name: string,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
  return value.map((item, index) => record(item, `${name}.${index}`))
}

function validateEntryPath(path: string): void {
  const segments = path.split('/')
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new TypeError('AGTX entry path is unsafe')
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function parseYaml(value: string): unknown {
  const lines = value
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      if (line.includes('\t')) throw new TypeError('YAML contains a tab')
      const spaces = line.length - line.trimStart().length
      if (spaces % 2 !== 0) throw new TypeError('YAML indentation is invalid')
      return { content: line.slice(spaces), depth: spaces / 2 }
    })
  if (lines.length === 0) throw new TypeError('YAML document is empty')
  let position = 0

  const readBlock = (depth: number): unknown => {
    if (depth > 100) throw new TypeError('YAML nesting is too deep')
    const first = lines[position]
    if (!first || first.depth !== depth)
      throw new TypeError('YAML nesting is invalid')
    const isArray = first.content === '-' || first.content.startsWith('- ')
    const result: unknown[] | Record<string, unknown> = isArray ? [] : {}

    while (position < lines.length) {
      const line = lines[position]
      if (!line || line.depth < depth) break
      if (line.depth > depth) throw new TypeError('YAML nesting is invalid')
      if (isArray) {
        if (line.content !== '-' && !line.content.startsWith('- ')) {
          throw new TypeError('YAML mixes arrays and objects')
        }
        position += 1
        const scalar = line.content.slice(1).trimStart()
        ;(result as unknown[]).push(
          scalar ? readScalar(scalar) : readBlock(depth + 1),
        )
        continue
      }
      const separator = line.content.indexOf(':')
      if (separator < 1) throw new TypeError('YAML object entry is invalid')
      const rawKey = line.content.slice(0, separator)
      const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(rawKey)
        ? rawKey
        : parseJsonString(rawKey)
      if (Object.hasOwn(result, key))
        throw new TypeError('YAML key is duplicated')
      const scalar = line.content.slice(separator + 1).trimStart()
      position += 1
      ;(result as Record<string, unknown>)[key] = scalar
        ? readScalar(scalar)
        : readBlock(depth + 1)
    }
    return result
  }

  const parsed = readBlock(0)
  if (position !== lines.length)
    throw new TypeError('YAML was not fully parsed')
  return parsed
}

function readScalar(value: string): unknown {
  if (value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === '[]') return []
  if (value === '{}') return {}
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const number = Number(value)
    if (!Number.isFinite(number)) throw new TypeError('YAML number is invalid')
    return number
  }
  return parseJsonString(value)
}

function parseJsonString(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'string') return parsed
  } catch {
    // AGTX accepts only its deterministic YAML subset.
  }
  throw new TypeError('YAML scalar is outside the supported AGTX subset')
}
