import { createHash } from 'node:crypto'
import {
  findWhatsAppChannelById,
  type WhatsAppChannelConfiguration,
} from '@mba-demo/db'
import { files, type FileStore } from '@mba-demo/files'
import type { WhatsAppWebhook } from '@mba-demo/wa-webhooks'
import {
  createWhatsAppMediaClient,
  type WhatsAppMediaClientContract,
  type WhatsAppMediaClientOptions,
} from '@mba-demo/wa-media'

const MEDIA_UUID_NAMESPACE = Buffer.from(
  '75baebc4c7d94d04a4648feac68e6f17',
  'hex',
)

interface MediaReference {
  mediaId: string
  messageId: string
  mimeType?: string
}

type MediaChannelConfiguration = Pick<
  WhatsAppChannelConfiguration,
  'waPhoneNumberId' | 'waSystemUserAccessToken'
>

type FindChannel = (
  channelId: number,
) => Promise<MediaChannelConfiguration | undefined>

type MediaClient = Pick<WhatsAppMediaClientContract, 'download' | 'getMediaUrl'>

type CreateMediaClient = (options: WhatsAppMediaClientOptions) => MediaClient

export interface ArchiveWhatsAppMediaOptions {
  createMediaClient?: CreateMediaClient
  fileStore?: Pick<FileStore, 'put'>
  findChannel?: FindChannel
}

export async function archiveWhatsAppWebhookMedia(
  channelId: number,
  webhook: WhatsAppWebhook,
  {
    createMediaClient = createWhatsAppMediaClient,
    fileStore = files,
    findChannel = findWhatsAppChannelById,
  }: ArchiveWhatsAppMediaOptions = {},
): Promise<ReadonlyMap<string, string>> {
  const references = collectMediaReferences(webhook)
  if (references.length === 0) return new Map()

  const channel = await findChannel(channelId)
  if (!channel) throw new Error(`WhatsApp channel ${channelId} was not found`)

  const client = createMediaClient({
    accessToken: channel.waSystemUserAccessToken,
    phoneNumberId: channel.waPhoneNumberId,
  })
  const paths = await Promise.all(
    references.map(async (reference) => {
      const signal = AbortSignal.timeout(30_000)
      const metadata = await client.getMediaUrl(reference.mediaId, { signal })

      if (metadata.id !== reference.mediaId) {
        throw new Error(
          `WhatsApp media metadata ID does not match message ${reference.messageId}`,
        )
      }

      const downloaded = await client.download(metadata.url, { signal })

      const contentType = downloaded.contentType ?? metadata.mime_type
      const path = createWhatsAppMediaFilePath(
        channelId,
        reference.messageId,
        reference.mediaId,
        metadata.mime_type || reference.mimeType,
      )
      await fileStore.put(path, downloaded.data, { contentType })
      return [reference.messageId, path] as const
    }),
  )

  return new Map(paths)
}

export function createWhatsAppMediaFilePath(
  channelId: number,
  messageId: string,
  mediaId: string,
  mimeType: string | undefined,
): string {
  const uuid = deterministicUuid(`${String(channelId)}:${messageId}:${mediaId}`)
  const extension = extensionForMimeType(mimeType)
  return `whatsapp/media/${uuid.split('-').join('/')}/${uuid}.${extension}`
}

export function extensionForMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized ? (MIME_EXTENSIONS[normalized] ?? 'bin') : 'bin'
}

function collectMediaReferences(webhook: WhatsAppWebhook): MediaReference[] {
  const references: MediaReference[] = []

  for (const entry of webhook.entry) {
    for (const change of entry.changes) {
      const value = asRecord(change.value)

      switch (change.field) {
        case 'messages':
          collectMessageArray(value, 'messages', references)
          break
        case 'standby': {
          const standby = getRecord(value, 'standby')
          if (standby) collectMessageArray(standby, 'messages', references)
          break
        }
        case 'history':
          collectMessageArray(value, 'messages', references)
          for (const chunk of getRecords(value, 'history')) {
            for (const thread of getRecords(chunk, 'threads')) {
              collectMessageArray(thread, 'messages', references)
            }
          }
          break
        case 'smb_message_echoes':
          collectMessageArray(value, 'message_echoes', references)
          break
        default:
          break
      }
    }
  }

  return references
}

function collectMessageArray(
  value: Record<string, unknown>,
  key: string,
  references: MediaReference[],
): void {
  for (const message of getRecords(value, key)) {
    const reference = getMediaReference(message)
    if (reference) references.push(reference)
  }
}

function getMediaReference(
  message: Record<string, unknown>,
): MediaReference | undefined {
  const messageId = getString(message, 'id')
  if (!messageId) return undefined

  const type = getString(message, 'type')
  let media: Record<string, unknown> | undefined

  if (type && MEDIA_MESSAGE_TYPES.has(type)) {
    media = getRecord(message, type)
  } else if (type === 'edit') {
    const edited = getRecord(getRecord(message, 'edit'), 'message')
    const editedType = edited ? getString(edited, 'type') : undefined
    if (edited && editedType && MEDIA_MESSAGE_TYPES.has(editedType)) {
      media = getRecord(edited, editedType)
    }
  } else if (type === 'interactive') {
    const header = getRecord(getRecord(message, 'interactive'), 'header')
    const headerType = header ? getString(header, 'type') : undefined
    if (header && headerType && MEDIA_MESSAGE_TYPES.has(headerType)) {
      media = getRecord(header, headerType)
    }
  }

  if (!media) return undefined

  const mediaId = getString(media, 'id')
  if (!mediaId) return undefined

  return {
    mediaId,
    messageId,
    mimeType: getString(media, 'mime_type'),
  }
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha1')
    .update(MEDIA_UUID_NAMESPACE)
    .update(value)
    .digest()
    .subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function getRecord(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const candidate = value?.[key]
  return candidate !== null && typeof candidate === 'object'
    ? (candidate as Record<string, unknown>)
    : undefined
}

function getRecords(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const candidate = value[key]
  return Array.isArray(candidate)
    ? candidate.map(asRecord).filter((record) => Object.keys(record).length > 0)
    : []
}

function getString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key]
  return typeof candidate === 'string' ? candidate : undefined
}

const MEDIA_MESSAGE_TYPES = new Set([
  'audio',
  'document',
  'image',
  'sticker',
  'video',
])

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'video/3gpp': '3gp',
  'video/mp4': 'mp4',
}
