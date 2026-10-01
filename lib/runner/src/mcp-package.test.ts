import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getRunnerMcpImportTargetName,
  runnerMcpPackageSchema,
} from './mcp-package.js'

describe('runner MCP package', () => {
  it('prefixes new imports exactly once', () => {
    assert.equal(
      getRunnerMcpImportTargetName('sales_tools', 'get_user'),
      'sales_tools__get_user',
    )
    assert.equal(
      getRunnerMcpImportTargetName('sales_tools', 'sales_tools__get_user'),
      'sales_tools__get_user',
    )
  })

  it('requires contiguous revision history ending at the current revision', () => {
    const base = {
      format: 'mba-mcp',
      version: 1,
      mcp: {
        name: 'sales_tools',
        description: null,
        functions: [
          {
            name: 'get_user',
            description: null,
            currentRevision: 1,
            revisions: [
              {
                revision: 1,
                code: '() => true',
                parameters: [],
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    }
    assert.equal(runnerMcpPackageSchema.parse(base).version, 1)
    assert.throws(() =>
      runnerMcpPackageSchema.parse({
        ...base,
        mcp: {
          ...base.mcp,
          functions: [
            {
              ...base.mcp.functions[0],
              currentRevision: 2,
            },
          ],
        },
      }),
    )
  })
})
