export type AudioMimeType =
  'audio/aac' | 'audio/amr' | 'audio/mp4' | 'audio/mpeg' | 'audio/ogg'

export type DocumentMimeType =
  | 'application/msword'
  | 'application/pdf'
  | 'application/vnd.ms-excel'
  | 'application/vnd.ms-powerpoint'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain'

export type ImageMimeType = 'image/jpeg' | 'image/png'
export type StickerMimeType = 'image/webp'
export type VideoMimeType = 'video/3gpp' | 'video/mp4'

export type MediaKind = 'audio' | 'document' | 'image' | 'sticker' | 'video'

export interface MediaMimeTypes {
  audio: AudioMimeType
  document: DocumentMimeType
  image: ImageMimeType
  sticker: StickerMimeType
  video: VideoMimeType
}

interface UploadMediaBase<Kind extends MediaKind> {
  kind: Kind
  file: Blob
  filename: string
  mimeType: MediaMimeTypes[Kind]
}

export type UploadMediaInput = {
  [Kind in MediaKind]: UploadMediaBase<Kind>
}[MediaKind]

export type UploadAudioInput = Omit<UploadMediaBase<'audio'>, 'kind'>
export type UploadDocumentInput = Omit<UploadMediaBase<'document'>, 'kind'>
export type UploadImageInput = Omit<UploadMediaBase<'image'>, 'kind'>
export type UploadStickerInput = Omit<UploadMediaBase<'sticker'>, 'kind'>
export type UploadVideoInput = Omit<UploadMediaBase<'video'>, 'kind'>

export interface UploadMediaResponse {
  id: string
}

export interface MediaMetadata {
  messaging_product: 'whatsapp'
  url: string
  mime_type: string
  sha256: string
  file_size: string | number
  id: string
}

export interface DownloadedMedia {
  data: Uint8Array
  contentType: string | null
  contentLength: number | null
  contentDisposition: string | null
}

export interface DeleteMediaResponse {
  success: true
}

export interface MediaRequestOptions {
  signal?: AbortSignal
}

export const MEDIA_SIZE_LIMIT_BYTES = {
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  image: 5 * 1024 * 1024,
  sticker: 100 * 1024,
  video: 16 * 1024 * 1024,
} as const satisfies Record<MediaKind, number>
