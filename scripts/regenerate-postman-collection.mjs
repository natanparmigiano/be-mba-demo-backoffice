import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const outputPath = path.join(
  repositoryRoot,
  'documentation/docs/archive/collections/mba_wa_cloud_be.postman_collection.json',
)
const sourceArgument = process.argv[2]

if (!sourceArgument) {
  console.error(
    'Usage: yarn collections:regenerate <downloaded-postman-collection.json>',
  )
  process.exit(1)
}

const sourcePath = path.resolve(process.cwd(), sourceArgument)
const collection = JSON.parse(await readFile(sourcePath, 'utf8'))

if (
  collection?.info?.schema !==
    'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' ||
  !Array.isArray(collection.item)
) {
  throw new Error('Input is not a Postman Collection v2.1 document')
}

if (collection.item[0]?.name !== 'MBA') {
  throw new Error('The combined playground collection must put MBA first')
}

const referencedVariables = new Set()
const visit = (value) => {
  if (typeof value === 'string') {
    for (const match of value.matchAll(
      /(?<!\\){{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g,
    )) {
      referencedVariables.add(match[1])
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach(visit)
    return
  }
  if (value && typeof value === 'object') Object.values(value).forEach(visit)
}
visit(collection.item)

const declaredVariables = new Set(
  (collection.variable ?? []).map((variable) => variable.key),
)
const missingVariables = [...referencedVariables].filter(
  (name) => !declaredVariables.has(name),
)
if (missingVariables.length) {
  throw new Error(
    `Collection references undeclared variables: ${missingVariables.join(', ')}`,
  )
}

for (const variable of collection.variable ?? []) variable.value = ''

const temporaryPath = `${outputPath}.tmp`
await writeFile(temporaryPath, `${JSON.stringify(collection, null, 2)}\n`)
await rename(temporaryPath, outputPath)

console.log(`Regenerated ${path.relative(repositoryRoot, outputPath)}`)
