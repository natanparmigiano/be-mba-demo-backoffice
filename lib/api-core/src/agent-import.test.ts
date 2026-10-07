import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentExportArchive } from './agent-export.js'
import { parseAgentArchive } from './agent-import.js'
import { stringifyYaml } from './yaml.js'

test('reads an exported AGTX package and validates entry checksums', () => {
  const archive = createAgentExportArchive([
    {
      path: 'agent.yaml',
      body: new TextEncoder().encode(
        stringifyYaml({ format: 'agtx', version: 1, agent: {} }),
      ),
    },
    { path: 'files/001-guide.txt', body: new TextEncoder().encode('guide') },
  ])
  const parsed = parseAgentArchive(archive)
  assert.deepEqual(parsed.manifest, { format: 'agtx', version: 1, agent: {} })
  assert.equal(
    new TextDecoder().decode(parsed.entries.get('files/001-guide.txt')),
    'guide',
  )

  const corrupt = archive.slice()
  corrupt[50] = (corrupt[50] ?? 0) ^ 1
  assert.throws(() => parseAgentArchive(corrupt), /checksum/)
})

test('rejects unsafe paths and packages without agent.yaml', () => {
  assert.throws(() =>
    parseAgentArchive(
      createAgentExportArchive([
        { path: '../agent.yaml', body: new TextEncoder().encode('{}') },
      ]),
    ),
  )
  assert.throws(() =>
    parseAgentArchive(
      createAgentExportArchive([
        { path: 'files/readme.txt', body: new TextEncoder().encode('x') },
      ]),
    ),
  )
})
