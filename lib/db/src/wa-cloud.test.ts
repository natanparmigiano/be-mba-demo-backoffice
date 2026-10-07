import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  whatsappWebhookSchema,
  whatsappMessageSchema,
  type WhatsAppWebhook,
} from '@mba-desk/wa-webhooks'
import { whatsappMessageSources } from './schema/chats.js'
import {
  assertWhatsAppWebhookMatchesChannel,
  getChatHandlerForHandoverRole,
  getChatHandlerForMessageSource,
  getInitialMessageStatus,
  projectWhatsAppMessageContent,
  WhatsAppWebhookChannelMismatchError,
} from './wa-cloud.js'
import type { WhatsAppChannelConfiguration } from './wa-cloud.js'

describe('WhatsApp webhook channel matching', () => {
  it('ignores formatting characters in display phone numbers', () => {
    assert.doesNotThrow(() =>
      assertWhatsAppWebhookMatchesChannel(
        webhookForDisplayPhoneNumber('55 11 93276 1156'),
        channelForPhoneNumber('+55 (11) 93276-1156'),
      ),
    )
  })

  it('still rejects a different display phone number', () => {
    assert.throws(
      () =>
        assertWhatsAppWebhookMatchesChannel(
          webhookForDisplayPhoneNumber('+55 11 93276-1157'),
          channelForPhoneNumber('+55 (11) 93276-1156'),
        ),
      WhatsAppWebhookChannelMismatchError,
    )
  })

  it('does not consider two values without digits to be the same number', () => {
    assert.throws(
      () =>
        assertWhatsAppWebhookMatchesChannel(
          webhookForDisplayPhoneNumber('---'),
          channelForPhoneNumber('+++'),
        ),
      WhatsAppWebhookChannelMismatchError,
    )
  })

  it('matches observed handovers using recipient metadata', () => {
    assert.doesNotThrow(() =>
      assertWhatsAppWebhookMatchesChannel(
        handoverWebhookForRecipient('+55 11 93276-1156'),
        channelForPhoneNumber('+55 (11) 93276-1156'),
      ),
    )
  })
})

describe('chat handler routing', () => {
  it('assigns MBA ownership to standby messages', () => {
    assert.equal(getChatHandlerForMessageSource('standby'), 'mba')
  })

  it('assigns application ownership to messages collection traffic', () => {
    assert.equal(getChatHandlerForMessageSource('messages'), 'application')
  })

  it('does not change ownership for non-routing message sources', () => {
    const nonRoutingSources = whatsappMessageSources.filter(
      (source) => source !== 'standby' && source !== 'messages',
    )

    for (const source of nonRoutingSources) {
      assert.equal(getChatHandlerForMessageSource(source), undefined)
    }
  })

  it('maps observed handover roles to application ownership', () => {
    assert.equal(getChatHandlerForHandoverRole('ai_agent'), 'mba')
    assert.equal(getChatHandlerForHandoverRole('escalation'), 'application')
    assert.equal(getChatHandlerForHandoverRole('future_role'), undefined)
  })
})

describe('initial message status', () => {
  it('marks AI-owned inbound messages read', () => {
    assert.equal(getInitialMessageStatus('inbound', 'mba'), 'read')
  })

  it('keeps non-AI inbound messages delivered', () => {
    assert.equal(getInitialMessageStatus('inbound', 'application'), 'delivered')
    assert.equal(getInitialMessageStatus('inbound'), 'delivered')
  })

  it('does not assign an inbound delivery status to outbound messages', () => {
    assert.equal(getInitialMessageStatus('outbound', 'mba'), undefined)
    assert.equal(getInitialMessageStatus('outbound'), undefined)
  })
})

describe('message content projection', () => {
  it('extracts text and message relationship metadata', () => {
    const context = {
      id: 'wamid.parent',
      forwarded: true,
      frequently_forwarded: true,
    }
    const referral = {
      source_url: 'https://example.com/ad',
      source_type: 'ad',
      source_id: 'ad-1',
      headline: 'New collection',
    }
    const identity = {
      acknowledged: true,
      created_timestamp: '1759237200',
      hash: 'identity-hash',
    }

    const message = whatsappMessageSchema.parse({
      from: '5511999990000',
      id: 'wamid.text',
      timestamp: '1759237200',
      type: 'text',
      text: { body: 'Hello from WhatsApp' },
      context,
      referral,
      identity,
    })
    assert.equal(message.context?.forwarded, true)
    assert.equal(message.context?.frequently_forwarded, true)

    const projection = projectWhatsAppMessageContent(message)

    assert.equal(projection.textContent, 'Hello from WhatsApp')
    assert.deepEqual(projection.contextData, context)
    assert.equal(projection.forwarded, true)
    assert.equal(projection.frequentlyForwarded, true)
    assert.deepEqual(projection.referralData, referral)
    assert.deepEqual(projection.identityData, identity)
  })

  it('parses and projects omitted forwarding markers as unknown', () => {
    const message = whatsappMessageSchema.parse({
      from: '5511999990000',
      id: 'wamid.text',
      timestamp: '1759237200',
      type: 'text',
      text: { body: 'Original message' },
    })

    const projection = projectWhatsAppMessageContent(message)

    assert.equal(projection.forwarded, null)
    assert.equal(projection.frequentlyForwarded, null)
  })

  it('projects the template name from outbound template messages', () => {
    const projection = projectWhatsAppMessageContent({
      messaging_product: 'whatsapp',
      to: '5511999990000',
      type: 'template',
      template: {
        name: 'order_ready',
        language: { code: 'en_US' },
      },
    })

    assert.equal(projection.templateName, 'order_ready')
    assert.equal(projection.templateData?.name, 'order_ready')
  })

  it('extracts media fields for direct and interactive-header media', () => {
    const image = projectWhatsAppMessageContent({
      from: '5511999990000',
      id: 'wamid.image',
      timestamp: '1759237200',
      type: 'image',
      image: {
        id: 'media-1',
        mime_type: 'image/jpeg',
        sha256: 'sha-1',
        url: 'https://example.com/image.jpg',
        caption: 'Product photo',
      },
    })
    const interactive = projectWhatsAppMessageContent({
      from: 'business-number',
      to: '5511999990000',
      id: 'wamid.interactive',
      timestamp: '1759237201',
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'document',
          document: {
            link: 'https://example.com/terms.pdf',
            filename: 'terms.pdf',
          },
        },
        body: { text: 'Review the terms' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'accept', title: 'Accept' } },
          ],
        },
      },
    })

    assert.deepEqual(
      {
        textContent: image.textContent,
        mediaId: image.mediaId,
        mediaUrl: image.mediaUrl,
        mediaMimeType: image.mediaMimeType,
        mediaSha256: image.mediaSha256,
        mediaCaption: image.mediaCaption,
      },
      {
        textContent: 'Product photo',
        mediaId: 'media-1',
        mediaUrl: 'https://example.com/image.jpg',
        mediaMimeType: 'image/jpeg',
        mediaSha256: 'sha-1',
        mediaCaption: 'Product photo',
      },
    )
    assert.equal(interactive.textContent, 'Review the terms')
    assert.equal(interactive.mediaUrl, 'https://example.com/terms.pdf')
    assert.equal(interactive.mediaFileName, 'terms.pdf')
    assert.deepEqual(interactive.interactiveData, {
      type: 'button',
      header: {
        type: 'document',
        document: {
          link: 'https://example.com/terms.pdf',
          filename: 'terms.pdf',
        },
      },
      body: { text: 'Review the terms' },
      action: {
        buttons: [{ type: 'reply', reply: { id: 'accept', title: 'Accept' } }],
      },
    })
  })

  it('projects structured contact, location, reaction, and edited content', () => {
    const sharedContacts = [
      {
        name: { formatted_name: 'Ada Lovelace' },
        phones: [{ phone: '+55 11 99999-0000', type: 'CELL' }],
      },
    ]
    const contacts = projectWhatsAppMessageContent({
      from: '5511999990000',
      id: 'wamid.contacts',
      timestamp: '1759237200',
      type: 'contacts',
      contacts: sharedContacts,
    })
    const locationData = {
      latitude: -23.55052,
      longitude: -46.633308,
      name: 'São Paulo',
      address: 'Praça da Sé',
    }
    const location = projectWhatsAppMessageContent({
      from: '5511999990000',
      id: 'wamid.location',
      timestamp: '1759237201',
      type: 'location',
      location: locationData,
    })
    const reactionData = { message_id: 'wamid.parent', emoji: '👍' }
    const reaction = projectWhatsAppMessageContent({
      from: '5511999990000',
      id: 'wamid.reaction',
      timestamp: '1759237202',
      type: 'reaction',
      reaction: reactionData,
    })
    const editData = {
      original_message_id: 'wamid.original',
      message: { type: 'text' as const, text: { body: 'Corrected text' } },
    }
    const edit = projectWhatsAppMessageContent({
      from: '5511999990000',
      id: 'wamid.edit',
      timestamp: '1759237203',
      type: 'edit',
      edit: editData,
    })

    assert.deepEqual(contacts.contactData, sharedContacts)
    assert.equal(contacts.textContent, 'Ada Lovelace')
    assert.deepEqual(location.locationData, locationData)
    assert.equal(location.textContent, 'São Paulo')
    assert.deepEqual(reaction.reactionData, reactionData)
    assert.equal(reaction.textContent, '👍')
    assert.deepEqual(edit.editData, editData)
    assert.equal(edit.textContent, 'Corrected text')
  })
})

function channelForPhoneNumber(
  waPhoneNumber: string,
): WhatsAppChannelConfiguration {
  return {
    id: 42,
    organizationId: 'organization-id',
    type: 'whatsapp',
    waAppSecret: 'app-secret',
    waWebhookVerifyToken: 'verify-token',
    webhookForwardUrls: [],
    waPhoneNumber,
    waPhoneNumberId: 'phone-number-id',
    waSystemUserAccessToken: 'access-token',
    waWabaId: 'waba-id',
  }
}

function webhookForDisplayPhoneNumber(
  displayPhoneNumber: string,
): WhatsAppWebhook {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: 'phone-number-id',
              },
              messages: [],
            },
          },
        ],
      },
    ],
  }
}

function handoverWebhookForRecipient(
  displayPhoneNumber: string,
): WhatsAppWebhook {
  return whatsappWebhookSchema.parse({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messaging_handovers',
            value: {
              messaging_product: 'whatsapp',
              recipient: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: 'phone-number-id',
              },
              sender: { phone_number: '5511999990000' },
              timestamp: '1759237200',
              type: 'control_passed',
              control_passed: {
                previous_owner_role: 'ai_agent',
                new_owner_role: 'escalation',
              },
            },
          },
        ],
      },
    ],
  })
}
