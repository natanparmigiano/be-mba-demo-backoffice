# Chat message system

This folder converts normalized `ChatMessage` values into accessible,
WhatsApp-style conversations. Provider payloads must be adapted outside the
renderer, and timeline items must arrive oldest-first/newest-last; those two
boundaries keep provider changes and scroll behavior out of presentation code.

## Files

- `types.ts`: discriminated message union and supporting contact/action types.
- `MessageRenderer.tsx`: content renderers, message chrome, reactions, timestamps, and delivery status.
- `ImageLightbox.tsx`: accessible full-screen image viewing with mouse, keyboard, and touch transforms.
- `EmojiPicker.tsx`: searchable, categorized Emoji 16 browser backed by the bundled JSON asset.
- `ChatComposer.tsx`: human-handoff text, media, voice, contact, location, and template composition.
- `TemplateMessageDialog.tsx`: approved-template selection, live preview, parameter extraction, and send-payload adaptation.
- `WhatsAppText.tsx`: safe WhatsApp-style formatting for message bodies, captions, and template previews.
- `fixtures.ts`: localized sample conversations for the public component showcase.
- `ChatShowcase.tsx`: reusable bounded conversation shell, composer demo, and action feedback. Its compact `workspace` variant accepts contact, message, header-action, persistent-notice, and message-flow context slots for full-screen conversation surfaces.
- `index.ts`: public feature export.

## Message contract

Every message includes:

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

`ChatMessage` is a discriminated union supporting:

| Type               | Type-specific data                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `text`             | Text body.                                                                                                   |
| `image`            | URL, alt text, and optional caption.                                                                         |
| `video`            | URL and optional caption.                                                                                    |
| `document`         | Filename, MIME type, optional size and caption.                                                              |
| `voice`            | Duration, waveform samples, and optional progress.                                                           |
| `audio`            | Title, optional artist, and duration.                                                                        |
| `location`         | Coordinates, location name, and address.                                                                     |
| `contact`          | Standard contact fields: structured name, organization/title, birthday, phones, emails, addresses, and URLs. |
| `location-request` | Prompt and action label.                                                                                     |
| `sticker`          | Image URL and alt text.                                                                                      |
| `buttons`          | Body, optional footer, and one to three reply actions.                                                       |
| `list`             | Title, body, button label, and titled sections containing described rows.                                    |
| `url-button`       | Body, link label, and URL.                                                                                   |
| `carousel`         | Media cards with title, optional description, and optional action.                                           |

The `ReplyActions` tuple union enforces the one-to-three-button limit at compile time. MIME-aware document presentation currently distinguishes PDF, spreadsheet/CSV, image, archive, code/text, and generic files.

## Status and reactions

Outgoing status indicators follow the product contract:

- `sending`: clock; also used when an outgoing message has no provider status yet.
- `error`: X using the destructive status color.
- `sent`: one check.
- `delivered`: two checks.
- `read`: two checks using the read-status blue token.
- `played`: a sound icon using the read-status blue token.

Incoming messages render their persisted status, which begins at `delivered`
because receipt of the webhook confirms delivery to the application. Outgoing
messages without a provider status render `sending`.
Reactions appear inline in message metadata and may include an optional count.
When a normalized message carries its provider ID and the conversation is
human-owned, right-clicking the row (or using the keyboard context-menu action)
opens the reaction action and the full emoji picker. Users never enter provider
message IDs manually.

## Rendering architecture

`MessageRow` owns direction, avatar placement, bubble shape, semantic incoming/outgoing colors, forwarding indicators, and metadata. Consumers may provide `incomingAvatarName` when the active conversation is not the design-system fixture contact. `MessageContent` switches on `message.type` and delegates complex types to focused renderers in the same file. `ChatTimelineItem` adds non-message activity; `ChatShowcase` renders those events as centered chips between chronologically adjacent messages. The workspace uses `onConversationRendered` to acknowledge the latest inbound provider message only after the timeline has committed to the DOM.

Messages projected from Business AI standby echoes set `aiGenerated` and show
a compact sparkle-and-AI marker next to their delivery status.

Interactive content reports demo actions through `onAction(label)`. The showcase displays that result in a dismissible status strip; production consumers should map stable action IDs to application behavior rather than relying on translated labels.

## Scrolling and ordering invariant

Supply timeline items in chronological order: oldest first, newest last.
Message rows and centered event chips remain in that same DOM order.

The chat shell is a bounded vertical flex container. Its header, status legend, optional action strip, and composer are non-shrinking. The message viewport uses:

```text
flex-1 min-h-0 overflow-y-auto flex-col-reverse
```

All chronologically ordered content lives inside one `shrink-0` child. `flex-col-reverse` therefore anchors the scroll origin at the bottom without visually reversing individual messages. New outgoing messages append to the array and remain at the bottom. Do not map messages as separate reversed flex children unless both DOM and visual ordering are handled deliberately.

This containment is important: removing `min-h-0`, the bounded shell, or the non-shrinking content wrapper can allow the message stack to inflate the surrounding page.

Consumers that paginate a production timeline can receive the message viewport through `messagesViewportRef`. Place a loading sentinel in `messagesHeader` to prefetch older cursor pages as it approaches the top; prepending items preserves the bottom-relative position established by the reversed viewport.

## Fixtures and media

`createInitialMessages(t)` builds localized fixtures. The showcase currently uses:

- `https://placehold.co/` for sample images and stickers;
- Google's public Big Buck Bunny MP4 for video.

These are demonstration resources, not production media infrastructure. The production chat adapter receives short-lived, authorized media URLs from the timeline API for archived webhook media. Document controls fetch those URLs into a browser download, audio controls track real playback progress, and voice notes decode their audio data to calculate waveform peaks.

Selecting an image, sticker, or carousel image opens the shared lightbox. It
supports wheel/button/pinch zoom, pointer or touch panning, quarter-turn
rotation, horizontal and vertical flipping, reset, focus trapping, and keyboard
controls (`+`, `-`, `0`, arrow keys, and Escape).

Location messages use MapLibre GL with OpenStreetMap's public raster tiles and
require no map API key. Their compact map is passive inside the message bubble;
selecting it opens an interactive map dialog with pan and zoom controls.
Shared-contact actions similarly open a dialog containing every projected
contact field and actionable phone, email, and web links.

## Production composer

`ChatComposer` is mounted by the workspace only while a human operator owns the
conversation; AI ownership removes it from the layout. It sends text, images,
videos, documents, prerecorded audio, recorded voice notes, stickers, contacts,
locations, and templates. Interactive messages are deliberately not offered.
The emoji menu inserts at the input cursor and exposes the complete bundled
Emoji 16 list through localized category tabs and search. Reactions are a
message-row action rather than a composer attachment.

Caption-capable media selection preserves its optional caption while the
browser stages the file with a presigned upload URL and the API uploads it to
WhatsApp. Recorded voice messages are always captured and uploaded as
`audio/ogg`, never expose a caption field, and provide local playback before
sending. `opus-recorder` captures the shared Web Audio microphone source and
encodes mono, voice-mode Opus into OGG through its same-origin bundled
WebAssembly worker, so recording does not depend on native `MediaRecorder` OGG
support or an external CDN. While recording, Web Audio frequency samples drive
a live waveform in the input region alongside the elapsed timer.

Opening the template composer loads approved definitions from the selected
chat's WABA. Template names are grouped across their available languages;
switching either selection regenerates named or positional text inputs,
dynamic URL/copy-code controls, and header media or location inputs. Examples
act as preview placeholders rather than values sent to customers. The live
preview substitutes entered values, and additional Meta pages can be loaded
without discarding the current selection.

After 24 hours without an inbound customer message, the composer disables its
ad-hoc message controls and replaces the text input with a template-message
action. That action opens the same template composer used by the attachment
menu and the regular composer returns when a new inbound message arrives.

Sent templates render as dedicated cards with their display name, language,
and resolved text preview. The composer stores that preview alongside new
outbound template messages; older records retain the card and show a localized
fallback when no resolved preview was stored.

Message bodies, media captions, and template previews share the same safe text
renderer. It supports WhatsApp bold (`*text*`), italic (`_text_`),
strikethrough (`~text~`), inline code (`` `text` ``), monospace
(` ```text``` `), quote (`> text`), bulleted (`* text` or `- text`), and
numbered list (`1. text`) conventions without interpreting provider text as
HTML.

## WhatsApp Cloud API integration boundary

Adapt webhook/API payloads before they reach the renderer. The adapter should
produce `ChatMessage` values with stable IDs, direction, localized display
metadata, reactions, and normalized statuses. This keeps provider-version
changes out of UI code.

When adding a message type:

1. Add its interface and include it in `ChatMessage`.
2. Add a rendering branch to `MessageContent`.
3. Add localized accessible labels and action feedback.
4. Add at least one fixture covering status/reaction behavior where applicable.
5. Verify narrow widths, long text, both themes, and bottom-anchored scrolling.
