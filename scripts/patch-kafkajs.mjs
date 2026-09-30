import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const kafkaRequestQueueUrl = new URL(
  '../node_modules/kafkajs/src/network/requestQueue/index.js',
  import.meta.url,
)
const kafkaRequestQueuePath = fileURLToPath(kafkaRequestQueueUrl)

const original = `    if (!this.throttleCheckTimeoutId) {
      if (this.pending.length > 0) {
        scheduleAt = scheduleAt > 0 ? scheduleAt : CHECK_PENDING_REQUESTS_INTERVAL
      }
      this.throttleCheckTimeoutId = setTimeout(() => {`

const patched = `    if (!this.throttleCheckTimeoutId) {
      if (this.pending.length > 0) {
        scheduleAt = scheduleAt > 0 ? scheduleAt : CHECK_PENDING_REQUESTS_INTERVAL
      } else if (scheduleAt <= 0) {
        // KafkaJS 2.2.4 otherwise passes -1 - Date.now() to setTimeout on Node 24.
        return
      }
      this.throttleCheckTimeoutId = setTimeout(() => {`

const source = await readFile(kafkaRequestQueueUrl, 'utf8')

if (source.includes(patched)) {
  process.stdout.write('KafkaJS Node 24 timeout patch already applied\n')
} else if (source.includes(original)) {
  await writeFile(kafkaRequestQueueUrl, source.replace(original, patched))
  process.stdout.write(
    `Patched KafkaJS request queue at ${kafkaRequestQueuePath}\n`,
  )
} else {
  throw new Error(
    'KafkaJS request queue does not match 2.2.4; review scripts/patch-kafkajs.mjs before installing',
  )
}
