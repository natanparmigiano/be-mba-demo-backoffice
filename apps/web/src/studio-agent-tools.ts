import {
  parseMcpxYaml,
  stringifyAgentYaml,
  type StudioDocument,
} from './studio-agtx'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const mcpNamePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

/** Applies an RFC 7396 JSON Merge Patch without mutating either input. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) return structuredClone(patch)
  const result: Record<string, unknown> = isRecord(target)
    ? structuredClone(target)
    : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key]
    else result[key] = mergePatch(result[key], value)
  }
  return result
}

/** Returns the complete current AGTX manifest. */
export function getAgentConfig(document: StudioDocument) {
  return structuredClone(document.manifest)
}

/** Applies a JSON Merge Patch to the AGTX manifest and validates its envelope. */
export function patchAgentConfig(
  document: StudioDocument,
  patchJson: string,
): StudioDocument {
  const manifest = asRecord(
    mergePatch(document.manifest, parseObject(patchJson)),
  )
  assertManifest(manifest)
  return { ...document, manifest }
}

/** Returns one embedded MCPX definition by snake_case name. */
export function getMcpDefinition(document: StudioDocument, name: string) {
  const path = mcpPath(name)
  const bytes = document.entries.get(path)
  if (!bytes) throw new TypeError(`MCP definition does not exist: ${name}`)
  return asRecord(parseMcpxYaml(decoder.decode(bytes)))
}

/** Applies a JSON Merge Patch to an embedded MCPX definition. */
export function patchMcpDefinition(
  document: StudioDocument,
  name: string,
  patchJson: string,
): StudioDocument {
  const current = getMcpDefinition(document, name)
  const definition = asRecord(mergePatch(current, parseObject(patchJson)))
  assertMcpDefinition(definition, name)
  return replaceEntry(
    document,
    mcpPath(name),
    encoder.encode(`${stringifyAgentYaml(definition)}\n`),
  )
}

/** Adds a remote MCP server connector to the current AGTX manifest. */
export function addMcpServer(
  document: StudioDocument,
  input: {
    name: string
    description: string
    baseUrl: string
    authType: string
  },
): StudioDocument {
  assertMcpName(input.name)
  if (!input.description.trim()) throw new TypeError('description is required')
  try {
    new URL(input.baseUrl)
  } catch {
    throw new TypeError('baseUrl must be an absolute URL')
  }
  if (
    !['API_KEY', 'OAUTH2_CLIENT_CREDENTIALS', 'NONE'].includes(input.authType)
  )
    throw new TypeError(
      'authType must be API_KEY, OAUTH2_CLIENT_CREDENTIALS, or NONE',
    )
  const manifest = structuredClone(document.manifest)
  const agent = getAgent(manifest)
  const connectors = requireArray(agent.connectors, 'agent.connectors')
  if (connectors.some((value) => isRecord(value) && value.name === input.name))
    throw new TypeError(`Connector already exists: ${input.name}`)
  agent.connectors = [
    ...connectors,
    {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description.trim(),
      baseUrl: input.baseUrl,
      connectorProtocol: 'MCP',
      authType: input.authType,
      requiresCertificate: false,
      userAuthInjectionConfig: null,
      localMcp: null,
    },
  ]
  return { ...document, manifest }
}

/** Lists the manifest and all packaged file entries. */
export function listFiles(document: StudioDocument) {
  return [
    { path: 'agent.yaml', size: stringifyAgentYaml(document.manifest).length },
    ...[...document.entries]
      .map(([path, bytes]) => ({ path, size: bytes.byteLength }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  ]
}

/** Reads an AGTX package file as UTF-8 when possible, otherwise as base64. */
export function readFile(document: StudioDocument, path: string) {
  if (path === 'agent.yaml')
    return {
      path,
      encoding: 'utf8',
      content: `${stringifyAgentYaml(document.manifest)}\n`,
    }
  assertEntryPath(path)
  const bytes = document.entries.get(path)
  if (!bytes) throw new TypeError(`File does not exist: ${path}`)
  try {
    return { path, encoding: 'utf8', content: decoder.decode(bytes) }
  } catch {
    return { path, encoding: 'base64', content: bytesToBase64(bytes) }
  }
}

/** Creates or replaces a package file under files/ or MCPs/. */
export function putFile(
  document: StudioDocument,
  path: string,
  content: string,
  encoding: string,
): StudioDocument {
  assertEntryPath(path)
  const bytes =
    encoding === 'utf8'
      ? encoder.encode(content)
      : encoding === 'base64'
        ? base64ToBytes(content)
        : (() => {
            throw new TypeError('encoding must be utf8 or base64')
          })()
  if (path.startsWith('MCPs/')) {
    const name = path.slice(5, -5)
    if (!path.endsWith('.mcpx'))
      throw new TypeError('Files under MCPs/ must use the .mcpx extension')
    assertMcpDefinition(asRecord(parseMcpxYaml(decoder.decode(bytes))), name)
  }
  return replaceEntry(document, path, bytes)
}

/** Deletes an unreferenced package file. */
export function deleteFile(
  document: StudioDocument,
  path: string,
): StudioDocument {
  assertEntryPath(path)
  if (!document.entries.has(path))
    throw new TypeError(`File does not exist: ${path}`)
  const agent = getAgent(document.manifest)
  const knowledge = asRecord(agent.knowledge)
  const files = requireArray(knowledge.files, 'agent.knowledge.files')
  if (files.some((value) => isRecord(value) && value.path === path))
    throw new TypeError(
      'Remove the knowledge file reference before deleting this file',
    )
  const connectors = requireArray(agent.connectors, 'agent.connectors')
  if (
    connectors.some(
      (value) =>
        isRecord(value) &&
        isRecord(value.localMcp) &&
        value.localMcp.path === path,
    )
  )
    throw new TypeError(
      'Remove the localMcp connector reference before deleting this file',
    )
  const entries = new Map(document.entries)
  entries.delete(path)
  return { ...document, entries }
}

function replaceEntry(
  document: StudioDocument,
  path: string,
  bytes: Uint8Array,
) {
  const entries = new Map(document.entries)
  entries.set(path, bytes)
  return { ...document, entries }
}

function assertManifest(manifest: Record<string, unknown>) {
  if (manifest.format !== 'agtx' || manifest.version !== 1)
    throw new TypeError(
      'The manifest must preserve format: agtx and version: 1',
    )
  const agent = getAgent(manifest)
  requireArray(agent.connectors, 'agent.connectors')
  requireArray(agent.skills, 'agent.skills')
  const knowledge = asRecord(agent.knowledge)
  requireArray(knowledge.faqs, 'agent.knowledge.faqs')
  requireArray(knowledge.websites, 'agent.knowledge.websites')
  requireArray(knowledge.files, 'agent.knowledge.files')
}

function assertMcpDefinition(
  definition: Record<string, unknown>,
  expectedName: string,
) {
  if (definition.format !== 'mba-mcp' || definition.version !== 1)
    throw new TypeError('MCPX must preserve format: mba-mcp and version: 1')
  const mcp = asRecord(definition.mcp)
  if (mcp.name !== expectedName)
    throw new TypeError(`MCP name must match its filename: ${expectedName}`)
  requireArray(mcp.functions, 'mcp.functions')
}

function getAgent(manifest: Record<string, unknown>) {
  return asRecord(manifest.agent)
}

function parseObject(source: string) {
  try {
    return asRecord(JSON.parse(source))
  } catch (error) {
    throw new TypeError(
      `Patch must be a JSON object: ${error instanceof Error ? error.message : 'invalid JSON'}`,
    )
  }
}

function mcpPath(name: string) {
  assertMcpName(name)
  return `MCPs/${name}.mcpx`
}

function assertMcpName(name: string) {
  if (!mcpNamePattern.test(name))
    throw new TypeError('MCP names must be lowercase snake_case')
}

function assertEntryPath(path: string) {
  if (
    (!path.startsWith('files/') && !path.startsWith('MCPs/')) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '..')
  )
    throw new TypeError('File path must be safe and begin with files/ or MCPs/')
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError('Expected an object')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`)
  return value
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  } catch {
    throw new TypeError('content is not valid base64')
  }
}
