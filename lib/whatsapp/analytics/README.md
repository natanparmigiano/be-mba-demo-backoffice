# WhatsApp analytics

`@mba-desk/wa-analytics` is the typed WhatsApp Business Management API client
for WABA analytics. It covers the two queries in the checked-in `Analytics`
collection and the additional analytics families in Meta's current
documentation:

- messaging analytics (`analytics`);
- conversation analytics;
- pricing analytics, including volume-tier dimensions;
- template analytics;
- template-group analytics;
- call analytics; and
- group analytics.

The package also exposes the related one-way operation that enables template
insights for a WABA. Template button click opt-out is part of template updates
and remains in `@mba-desk/wa-templates`.

## Usage

```ts
import { createWhatsAppAnalyticsClient } from '@mba-desk/wa-analytics'

const analytics = createWhatsAppAnalyticsClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
})

const messages = await analytics.getMessagingAnalytics({
  start: 1764547200,
  end: 1767225600,
  granularity: 'DAY',
  countryCodes: ['BR'],
})

const pricing = await analytics.getPricingAnalytics({
  start: 1764547200,
  end: 1767225600,
  granularity: 'DAILY',
  metricTypes: ['COST', 'VOLUME'],
  dimensions: ['PRICING_CATEGORY', 'COUNTRY', 'TIER'],
})

const templates = await analytics.getTemplateAnalytics({
  start: '2026-01-01',
  end: '2026-01-31',
  granularity: 'DAILY',
  templateIds: ['123456789'],
  metricTypes: ['SENT', 'DELIVERED', 'READ', 'CLICKED'],
  useWabaTimezone: true,
})
```

## Operational notes

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release and `graphApiBaseUrl` for a test proxy. The client performs
no I/O until a method is called, uses bearer authentication, and accepts an
`AbortSignal` on every operation.

As of December 1, 2025, Meta limits messaging, conversation, and pricing
analytics to a one-year lookback. Template, template-group, and group analytics
have a 90-day lookback. Template and template-group requests accept no more
than 10 IDs, while group analytics currently accepts exactly one group ID.

Enabling template analytics is irreversible according to Meta's documentation,
so `enableTemplateAnalytics()` is never called implicitly. When WABA-timezone
reporting is enabled, template date bounds must use `YYYY-MM-DD`.

Non-2xx responses throw `WhatsAppAnalyticsApiError` and retain structured Graph
API error metadata. Invalid successful responses throw
`WhatsAppAnalyticsResponseError`. Response types retain additive provider
fields so new metrics do not require an immediate package release.

References:

- [Current Meta analytics guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics)
- [Checked-in Analytics collection](../../../WhatsApp%20Cloud%20API/Analytics)

## Verification

```bash
yarn workspace @mba-desk/wa-analytics typecheck
yarn workspace @mba-desk/wa-analytics test
yarn workspace @mba-desk/wa-analytics build
```
