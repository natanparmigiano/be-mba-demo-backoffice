import { crc32 } from './agent-export.js'
import { parseYaml } from './yaml.js'

const maximumArchiveEntries = 1_000
const maximumArchiveBytes = 512 * 1024 * 1024

export interface ParsedAgentArchive {
  entries: ReadonlyMap<string, Uint8Array>
  manifest: unknown
}

export function parseAgentArchive(body: Uint8Array): ParsedAgentArchive {
  if (body.byteLength === 0 || body.byteLength > maximumArchiveBytes) {
    throw new TypeError('AGTX package has an invalid size')
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const entries = new Map<string, Uint8Array>()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let offset = 0

  while (
    offset + 4 <= body.byteLength &&
    view.getUint32(offset, true) === 0x04034b50
  ) {
    if (
      entries.size >= maximumArchiveEntries ||
      offset + 30 > body.byteLength
    ) {
      throw new TypeError('AGTX package contains too many or invalid entries')
    }
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const expectedCrc = view.getUint32(offset + 14, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const size = view.getUint32(offset + 22, true)
    const pathLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    if (
      method !== 0 ||
      (flags & 0x0008) !== 0 ||
      compressedSize !== size ||
      pathLength === 0
    ) {
      throw new TypeError('AGTX package uses an unsupported ZIP feature')
    }
    const pathStart = offset + 30
    const dataStart = pathStart + pathLength + extraLength
    const dataEnd = dataStart + size
    if (dataEnd > body.byteLength)
      throw new TypeError('AGTX entry is truncated')
    const path = decoder.decode(
      body.subarray(pathStart, pathStart + pathLength),
    )
    validateEntryPath(path)
    if (entries.has(path)) throw new TypeError(`Duplicate AGTX entry: ${path}`)
    const entryBody = body.slice(dataStart, dataEnd)
    if (crc32(entryBody) !== expectedCrc) {
      throw new TypeError(`AGTX entry failed its checksum: ${path}`)
    }
    entries.set(path, entryBody)
    offset = dataEnd
  }

  if (
    entries.size === 0 ||
    offset + 4 > body.byteLength ||
    view.getUint32(offset, true) !== 0x02014b50
  ) {
    throw new TypeError('AGTX central directory is missing')
  }
  const manifestBody = entries.get('agent.yaml')
  if (!manifestBody) throw new TypeError('AGTX package is missing agent.yaml')
  const manifestText = decoder.decode(manifestBody)
  if (manifestText.length > 5 * 1024 * 1024) {
    throw new TypeError('AGTX manifest is too large')
  }
  return { entries, manifest: parseYaml(manifestText) }
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
