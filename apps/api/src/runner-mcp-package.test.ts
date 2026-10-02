import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { Script } from 'node:vm'
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

  it('keeps the Dunder Mifflin mock results tied to the caller context', async () => {
    const sample = parseRunnerMcpPackageYaml(
      await readFile(
        new URL(
          '../../../docs/mcpx/sample_dunder_mifflin.mcpx',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const invoke = (name: string, parameters: Record<string, unknown>) => {
      const fn = sample.mcp.functions.find(
        (candidate) => candidate.name === name,
      )
      assert.ok(fn)
      const executable = new Script(
        `(${fn.revisions.at(-1)!.code})`,
      ).runInNewContext() as (parameters: Record<string, unknown>) => unknown
      return executable(parameters)
    }

    assert.deepEqual(
      JSON.parse(
        JSON.stringify(
          invoke('search_paper_catalog', {
            query: 'recycled duplex paper',
            limit: 1,
          }),
        ),
      ),
      {
        query: 'recycled duplex paper',
        appliedFilters: {
          size: null,
          weight: null,
          recycledContent: null,
        },
        count: 1,
        products: [
          {
            sku: 'DM-COPY-20',
            name: 'Dunder Mifflin Multipurpose Copy Paper',
            size: '8.5 x 11 in',
            weight: '20 lb',
            brightness: 92,
            recycledContentPercent: 30,
            unit: '10-ream case',
            availability: 'in_stock',
          },
        ],
      },
    )

    const quote = invoke('create_paper_quote', {
      organization_name: 'Acme, Inc.',
      contact_name: 'Ada',
      delivery_postal_code: '18503',
      items: [{ sku: 'DM-COPY-20', quantity: 2 }],
    }) as { customer: { organizationName: string }; lineItems: unknown[] }
    assert.equal(quote.customer.organizationName, 'Acme, Inc.')
    assert.equal(quote.lineItems.length, 1)

    const contextualCases = [
      [
        'check_delivery_status',
        { order_number: 'ORDER-7' },
        'orderNumber',
        'ORDER-7',
      ],
      [
        'create_delivery_issue',
        {
          order_number: 'ORDER-7',
          issue_type: 'shortage',
          customer_contact: 'Ada',
        },
        'issueType',
        'shortage',
      ],
      [
        'get_customer_account',
        { account_number: 'ACCOUNT-9' },
        'accountNumber',
        'ACCOUNT-9',
      ],
      [
        'get_order_for_reorder',
        { order_number: 'ORDER-8', account_number: 'ACCOUNT-9' },
        'sourceOrderNumber',
        'ORDER-8',
      ],
    ] as const
    for (const [name, parameters, field, expected] of contextualCases) {
      assert.equal(
        (invoke(name, parameters) as Record<string, unknown>)[field],
        expected,
      )
    }
  })
})
