import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { validateRunnerFunctionCode } from '@mba-demo/runner'
import {
  parseRunnerMcpPackageYaml,
  stringifyRunnerMcpPackageYaml,
} from './runner-mcp-package.js'

const imported = {
  format: 'mba-mcp' as const,
  version: 1 as const,
  mcp: {
    name: 'sales_tools',
    description: 'Sales tools',
    functions: [
      {
        name: 'get_user',
        description: null,
        currentRevision: 2,
        revisions: [
          {
            revision: 1,
            code: `() => 'one'`,
            parameters: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            revision: 2,
            code: `() => 'two'`,
            parameters: [],
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    ],
  },
}

describe('runner MCPX packages', () => {
  it('round-trips every exported revision through the safe YAML subset', () => {
    assert.deepEqual(
      parseRunnerMcpPackageYaml(stringifyRunnerMcpPackageYaml(imported)),
      imported,
    )
  })

  it('rejects malformed histories and unsafe YAML features', () => {
    assert.throws(() =>
      parseRunnerMcpPackageYaml(
        stringifyRunnerMcpPackageYaml({
          ...imported,
          mcp: {
            ...imported.mcp,
            functions: [{ ...imported.mcp.functions[0]!, currentRevision: 3 }],
          },
        }),
      ),
    )
    assert.throws(() => parseRunnerMcpPackageYaml('format: *alias\n'))
  })

  it('keeps the documented Dunder Mifflin MCPX sample importable', async () => {
    const sample = parseRunnerMcpPackageYaml(
      await readFile(
        new URL(
          '../../../docs/mcpx/sample_dunder_mifflin.mcpx',
          import.meta.url,
        ),
        'utf8',
      ),
    )

    assert.equal(sample.mcp.name, 'dunder_mifflin_mcp')
    assert.deepEqual(
      sample.mcp.functions.map(({ name }) => name),
      [
        'search_paper_catalog',
        'create_paper_quote',
        'check_delivery_status',
        'create_delivery_issue',
        'get_customer_account',
        'get_order_for_reorder',
      ],
    )
    for (const fn of sample.mcp.functions) {
      for (const revision of fn.revisions) {
        validateRunnerFunctionCode(revision.code)
      }
    }
  })
})
