# Chat message system

The Workspace chat components turn normalized `ChatMessage` values into an
accessible WhatsApp-style timeline and provide the human-agent composer.
Provider payloads are adapted before rendering, and timeline items always
arrive oldest-first. Those two rules isolate the UI from provider changes and
preserve correct scrolling.

## Quick start

Import the public chat feature exports and pass normalized messages in
chronological order:

```tsx
import { ChatShowcase, type ChatMessage } from './components/chat'

const messages: ChatMessage[] = []

;<ChatShowcase messages={messages} />
```

Production pages should map stable action IDs to behavior, supply authorized
media URLs, and keep provider/webhook payloads outside the renderer.

## Component map

| File                        | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `types.ts`                  | Discriminated message union and supporting types                      |
| `MessageRenderer.tsx`       | Content, message chrome, reactions, timestamps, and status            |
| `ChatComposer.tsx`          | Human text, media, voice, contact, location, and template composition |
| `TemplateMessageDialog.tsx` | Template selection, parameters, preview, and payload adaptation       |
| `ImageLightbox.tsx`         | Keyboard-, pointer-, and touch-accessible image viewing               |
| `EmojiPicker.tsx`           | Searchable bundled Emoji 16 browser                                   |
| `WhatsAppText.tsx`          | Safe WhatsApp-style text formatting                                   |
| `fixtures.ts`               | Localized design-system conversations                                 |
| `ChatShowcase.tsx`          | Bounded conversation shell and integration slots                      |
| `index.ts`                  | Public feature exports                                                |

## Message contract

Every message has a stable ID, type, direction, and timestamp. Provider ID,
AI attribution, status, and reactions are optional:

```ts
{
  id: string
  providerMessageId?: string
  type: ChatMessage['type']
  direction: 'incoming' | 'outgoing'
  aiGenerated?: boolean
  sentAt: string
  status?: 'sending' | 'error' | 'sent' | 'delivered' | 'read' | 'played'
  reactions?: Array<{ emoji: string; count?: number }>
}
```

The discriminated union covers text, image, video, document, voice, audio,
location, contact, location request, sticker, buttons, list, URL button, and
carousel messages. `ReplyActions` enforces WhatsApp's one-to-three reply-button
limit at compile time.

## Rendering and status

`MessageRow` owns direction, avatar placement, bubble shape, semantic colors,
forwarding markers, and metadata. `MessageContent` dispatches by message type.
`ChatTimelineItem` also supports centered non-message events.

Outgoing messages render `sending`, `error`, `sent`, `delivered`, `read`, or
`played` indicators. A missing outgoing provider status is treated as
`sending`. Incoming persisted messages begin at `delivered` because webhook
receipt confirms delivery to the application. Business AI standby echoes use
`aiGenerated` to display the AI marker.

Reactions appear in message metadata. When a message has a provider ID and a
human owns the conversation, pointer and keyboard context-menu actions can
open the emoji picker without asking the operator for provider identifiers.

## Ordering and scrolling invariant

Supply items oldest-first and newest-last. Keep the chat shell as a bounded
vertical flex container. Its message viewport uses:

```text
flex-1 min-h-0 overflow-y-auto flex-col-reverse
```

All chronologically ordered content belongs in one non-shrinking child. This
anchors the scroll origin at the bottom without reversing DOM order. Removing
the bounded shell, `min-h-0`, or the single content wrapper can make the
message stack expand the page. Pagination may prepend older items while the
bottom-relative position remains stable.

## Composer workflows

The Workspace mounts `ChatComposer` only while a human operator owns the
conversation. It supports text, images, videos, documents, prerecorded audio,
OGG/Opus voice notes, stickers, contacts, locations, and approved templates.
Interactive messages are deliberately not offered by the composer.

Media is staged through a presigned upload URL before the API sends it to
WhatsApp. Voice capture uses `opus-recorder` and its same-origin WebAssembly
worker, avoiding a dependency on native `MediaRecorder` OGG support or an
external CDN.

After 24 hours without an inbound customer message, ad-hoc controls are
disabled and the composer presents the template-message workflow. Template
selection groups names across languages, collects dynamic parameters, and
builds a live preview without sending example placeholders as real values.

## Media and rich content

Production media URLs are short-lived and authorized. Images and carousel
media open in a focus-trapped lightbox with keyboard, mouse, and touch zoom,
pan, rotation, flipping, and reset. Locations use MapLibre GL with public
OpenStreetMap raster tiles and require no map API key.

Message bodies, captions, and template previews share a safe formatter for
WhatsApp bold, italic, strikethrough, inline code, monospace blocks, quotes,
and lists. Provider text is never interpreted as HTML.

## Adding a message type

1. Add typed data and extend the `ChatMessage` union.
2. Add a rendering branch to `MessageContent`.
3. Add localized accessible labels and action feedback.
4. Add a fixture covering relevant status and reaction behavior.
5. Check narrow widths, long content, both themes, and bottom anchoring.

## Troubleshooting

- Reversed chronology means the adapter or consumer supplied the wrong item
  order; do not reverse individual flex children to compensate.
- A timeline that grows beyond its page usually lost `min-h-0`, its bounded
  parent, or the single non-shrinking content wrapper.
- Missing media should be diagnosed at the authorized media-URL boundary
  before changing renderers.
- A new provider payload shape belongs in the adapter until it has a stable
  normalized message type.
- Missing visible text or accessible names require entries in every locale.

## Verification

Run the Workspace typecheck and build. Exercise representative messages,
composer ownership states, the 24-hour template boundary, media controls,
keyboard navigation, narrow layouts, both themes, and all supported locales.

## Related documentation

- [Workspace components](../README.md)
- [Workspace frontend](../../../README.md)
- [Workspace assets](../../assets/README.md)
