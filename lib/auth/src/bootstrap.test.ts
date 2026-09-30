import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootstrapInitialAdmin } from './index.js'

test('creates and logs the initial admin when no users exist', async () => {
  const messages: string[] = []
  let createdPassword: string | undefined

  const created = await bootstrapInitialAdmin({
    countUsers: async () => 0,
    createAdmin: async (password) => {
      createdPassword = password
    },
    generatePassword: () => 'generated-password',
    logger: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
    },
  })

  assert.equal(created, true)
  assert.equal(createdPassword, 'generated-password')
  assert.deepEqual(messages, [
    'Initial administrator created:',
    '  Email: admin@meta.com',
    '  Password: generated-password',
    'WARNING: Change the initial administrator password immediately after signing in.',
  ])
})

test('does not create or log credentials when a user already exists', async () => {
  let createCalls = 0
  const messages: string[] = []

  const created = await bootstrapInitialAdmin({
    countUsers: async () => 1,
    createAdmin: async () => {
      createCalls += 1
    },
    generatePassword: () => 'unused-password',
    logger: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
    },
  })

  assert.equal(created, false)
  assert.equal(createCalls, 0)
  assert.deepEqual(messages, [])
})

test('accepts another replica winning the first-start race', async () => {
  let countCalls = 0

  const created = await bootstrapInitialAdmin({
    countUsers: async () => (countCalls++ === 0 ? 0 : 1),
    createAdmin: async () => {
      throw new Error('duplicate user')
    },
    generatePassword: () => 'unused-password',
    logger: console,
  })

  assert.equal(created, false)
})
