import { db, llmResponseRequests } from '@mba-desk/db'

export interface LlmRequestIdentity {
  safetyIdentifier: string
  userId?: string
  organizationId?: string | null
  sessionId?: string
}

export interface LlmAuditEntry {
  endpoint: 'hashbrown' | 'responses'
  requestedAt: Date
  completedAt: Date
  durationMs: number
  userId: string
  organizationId: string | null
  sessionId: string | null
  authenticationState: { authenticated: true; method: 'session' }
  model: string | null
  streamed: boolean
  providerStatus: number
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  tokenUsage: unknown
  input: unknown
  output: unknown
}

export type LlmAuditWriter = (entry: LlmAuditEntry) => Promise<void>

export async function persistLlmAuditEntry(entry: LlmAuditEntry) {
  await db.insert(llmResponseRequests).values(entry)
}

export async function safelyPersistLlmAuditEntry(
  audit: LlmAuditWriter,
  entry: LlmAuditEntry,
) {
  try {
    await audit(entry)
  } catch (error) {
    console.error('Could not persist LLM audit entry', error)
  }
}

export function extractTokenUsage(output: unknown) {
  const candidates = Array.isArray(output) ? [...output].reverse() : [output]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const record = candidate as Record<string, unknown>
    const response = asRecord(record.response) ?? record
    const usage = response.usage
    if (Array.isArray(usage)) return aggregateAgUiUsage(usage)
    const raw = asRecord(usage)
    if (!raw) continue
    return {
      raw,
      inputTokens: getInteger(raw.input_tokens ?? raw.inputTokens),
      outputTokens: getInteger(raw.output_tokens ?? raw.outputTokens),
      totalTokens: getInteger(raw.total_tokens ?? raw.totalTokens),
    }
  }
  return undefined
}

function aggregateAgUiUsage(usage: unknown[]) {
  const records = usage.flatMap((value) => {
    const record = asRecord(value)
    return record ? [record] : []
  })
  if (records.length === 0) return undefined
  return {
    raw: usage,
    inputTokens: sumIntegers(records, 'inputTokens'),
    outputTokens: sumIntegers(records, 'outputTokens'),
    totalTokens: sumIntegers(records, 'totalTokens'),
  }
}

function sumIntegers(records: Record<string, unknown>[], key: string) {
  const values = records.flatMap((record) => {
    const value = getInteger(record[key])
    return value === null ? [] : [value]
  })
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0)
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function getInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
