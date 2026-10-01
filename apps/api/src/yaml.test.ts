import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseYaml, stringifyYaml } from './yaml.js'

describe('YAML serialization', () => {
  it('serializes nested JSON-compatible agent data as readable YAML', () => {
    assert.equal(
      stringifyYaml({
        format: 'agtx',
        version: 1,
        enabled: true,
        skills: [
          { title: 'order-status', instructions: 'Check: order\nThen reply.' },
        ],
        files: [],
        optional: null,
      }),
      [
        'format: "agtx"',
        'version: 1',
        'enabled: true',
        'skills:',
        '  -',
        '    title: "order-status"',
        '    instructions: "Check: order\\nThen reply."',
        'files: []',
        'optional: null',
        '',
      ].join('\n'),
    )
  })

  it('rejects values that YAML export cannot safely represent', () => {
    assert.throws(() => stringifyYaml({ value: Symbol('secret') }), TypeError)
  })

  it('parses the exact safe YAML subset emitted for AGTX', () => {
    const value = {
      format: 'agtx',
      version: 1,
      agent: {
        enabled: true,
        files: [{ name: 'guide.pdf', path: null }, { name: 'notes.txt' }],
        empty: [],
      },
    }
    assert.deepEqual(parseYaml(stringifyYaml(value)), value)
  })

  it('rejects YAML tags, aliases, and unquoted free-form scalars', () => {
    assert.throws(() => parseYaml('format: !!js/function "bad"\n'))
    assert.throws(() => parseYaml('format: *alias\n'))
    assert.throws(() => parseYaml('format: agtx\n'))
  })
})
