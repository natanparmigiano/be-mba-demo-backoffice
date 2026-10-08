export interface AgentExportArchiveEntry {
  body: Uint8Array
  path: string
}

interface CentralDirectoryEntry {
  crc: number
  offset: number
  path: Uint8Array
  size: number
}

const encoder = new TextEncoder()

export function createAgentExportArchive(
  entries: readonly AgentExportArchiveEntry[],
  modifiedAt = new Date(),
): Uint8Array {
  if (entries.length > 0xffff) {
    throw new RangeError('AGTX contains too many files for ZIP32')
  }
  const localParts: Uint8Array[] = []
  const centralEntries: CentralDirectoryEntry[] = []
  const dos = toDosDateTime(modifiedAt)
  let offset = 0

  for (const entry of entries) {
    const path = encoder.encode(entry.path)
    if (path.byteLength === 0 || path.byteLength > 0xffff) {
      throw new RangeError('Archive entry path has an invalid length')
    }
    if (entry.body.byteLength > 0xffffffff) {
      throw new RangeError('Archive entry is too large for AGTX ZIP32')
    }

    const crc = crc32(entry.body)
    const header = new Uint8Array(30 + path.byteLength)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x0800, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, dos.time, true)
    view.setUint16(12, dos.date, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, entry.body.byteLength, true)
    view.setUint32(22, entry.body.byteLength, true)
    view.setUint16(26, path.byteLength, true)
    header.set(path, 30)

    localParts.push(header, entry.body)
    centralEntries.push({
      crc,
      offset,
      path,
      size: entry.body.byteLength,
    })
    offset += header.byteLength + entry.body.byteLength
    if (offset > 0xffffffff) {
      throw new RangeError('AGTX is too large for ZIP32')
    }
  }

  const centralOffset = offset
  const centralParts = centralEntries.map((entry) => {
    const header = new Uint8Array(46 + entry.path.byteLength)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0x0800, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, dos.time, true)
    view.setUint16(14, dos.date, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.size, true)
    view.setUint32(24, entry.size, true)
    view.setUint16(28, entry.path.byteLength, true)
    view.setUint32(42, entry.offset, true)
    header.set(entry.path, 46)
    return header
  })
  const centralSize = centralParts.reduce(
    (size, part) => size + part.byteLength,
    0,
  )
  if (centralSize > 0xffffffff) {
    throw new RangeError('AGTX directory is too large for ZIP32')
  }
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, centralOffset, true)

  return concatenate([...localParts, ...centralParts, end])
}

export function knowledgeFileArchivePath(
  position: number,
  fileName: string,
): string {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? ''
  const printableName = Array.from(baseName, (character) => character)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code >= 32 && code !== 127
    })
    .join('')
  const safeName = printableName
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._() -]/gu, '_')
    .trim()
    .slice(0, 180)
  return `files/${String(position + 1).padStart(3, '0')}-${safeName || 'knowledge-file'}`
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.byteLength, 0),
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toDosDateTime(value: Date): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, value.getFullYear()))
  return {
    date:
      ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      Math.floor(value.getSeconds() / 2),
  }
}
