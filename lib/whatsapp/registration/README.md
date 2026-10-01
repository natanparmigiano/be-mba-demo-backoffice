# WhatsApp phone-number registration

`@mba-demo/wa-registration` is the typed WhatsApp Cloud API client for the
business phone-number registration lifecycle.

It supports:

- checking a phone number's registration, ownership-verification, display-name,
  and quality fields;
- requesting an ownership code by SMS or voice and submitting that code;
- registering a verified number while setting its six-digit two-step PIN;
- optionally enabling a supported data-localization region at registration;
- changing the number's two-step verification PIN; and
- deregistering the number from Cloud API.

The ownership-code and PIN methods are registration prerequisites documented
under Meta's Business Phone Numbers APIs. There is no API endpoint to disable
two-step verification; that action remains available only in WhatsApp Manager.

## Usage

```ts
import { createWhatsAppRegistrationClient } from '@mba-demo/wa-registration'

const registration = createWhatsAppRegistrationClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

const phone = await registration.getPhoneNumber({
  fields: ['code_verification_status', 'name_status', 'status'],
})

if (phone.code_verification_status !== 'VERIFIED') {
  await registration.requestVerificationCode({
    code_method: 'SMS',
    language: 'pt_BR',
  })
  await registration.verifyCode({ code: '123456' })
}

await registration.register({
  pin: '654321',
  data_localization_region: 'BR',
})

await registration.deregister()
```

## Operational notes

Registration and deregistration are each limited by Meta to 10 requests per
business phone number in a rolling 72-hour window. Deregistration makes the
number unusable with Cloud API and disables local storage, but it does not
delete the number or its message history.

PINs and ownership codes are validated as six-digit strings so leading zeroes
are preserved. Data localization is limited to Meta's documented country-code
set. Once enabled, its region can only be changed or disabled by deregistering
and registering again.

The default endpoint is Graph API `v26.0`; callers can pin another supported
version or inject a test proxy/fetch implementation. The client performs no I/O
until a method is called, and every method accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppRegistrationApiError`, preserving structured
Graph error details. Invalid successful responses throw
`WhatsAppRegistrationResponseError`.
