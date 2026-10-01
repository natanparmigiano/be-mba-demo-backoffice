# WhatsApp messaging

`@mba-demo/wa-messaging` is the typed WhatsApp Cloud API client for sending
messages. It deliberately covers only the `/{phone-number-id}/messages`
operation; media upload, template management, phone-number administration, and
other Graph API endpoints belong in separate packages.

The discriminated `send()` input supports audio, contacts, documents, images,
interactive messages, locations, reactions, stickers, templates, text, and
video. Interactive payloads cover lists, reply buttons, single and multi-product
messages, catalogs, Flows, CTA URLs, and location requests. Every message type
also has a named convenience method such as `sendText()` or `sendImage()`.
The same client marks incoming messages as read, displays typing indicators,
sends contextual replies, and supports link previews on text messages.
The package also exports the corresponding request and response Zod schemas;
webhook schemas live separately in `@mba-demo/wa-webhooks`.

## Usage

```ts
import { createWhatsAppMessagingClient } from '@mba-demo/wa-messaging'

const messaging = createWhatsAppMessagingClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

await messaging.sendText({
  to: '5511999999999',
  text: { body: 'Hello from WhatsApp' },
})

await messaging.sendTemplate({
  to: '5511999999999',
  template: {
    name: 'order_update',
    language: { code: 'pt_BR' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'customer', text: 'Ada' },
          {
            type: 'currency',
            currency: {
              fallback_value: 'R$ 10,00',
              code: 'BRL',
              amount_1000: 10000,
            },
          },
        ],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: 0,
        parameters: [{ type: 'payload', payload: 'confirm' }],
      },
    ],
  },
})

await messaging.markAsRead('wamid.incoming-message')

await messaging.showTypingIndicator('wamid.incoming-message')

await messaging.sendText({
  to: '5511999999999',
  context: { message_id: 'wamid.incoming-message' },
  text: { body: 'This replies to the quoted message.' },
})

await messaging.sendText({
  to: '5511999999999',
  text: {
    body: 'See https://www.meta.com/',
    preview_url: true,
  },
})
```

`send()` accepts the same payloads with an explicit `type` discriminator when a
caller needs to select the message kind dynamically. Media uses an exclusive
`id` or `link` source. A reply is sent by adding `context.message_id`.
Every applicable message helper accepts `context`; reaction messages exclude it
because Meta does not support contextual reactions. `showTypingIndicator()`
also marks the incoming message as read; WhatsApp dismisses the indicator after
a response or after 25 seconds.
Set `recipient_type: 'group'` when `to` is a WhatsApp group ID; direct messages
may use `individual` or omit the field.

The default endpoint is Graph API `v26.0`. Callers can set `graphApiVersion` to
pin another supported version and `graphApiBaseUrl` for a test proxy. Access
tokens are accepted only through client construction and are never included in
errors. The client has no connection lifecycle and performs I/O only when a send
method is called.

Non-2xx responses throw `WhatsAppMessagingApiError`, preserving the HTTP status
and structured Graph API error fields. Invalid successful responses throw
`WhatsAppMessagingResponseError`. Callers may pass an `AbortSignal` through the
second argument to any send method.
