export function stringifyYaml(value: unknown): string {
  return `${writeValue(value, 0)}\n`
}

export function parseYaml(value: string): unknown {
  const lines = value
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      if (line.includes('\t')) {
        throw new TypeError(`YAML line ${index + 1} contains a tab`)
      }
      const spaces = line.length - line.trimStart().length
      if (spaces % 2 !== 0) {
        throw new TypeError(`YAML line ${index + 1} has invalid indentation`)
      }
      return { content: line.slice(spaces), depth: spaces / 2 }
    })

  if (lines.length === 0) throw new TypeError('YAML document is empty')
  let position = 0

  const readBlock = (depth: number): unknown => {
    if (depth > 100) throw new TypeError('YAML nesting is too deep')
    const first = lines[position]
    if (!first || first.depth !== depth) {
      throw new TypeError('YAML contains invalid nesting')
    }
    const isArray = first.content === '-' || first.content.startsWith('- ')
    const result: unknown[] | Record<string, unknown> = isArray ? [] : {}

    while (position < lines.length) {
      const line = lines[position]
      if (!line || line.depth < depth) break
      if (line.depth > depth)
        throw new TypeError('YAML contains invalid nesting')

      if (isArray) {
        if (line.content !== '-' && !line.content.startsWith('- ')) {
          throw new TypeError('YAML mixes arrays and objects')
        }
        position += 1
        const scalar = line.content.slice(1).trimStart()
        ;(result as unknown[]).push(
          scalar.length > 0 ? readScalar(scalar) : readBlock(depth + 1),
        )
        continue
      }

      const separator = line.content.indexOf(':')
      if (separator < 1) throw new TypeError('YAML object entry is invalid')
      const rawKey = line.content.slice(0, separator)
      const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(rawKey)
        ? rawKey
        : parseJsonString(rawKey)
      if (Object.hasOwn(result, key)) {
        throw new TypeError(`YAML contains duplicate key: ${key}`)
      }
      const scalar = line.content.slice(separator + 1).trimStart()
      position += 1
      ;(result as Record<string, unknown>)[key] =
        scalar.length > 0 ? readScalar(scalar) : readBlock(depth + 1)
    }

    return result
  }

  const parsed = readBlock(0)
  if (position !== lines.length)
    throw new TypeError('YAML was not fully parsed')
  return parsed
}

function writeValue(value: unknown, depth: number): string {
  if (Array.isArray(value)) return writeArray(value, depth)
  if (isRecord(value)) return writeObject(value, depth)
  return writeScalar(value)
}

function writeArray(values: unknown[], depth: number): string {
  if (!values.length) return '[]'
  const indentation = indent(depth)
  return values
    .map((value) => {
      if (isContainer(value) && containerSize(value) > 0) {
        return `${indentation}-\n${writeValue(value, depth + 1)}`
      }
      return `${indentation}- ${writeValue(value, depth + 1)}`
    })
    .join('\n')
}

function writeObject(value: Record<string, unknown>, depth: number): string {
  const entries = Object.entries(value).filter(
    ([, child]) => child !== undefined,
  )
  if (!entries.length) return '{}'
  const indentation = indent(depth)
  return entries
    .map(([key, child]) => {
      const encodedKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)
        ? key
        : JSON.stringify(key)
      if (isContainer(child) && containerSize(child) > 0) {
        return `${indentation}${encodedKey}:\n${writeValue(child, depth + 1)}`
      }
      return `${indentation}${encodedKey}: ${writeValue(child, depth + 1)}`
    })
    .join('\n')
}

function writeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  throw new TypeError('YAML export supports only JSON-compatible values')
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
    // AGTX deliberately supports only the serializer's safe YAML subset.
  }
  throw new TypeError('YAML scalar is outside the supported AGTX subset')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isContainer(
  value: unknown,
): value is unknown[] | Record<string, unknown> {
  return Array.isArray(value) || isRecord(value)
}

function containerSize(value: unknown[] | Record<string, unknown>): number {
  return Array.isArray(value) ? value.length : Object.keys(value).length
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}
