# Chat message system

This folder contains the typed frontend model and renderer for WhatsApp-style conversations. It is currently a design-system showcase and a foundation for future WhatsApp Cloud API and human-handover integration.

## Files

- `types.ts`: discriminated message union and supporting contact/action types.
- `MessageRenderer.tsx`: content renderers, message chrome, reactions, timestamps, and delivery status.
- `fixtures.ts`: localized sample conversation covering every supported message type.
- `ChatShowcase.tsx`: bounded conversation shell, composer demo, and action feedback.
- `index.ts`: public feature export.

## Message contract

Every message includes:

```ts
{
  id: string
  type: ChatMessage['type']
  direction: 'incoming' | 'outgoing'
  sentAt: string
  status?: 'undelivered' | 'delivered' | 'read'
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

- `undelivered`: one check.
- `delivered`: two checks.
- `read`: two checks using the read-status blue token.

Incoming messages do not render delivery indicators. Reactions appear inline in message metadata and may include an optional count.

## Rendering architecture

`MessageRow` owns direction, avatar placement, bubble shape, semantic incoming/outgoing colors, and metadata. `MessageContent` switches on `message.type` and delegates complex types to focused renderers in the same file.

Interactive content reports demo actions through `onAction(label)`. The showcase displays that result in a dismissible status strip; production consumers should map stable action IDs to application behavior rather than relying on translated labels.

## Scrolling and ordering invariant

Messages are supplied in chronological order: oldest first, newest last.

The chat shell is a bounded vertical flex container. Its header, status legend, optional action strip, and composer are non-shrinking. The message viewport uses:

```text
flex-1 min-h-0 overflow-y-auto flex-col-reverse
```

All chronologically ordered content lives inside one `shrink-0` child. `flex-col-reverse` therefore anchors the scroll origin at the bottom without visually reversing individual messages. New outgoing messages append to the array and remain at the bottom. Do not map messages as separate reversed flex children unless both DOM and visual ordering are handled deliberately.

This containment is important: removing `min-h-0`, the bounded shell, or the non-shrinking content wrapper can allow the message stack to inflate the surrounding page.

## Fixtures and media

`createInitialMessages(t)` builds localized fixtures. The showcase currently uses:

- `https://placehold.co/` for sample images and stickers;
- Google's public Big Buck Bunny MP4 for video.

These are demonstration resources, not production media infrastructure. Production rendering should receive authorized media URLs or resolved blobs from the application data layer.

## WhatsApp Cloud API integration boundary

Keep webhook/API payloads outside the renderer. Add an adapter that converts external payloads into `ChatMessage` values, including stable IDs, direction, localized display metadata, reactions, and normalized statuses. This keeps provider-version changes out of UI code.

When adding a message type:

1. Add its interface and include it in `ChatMessage`.
2. Add a rendering branch to `MessageContent`.
3. Add localized accessible labels and action feedback.
4. Add at least one fixture covering status/reaction behavior where applicable.
5. Verify narrow widths, long text, both themes, and bottom-anchored scrolling.
