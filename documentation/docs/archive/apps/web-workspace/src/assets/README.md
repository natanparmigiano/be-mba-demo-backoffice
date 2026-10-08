# Workspace-local assets

This directory contains assets bundled only by the Workspace frontend. It
currently owns the Emoji 16 category data used by the chat composer and
message-reaction picker. Shared brand artwork lives in
`@mba-desk/web-shared`.

## Quick start

Import local assets so Vite fingerprints them:

```tsx
import emojiData from '../../assets/emoji-categories.json'
```

Use `public/` only when an external consumer requires a stable, unhashed root
URL.

## Emoji data

`emoji-categories.json` is based on
`chalda-pnuzig/emojis.json`'s `dist/categories.min.json` under its ISC license.
Keep it bundled; the browser must not fetch emoji metadata from an external URL
at runtime.

## Conventions

- Use descriptive lowercase kebab-case names.
- Prefer SVG for monochrome interface artwork.
- Use an empty `alt` for decorative images and localized alternative text
  when the image is the only meaningful content.
- Do not bundle user-generated or remote conversation media.
- Never edit generated `dist/` output.

## Troubleshooting

Shared signifiers and login artwork must be imported from
`@mba-desk/web-shared`, not from this directory.

## Verification

Build the Workspace frontend and exercise emoji search and category browsing.

## Related documentation

- [Chat message system](../components/chat/README.md)
- [Workspace source map](../README.md)
