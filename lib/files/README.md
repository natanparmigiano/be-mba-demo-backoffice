# Files

`@mba-demo/files` provides one object-storage contract with filesystem and S3-compatible adapters. Both adapters support `get`, `put`, `delete`, and expiring upload/download URLs.

The filesystem adapter stores file bodies and metadata below `FILES_DIRECTORY`. Its URLs are HMAC-signed links to the API's `GET` and `PUT /api/files/signed` handlers. A signed URL is a bearer credential: keep its lifetime short and do not log or persist it unnecessarily.

The S3 adapter uses native SigV4 presigned URLs. `FILES_S3_ENDPOINT` is used by the application for object operations; `FILES_S3_PUBLIC_ENDPOINT` is used only when generating URLs for clients. This distinction lets a Compose app reach `http://minio:9000` while a browser uses `http://localhost:9000`.

## API

```ts
import { files } from '@mba-demo/files'

await files.put('organizations/123/avatar.png', bytes, {
  contentType: 'image/png',
})

const uploadUrl = await files.signUrl('organizations/123/document.pdf', {
  operation: 'upload',
  contentType: 'application/pdf',
  expiresInSeconds: 300,
})

const downloadUrl = await files.signUrl('organizations/123/avatar.png', {
  operation: 'download',
})
```

File keys are relative slash-separated paths. Empty, absolute, dot-segment, backslash, NUL, and keys longer than 1,024 UTF-8 bytes are rejected consistently by both adapters. Deletes are idempotent.

## Configuration

Set `FILES_ADAPTER=fs` (the default) or `FILES_ADAPTER=s3`.

| Variable                     | Mode | Purpose                                                       |
| ---------------------------- | ---- | ------------------------------------------------------------- |
| `FILES_DIRECTORY`            | FS   | Persistent storage root; defaults to `.data/files`            |
| `FILES_PUBLIC_URL`           | FS   | Public API origin/base path used in signed URLs               |
| `FILES_SIGNING_SECRET`       | FS   | Private HMAC secret; required in production                   |
| `FILES_S3_BUCKET`            | S3   | Bucket name                                                   |
| `FILES_S3_CREATE_BUCKET`     | S3   | Lazily creates a missing bucket for local/demo infrastructure |
| `FILES_S3_REGION`            | S3   | Signing region; defaults to `us-east-1`                       |
| `FILES_S3_ENDPOINT`          | S3   | Optional application-facing S3-compatible endpoint            |
| `FILES_S3_PUBLIC_ENDPOINT`   | S3   | Optional client-facing endpoint used for presigning           |
| `FILES_S3_FORCE_PATH_STYLE`  | S3   | `true` or `false`; defaults to `true` with a custom endpoint  |
| `FILES_S3_ACCESS_KEY_ID`     | S3   | Static access key; configure together with the secret         |
| `FILES_S3_SECRET_ACCESS_KEY` | S3   | Static secret key; configure together with the access key     |

When static S3 credentials are omitted, the AWS SDK default credential provider chain is used. External clients are initialized lazily by the SDK. Applications must call `files.close()` during graceful shutdown.
