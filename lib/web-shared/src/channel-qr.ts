import { apiClient } from './api'

export type ChannelQrStatus = 'loading' | 'available' | 'empty' | 'error'

export interface ChannelQrState {
  status: ChannelQrStatus
  code: string | null
  imageUrl: string | null
  deepLinkUrl: string | null
  prefilledMessage: string | null
}

export function emptyChannelQrState(status: ChannelQrStatus): ChannelQrState {
  return {
    status,
    code: null,
    imageUrl: null,
    deepLinkUrl: null,
    prefilledMessage: null,
  }
}

export async function fetchChannelQrState(
  channelId: number,
): Promise<ChannelQrState> {
  try {
    const response = await apiClient.api.channels[':id']['qr-code'].$get({
      param: { id: String(channelId) },
    })
    if (!response.ok) return emptyChannelQrState('error')
    const { qrCode } = (await response.json()) as {
      qrCode: null | {
        code: string
        imageUrl: string | null
        deepLinkUrl: string | null
        prefilledMessage: string | null
      }
    }
    if (!qrCode) return emptyChannelQrState('empty')
    if (!qrCode.imageUrl) return emptyChannelQrState('error')
    return {
      status: 'available',
      code: qrCode.code,
      imageUrl: qrCode.imageUrl,
      deepLinkUrl: qrCode.deepLinkUrl,
      prefilledMessage: qrCode.prefilledMessage,
    }
  } catch {
    return emptyChannelQrState('error')
  }
}
