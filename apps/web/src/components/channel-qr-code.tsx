import {
  ChevronDown,
  Download,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  QrCode,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChannelQrState } from '../channel-qr'
import { Button, cn, Menu, MenuContent, MenuItem, MenuTrigger } from '@mba-desk/ui'

export function ChannelQrCode({
  phoneNumber,
  state,
  size = 'medium',
  className,
  showDownload = false,
  onEdit,
  onRemove,
}: {
  phoneNumber: string
  state: ChannelQrState
  size?: 'avatar' | 'small' | 'medium' | 'large'
  className?: string
  showDownload?: boolean
  onEdit?: () => void
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const imageFailed =
    state.imageUrl !== null && failedImageUrl === state.imageUrl
  const displayStatus = imageFailed ? 'error' : state.status
  const imageSize =
    size === 'avatar'
      ? 'size-full'
      : size === 'small'
        ? 'size-28'
        : size === 'large'
          ? 'size-64 max-w-full'
          : 'size-40'

  const download = async (format: 'SVG' | 'PNG') => {
    if (!state.imageUrl) return

    const response = await fetch(state.imageUrl)
    if (!response.ok) return
    const source = await response.blob()
    const fileName = `whatsapp-qr-${state.code ?? phoneNumber}.${format.toLowerCase()}`
    let objectUrl: string

    if (format === 'SVG') {
      objectUrl = URL.createObjectURL(source)
    } else {
      const sourceUrl = URL.createObjectURL(source)
      try {
        const image = new Image()
        image.src = sourceUrl
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth || 1024
        canvas.height = image.naturalHeight || 1024
        canvas.getContext('2d')?.drawImage(image, 0, 0)
        const png = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        )
        if (!png) return
        objectUrl = URL.createObjectURL(png)
      } finally {
        URL.revokeObjectURL(sourceUrl)
      }
    }

    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <section
      className={cn(
        size === 'avatar'
          ? 'grid size-16 place-items-center overflow-hidden border bg-white text-center'
          : 'grid place-items-center gap-3 rounded-xl border bg-card p-4 text-center',
        className,
      )}
      aria-label={t('channels.qr.title')}
    >
      {displayStatus === 'available' && state.imageUrl ? (
        <>
          <div
            className={cn(
              size === 'avatar'
                ? 'size-full bg-white'
                : 'rounded-xl border bg-white p-2 shadow-xs',
            )}
          >
            <img
              className={cn('object-contain', imageSize)}
              src={state.imageUrl}
              alt={t('channels.qr.alt', { phone: phoneNumber })}
              onError={() => setFailedImageUrl(state.imageUrl)}
            />
          </div>
          {state.prefilledMessage && size !== 'small' && size !== 'avatar' && (
            <p className="flex max-w-sm items-start justify-center gap-2 text-xs leading-5 text-muted-foreground">
              <MessageSquareText
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
              <span>{state.prefilledMessage}</span>
            </p>
          )}
          {showDownload && (
            <Menu className="w-full max-w-64">
              <MenuTrigger className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:bg-primary/80">
                <Download className="size-4" aria-hidden />
                {t('channels.qr.download')}
                <ChevronDown className="ml-auto size-4" aria-hidden />
              </MenuTrigger>
              <MenuContent className="w-full min-w-0" align="start">
                <MenuItem onClick={() => void download('PNG')}>
                  {t('channels.qr.downloadFormat', { format: 'PNG' })}
                </MenuItem>
                <MenuItem onClick={() => void download('SVG')}>
                  {t('channels.qr.downloadFormat', { format: 'SVG' })}
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
          {(onEdit || onRemove) && (
            <div className="grid w-full max-w-64 grid-cols-2 gap-2">
              {onEdit && (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={onEdit}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  {t('channels.qr.edit')}
                </Button>
              )}
              {onRemove && (
                <Button
                  size="sm"
                  type="button"
                  variant="danger"
                  onClick={onRemove}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  {t('channels.qr.remove')}
                </Button>
              )}
            </div>
          )}
        </>
      ) : displayStatus === 'loading' ? (
        <div
          className={cn(
            size === 'avatar'
              ? 'grid place-items-center bg-muted/50 text-muted-foreground'
              : 'grid place-items-center rounded-xl bg-muted/50 text-muted-foreground',
            imageSize,
          )}
          role="status"
        >
          <LoaderCircle className="size-6 animate-spin" aria-hidden />
          <span className="sr-only">{t('channels.qr.loading')}</span>
        </div>
      ) : (
        <div
          className={cn(
            size === 'avatar'
              ? 'grid place-items-center bg-muted/40 text-muted-foreground'
              : 'grid place-items-center gap-2 rounded-xl bg-muted/40 p-4 text-muted-foreground',
            imageSize,
          )}
        >
          <QrCode
            className={size === 'avatar' ? 'size-5' : 'size-7'}
            aria-hidden
          />
          <p
            className={cn(
              'text-xs font-semibold',
              size === 'avatar' && 'sr-only',
            )}
          >
            {t(
              displayStatus === 'empty'
                ? 'channels.qr.empty'
                : 'channels.qr.error',
            )}
          </p>
        </div>
      )}
    </section>
  )
}
