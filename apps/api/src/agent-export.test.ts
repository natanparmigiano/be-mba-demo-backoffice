import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createAgentExportArchive,
  knowledgeFileArchivePath,
} from './agent-export.js'

test('creates a ZIP32 archive with UTF-8 paths and stored file bodies', () => {
  const archive = createAgentExportArchive(
    [
      { path: 'agent.yaml', body: new TextEncoder().encode('format: agtx\n') },
      { path: 'files/001-café.txt', body: new TextEncoder().encode('hello') },
    ],
    new Date(2026, 0, 2, 3, 4, 6),
  )

  const entries = readStoredZipEntries(archive)
  assert.equal(
    new TextDecoder().decode(entries.get('agent.yaml')),
    'format: agtx\n',
  )
  assert.equal(
    new TextDecoder().decode(entries.get('files/001-café.txt')),
    'hello',
  )
  assert.equal(
    new DataView(archive.buffer).getUint32(archive.byteLength - 22, true),
    0x06054b50,
  )
})

test('creates safe, deterministic knowledge-file paths', () => {
  assert.equal(
    knowledgeFileArchivePath(1, '../quarter/Q4: report?.pdf'),
    'files/002-Q4_ report_.pdf',
  )
})

function readStoredZipEntries(archive: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>()
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  )
  const decoder = new TextDecoder()
  let offset = 0

  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const pathLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const pathStart = offset + 30
    const bodyStart = pathStart + pathLength + extraLength
    const path = decoder.decode(
      archive.subarray(pathStart, pathStart + pathLength),
    )
    entries.set(path, archive.slice(bodyStart, bodyStart + size))
    offset = bodyStart + size
  }

  return entries
}
