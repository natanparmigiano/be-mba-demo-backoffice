# WhatsApp Meta Business Agent

`@mba-demo/wa-mba` is the typed client for the Meta Business Agent Platform
APIs used with a WhatsApp Business phone number. It covers every operation in
the checked-in `WhatsApp Cloud API/MBA` collection:

- eligibility, onboarding, settings, allowlists, budgets, and deletion;
- business information, FAQs, files, and website knowledge;
- behavioral instructions and interactive-message UI skills;
- connectors, credentials, connector logs, and connector tools;
- agent tests, asynchronous events, evaluations, and thread control; and
- agent-event, conversation, turn, and tool-call insights.

## Usage

```ts
import { createWhatsAppMbaClient } from '@mba-demo/wa-mba'

const mba = createWhatsAppMbaClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
  businessId: process.env.META_BUSINESS_ID,
})

if ((await mba.getEligibility()).is_eligible) {
  const { agent_id } = await mba.onboard()

  await mba.updateSettings(
    {
      rollout: { enabled: false },
      ai_audience: 'ALLOWLISTED_ONLY',
    },
    { agentId: agent_id },
  )
}
```

`businessId` is optional at construction time and is only required by
`getBudgets()` and `replaceBudgets()`. Those endpoints are scoped to the
Business Manager rather than the WhatsApp phone number.

Thread control supports the provider's `take` and `release` actions.

## Transport and safety

The default base URL is `https://api.facebook.com`. The client sends
`X-API-Version: 2.0.0` for MBA requests and `1.0.0` for thread control, matching
the endpoint specifications. Both can be overridden for a compatible API or
test proxy. IDs are URL encoded, JSON requests set their content type, and file
uploads let `FormData` supply the multipart boundary.

The client performs no network I/O until a method is called. Every method
accepts an `AbortSignal`, and tests inject `fetch` instead of using live Meta
infrastructure. The client validates documented local constraints such as date
ranges, pagination limits, budget uniqueness, supported knowledge-file
extensions, and connector authentication configuration.

Connector-tool request bodies use normal nested TypeScript objects at the
public API. The client converts nested `items` and `properties` nodes to the
JSON object strings required by Meta on writes and converts them back to
structured nodes on reads. Callers and portable formats therefore do not need
to implement Meta's wire encoding.

The package deliberately does not retry requests automatically. Several MBA
resources have hourly limits, so callers should coordinate retries centrally,
honor `429` responses, and apply backoff appropriate to their workload.

Non-2xx responses throw `WhatsAppMbaApiError`, preserving both MBA standard
error fields and Graph-style error details without retaining the access token.
Plain-text non-2xx gateway responses are preserved as the error body instead
of being misclassified as malformed successful responses. Malformed successful
responses throw `WhatsAppMbaResponseError`.

## Verification

```bash
yarn workspace @mba-demo/wa-mba typecheck
yarn workspace @mba-demo/wa-mba test
yarn workspace @mba-demo/wa-mba build
```
