# WhatsApp templates

`@mba-demo/wa-templates` is the typed WhatsApp Business Management API client
for the complete documented message-template lifecycle.

It supports:

- creating custom templates and templates from Meta's Template Library;
- listing and filtering templates with cursor pagination and field selection;
- retrieving and editing a template by ID, including category, components,
  parameter format, subcategory/display settings, device-delivery behavior,
  message TTL, and CTA link-tracking preference;
- deleting by name, by ID and name, or in batches of up to 100 IDs;
- retrieving the template namespace;
- bulk upserting authentication templates in multiple languages;
- migrating eligible templates between WABAs;
- browsing and filtering the Template Library; and
- creating, retrieving, updating, and deleting template groups.

The client covers text and media headers, body/footer components, buttons,
authentication OTPs, carousels, limited-time offers, named and positional
parameters, and library-template inputs. Returned template and component
objects preserve additive Meta fields.

## Usage

```ts
import { createWhatsAppTemplatesClient } from '@mba-demo/wa-templates'

const templates = createWhatsAppTemplatesClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
})

const created = await templates.create({
  name: 'order_ready',
  language: 'pt_BR',
  category: 'UTILITY',
  parameter_format: 'NAMED',
  message_send_ttl_seconds: 3600,
  components: [
    {
      type: 'BODY',
      text: 'Olá {{customer}}, seu pedido {{order_number}} está pronto.',
      example: {
        body_text_named_params: [
          { param_name: 'customer', example: 'Ada' },
          { param_name: 'order_number', example: '1234' },
        ],
      },
    },
  ],
})

const page = await templates.list({
  status: 'APPROVED',
  category: 'UTILITY',
  limit: 50,
})

await templates.update(created.id, {
  message_send_ttl_seconds: 7200,
})

await templates.deleteById(created.id, 'order_ready')
```

## Operational notes

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release. All network activity is lazy and every method accepts an
`AbortSignal`. Non-2xx responses throw `WhatsAppTemplatesApiError`, preserving
Graph API error metadata. Invalid successful responses throw
`WhatsAppTemplatesResponseError`.

Template names are validated using Meta's lowercase alphanumeric/underscore
rule and 512-character limit. Bulk deletion is limited to 100 IDs and migration
batches to 500 IDs. The package intentionally does not guess an archive or
unarchive request shape: Meta's current archival guide describes the behavior
and response but does not publish a request endpoint or body.

Canonical references used by this package are linked from the corresponding
requests in the checked-in `WhatsApp Cloud API/Templates` collection.
