import { createHash, randomUUID } from 'node:crypto'
import type {
  MessageEcho,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhook,
  WhatsAppWebhookChange,
} from '@mba-demo/schemas/wa-cloud/webhooks'
import { whatsappWebhookSchema } from '@mba-demo/schemas/wa-cloud/webhooks'
import { SeededRandom } from './random.js'
import type {
  ConversationOwner,
  GeneratedWebhook,
  GeneratorOptions,
  GeneratorPool,
  SyntheticContact,
  SyntheticGroup,
} from './types.js'

interface DirectConversation {
  contact: SyntheticContact
  lastInboundMessageId?: string
  owner: ConversationOwner
  phase: number
}

interface GroupConversation {
  group: SyntheticGroup
  lastInboundMessageId?: string
  phase: number
}

interface PendingStatus {
  messageId: string
  recipientId: string
  sentAt: number
  stage: 0 | 1 | 2
}

type Conversation =
  | { kind: 'direct'; value: DirectConversation }
  | { kind: 'group'; value: GroupConversation }

const firstNames = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elisa',
  'Fabio',
  'Gabriela',
  'Hugo',
  'Isabela',
  'Joao',
] as const

const lastNames = [
  'Almeida',
  'Barbosa',
  'Cardoso',
  'Dias',
  'Esteves',
  'Ferreira',
  'Gomes',
  'Henrique',
  'Ibrahim',
  'Jardim',
] as const

const textBodies = [
  'Hello, I need help with my order.',
  'Could you check the delivery status?',
  'I would like to talk to an agent.',
  'Thanks, that answered my question.',
  'Can you send me more details?',
] as const

export class SyntheticWebhookGenerator {
  readonly pool: GeneratorPool

  private readonly directConversations: DirectConversation[]
  private readonly groupConversations: GroupConversation[]
  private readonly metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  private readonly pending: GeneratedWebhook[] = []
  private readonly pendingStatuses: PendingStatus[] = []
  private readonly random: SeededRandom
  private readonly runId: string
  private conversationCursor = 0
  private idCounter = 0
  private messageOrdinal = 0

  constructor(
    private readonly options: GeneratorOptions,
    private readonly now: () => number = Date.now,
  ) {
    validateOptions(options)
    this.random = new SeededRandom(options.seed)
    this.runId = sanitizeId(options.runId ?? randomUUID())
    this.metadata = {
      display_phone_number: options.displayPhoneNumber,
      phone_number_id: options.phoneNumberId,
    }

    const contacts = Array.from({ length: options.contacts }, (_, index) =>
      this.createContact(index),
    )
    const groups = Array.from({ length: options.groups }, (_, index) =>
      this.createGroup(index, contacts),
    )
    this.pool = { contacts, groups }
    this.directConversations = contacts.map((contact) => ({
      contact,
      owner: 'human_app',
      phase: 0,
    }))
    this.groupConversations = groups.map((group) => ({ group, phase: 0 }))

    for (const group of groups) {
      this.pending.push(this.createGroupLifecycle(group))
    }
  }

  next(): GeneratedWebhook {
    const forced = this.pending.shift()
    if (forced) return this.validate(forced)

    const pendingStatus = this.pendingStatuses.shift()
    if (pendingStatus) return this.validate(this.createStatus(pendingStatus))

    const conversation = this.nextConversation()
    const event =
      conversation.kind === 'direct'
        ? this.nextDirectEvent(conversation.value)
        : this.nextGroupEvent(conversation.value)
    return this.validate(event)
  }

  private createContact(index: number): SyntheticContact {
    const firstName = firstNames[index % firstNames.length]
    const lastName =
      lastNames[Math.floor(index / firstNames.length) % lastNames.length]
    return {
      id: `55119${String(index + 1).padStart(8, '0')}`,
      name: `${firstName} ${lastName}`,
    }
  }

  private createGroup(
    index: number,
    contacts: readonly SyntheticContact[],
  ): SyntheticGroup {
    const offset = this.random.integer(contacts.length)
    const members = Array.from(
      { length: this.options.groupSize },
      (_, memberIndex) => contacts[(offset + memberIndex) % contacts.length],
    ).filter((member): member is SyntheticContact => member !== undefined)

    return {
      id: `${this.runId}-${index + 1}@g.us`,
      members,
      subject: `Synthetic group ${index + 1}`,
    }
  }

  private nextConversation(): Conversation {
    const total =
      this.directConversations.length + this.groupConversations.length
    const index = this.conversationCursor % total
    this.conversationCursor += 1

    const direct = this.directConversations[index]
    if (direct) return { kind: 'direct', value: direct }

    const group =
      this.groupConversations[index - this.directConversations.length]
    if (!group) throw new Error('Conversation pool unexpectedly empty')
    return { kind: 'group', value: group }
  }

  private nextDirectEvent(conversation: DirectConversation): GeneratedWebhook {
    if (conversation.owner === 'human_app') {
      const phase = conversation.phase % 4
      conversation.phase += 1
      if (phase === 0 || phase === 2) {
        return this.createInboundMessage(conversation, 'messages')
      }
      if (phase === 1) return this.createOutboundEcho(conversation)
      return this.createHandover(conversation, 'agent')
    }

    const phase = conversation.phase % 5
    conversation.phase += 1
    if (phase === 0 || phase === 2) {
      return this.createInboundMessage(conversation, 'standby')
    }
    if (phase === 1) return this.createAgentEvent(conversation)
    if (phase === 3) return this.createOutboundEcho(conversation)
    return this.createHandover(conversation, 'human_app')
  }

  private nextGroupEvent(conversation: GroupConversation): GeneratedWebhook {
    const phase = conversation.phase % 4
    conversation.phase += 1
    if (phase === 3) return this.createGroupSettings(conversation.group)
    return this.createInboundMessage(conversation, 'messages')
  }

  private createInboundMessage(
    conversation: DirectConversation | GroupConversation,
    source: 'messages' | 'standby',
  ): GeneratedWebhook {
    const isGroup = 'group' in conversation
    const contact = isGroup
      ? conversation.group.members[
          this.random.integer(conversation.group.members.length)
        ]
      : conversation.contact
    if (!contact) throw new Error('Group has no members')

    const id = this.nextId('wamid.synthetic')
    const message = this.createMessage(
      id,
      contact,
      conversation.lastInboundMessageId,
      isGroup ? conversation.group.id : undefined,
    )
    conversation.lastInboundMessageId = id

    return {
      kind: source === 'standby' ? 'standby' : 'message',
      payload: this.envelope({
        field: 'messages',
        value:
          source === 'standby'
            ? {
                messaging_product: 'whatsapp',
                metadata: this.metadata,
                contacts: [this.asWebhookContact(contact)],
                standby: [message],
              }
            : {
                messaging_product: 'whatsapp',
                metadata: this.metadata,
                contacts: [this.asWebhookContact(contact)],
                messages: [message],
              },
      }),
    }
  }

  private createMessage(
    id: string,
    contact: SyntheticContact,
    previousMessageId: string | undefined,
    groupId: string | undefined,
  ): WhatsAppMessage {
    const base = {
      from: contact.id,
      ...(groupId
        ? {
            from_user_id: `user:${contact.id}`,
            from_parent_user_id: contact.id,
            group_id: groupId,
          }
        : {}),
      id,
      timestamp: this.timestamp(),
    }
    const variant = this.messageOrdinal % 5
    this.messageOrdinal += 1

    if (variant === 1) {
      return {
        ...base,
        type: 'image',
        image: {
          id: this.nextId('media'),
          mime_type: 'image/jpeg',
          sha256: createHash('sha256').update(id).digest('hex'),
          caption: 'Synthetic product photo',
        },
      }
    }
    if (variant === 2) {
      return {
        ...base,
        type: 'location',
        location: {
          latitude: -23.55052,
          longitude: -46.633308,
          name: 'Synthetic location',
          address: 'Sao Paulo, SP',
        },
      }
    }
    if (variant === 3) {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: this.nextId('button'),
            title: 'Talk to an agent',
          },
        },
      }
    }
    if (variant === 4 && previousMessageId) {
      return {
        ...base,
        type: 'reaction',
        reaction: { message_id: previousMessageId, emoji: '👍' },
      }
    }
    return {
      ...base,
      type: 'text',
      text: {
        body:
          textBodies[this.random.integer(textBodies.length)] ?? textBodies[0],
      },
    }
  }

  private createOutboundEcho(
    conversation: DirectConversation,
  ): GeneratedWebhook {
    const id = this.nextId('wamid.synthetic')
    const timestamp = Number(this.timestamp())
    const echo: MessageEcho = {
      from: this.options.displayPhoneNumber,
      to: conversation.contact.id,
      id,
      timestamp: String(timestamp),
      type: 'text',
      text: {
        body:
          conversation.owner === 'agent'
            ? 'The Business AI agent is handling this conversation.'
            : 'A human agent in the application is helping you now.',
      },
      agent_id:
        conversation.owner === 'agent' ? 'mba-agent-synthetic-1' : 'human-app',
    }
    this.pendingStatuses.push({
      messageId: id,
      recipientId: conversation.contact.id,
      sentAt: timestamp,
      stage: 0,
    })
    return {
      kind: 'message_echo',
      payload: this.envelope({
        field: 'smb_message_echoes',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          message_echoes: [echo],
        },
      }),
    }
  }

  private createStatus(pending: PendingStatus): GeneratedWebhook {
    const statuses = ['sent', 'delivered', 'read'] as const
    const status = statuses[pending.stage]
    const timestamp = pending.sentAt + pending.stage
    const value: WhatsAppMessageStatus = {
      id: pending.messageId,
      status,
      timestamp: String(timestamp),
      recipient_id: pending.recipientId,
      conversation: {
        id: `conversation.${this.runId}.${pending.recipientId}`,
        expiration_timestamp: String(timestamp + 86_400),
        origin: { type: 'service' },
      },
      pricing: {
        billable: false,
        pricing_model: 'PMP',
        category: 'service',
      },
    }

    if (pending.stage < 2) {
      this.pendingStatuses.unshift({
        ...pending,
        stage: (pending.stage + 1) as 1 | 2,
      })
    }

    return {
      kind: 'status',
      payload: this.envelope({
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          contacts: [
            this.asWebhookContact(this.findContact(pending.recipientId)),
          ],
          statuses: [value],
        },
      }),
    }
  }

  private createHandover(
    conversation: DirectConversation,
    newOwner: ConversationOwner,
  ): GeneratedWebhook {
    const previousOwner = conversation.owner
    conversation.owner = newOwner
    conversation.phase = 0
    const timestamp = this.timestamp()
    const handoverId = this.nextId('handover')

    this.pending.push(
      this.createInboundMessage(
        conversation,
        newOwner === 'agent' ? 'standby' : 'messages',
      ),
    )

    return {
      kind: 'handover',
      payload: this.envelope({
        field: 'messaging_handovers',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          contacts: [this.asWebhookContact(conversation.contact)],
          messaging_handovers: [
            {
              id: handoverId,
              event: 'handover',
              timestamp,
              conversation_id: `conversation.${this.runId}.${conversation.contact.id}`,
              user_id: conversation.contact.id,
              previous_owner: previousOwner,
              new_owner: newOwner,
              agent:
                newOwner === 'agent'
                  ? { id: 'mba-agent-synthetic-1', name: 'Synthetic MBA Agent' }
                  : { id: 'human-app', name: 'Human Application' },
            },
          ],
        },
      }),
    }
  }

  private createAgentEvent(conversation: DirectConversation): GeneratedWebhook {
    return {
      kind: 'agent_event',
      payload: this.envelope({
        field: 'messaging_handovers',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          contacts: [this.asWebhookContact(conversation.contact)],
          messaging_handovers: [
            {
              id: this.nextId('agent-event'),
              event: 'agent_event',
              event_type: 'agent_active',
              timestamp: this.timestamp(),
              conversation_id: `conversation.${this.runId}.${conversation.contact.id}`,
              user_id: conversation.contact.id,
              agent: {
                id: 'mba-agent-synthetic-1',
                name: 'Synthetic MBA Agent',
              },
            },
          ],
        },
      }),
    }
  }

  private createGroupLifecycle(group: SyntheticGroup): GeneratedWebhook {
    return {
      kind: 'group_lifecycle',
      payload: this.envelope({
        field: 'group_lifecycle_update',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          groups: [
            {
              timestamp: this.timestamp(),
              group_id: group.id,
              type: 'group_created',
              request_id: this.nextId('group-request'),
              subject: group.subject,
              description: 'Synthetic group for webhook persistence testing',
              invite_link: `https://chat.whatsapp.com/${this.nextId('invite')}`,
              join_approval_mode: 'auto_approve',
              added_participants: group.members.map((member) => ({
                input: member.id,
                wa_id: member.id,
              })),
            },
          ],
        },
      }),
    }
  }

  private createGroupSettings(group: SyntheticGroup): GeneratedWebhook {
    return {
      kind: 'group_settings',
      payload: this.envelope({
        field: 'group_settings_update',
        value: {
          messaging_product: 'whatsapp',
          metadata: this.metadata,
          groups: [
            {
              timestamp: this.timestamp(),
              group_id: group.id,
              type: 'subject_changed',
              request_id: this.nextId('group-request'),
              subject: group.subject,
              initiated_by: group.members[0]?.id,
            },
          ],
        },
      }),
    }
  }

  private envelope(change: WhatsAppWebhookChange): WhatsAppWebhook {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: this.options.wabaId,
          time: Math.floor(this.now() / 1000),
          changes: [change],
        },
      ],
    }
  }

  private asWebhookContact(contact: SyntheticContact): WhatsAppContact {
    return { profile: { name: contact.name }, wa_id: contact.id }
  }

  private findContact(id: string): SyntheticContact {
    const contact = this.pool.contacts.find((candidate) => candidate.id === id)
    if (!contact) throw new Error(`Unknown synthetic contact ${id}`)
    return contact
  }

  private nextId(prefix: string): string {
    this.idCounter += 1
    return `${prefix}.${this.runId}.${this.idCounter.toString(36)}`
  }

  private timestamp(): string {
    return String(Math.floor(this.now() / 1000))
  }

  private validate(event: GeneratedWebhook): GeneratedWebhook {
    return { ...event, payload: whatsappWebhookSchema.parse(event.payload) }
  }
}

function validateOptions(options: GeneratorOptions): void {
  for (const [name, value] of [
    ['contacts', options.contacts],
    ['groups', options.groups],
    ['groupSize', options.groupSize],
    ['seed', options.seed],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`)
    }
  }
  if (options.contacts < 1) throw new Error('contacts must be at least 1')
  if (options.groups > 0 && options.groupSize < 1) {
    throw new Error('groupSize must be at least 1 when groups are enabled')
  }
  if (options.groupSize > options.contacts) {
    throw new Error('groupSize cannot exceed contacts')
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'run'
}
