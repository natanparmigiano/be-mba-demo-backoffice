import { LoaderCircle, MessageSquareText, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChannelQrState } from '../channel-qr'
import { cn } from './ui'

export function ChannelQrCode({
  phoneNumber,
  state,
  size = 'medium',
  className,
}: {
  phoneNumber: string
  state: ChannelQrState
  size?: 'avatar' | 'small' | 'medium' | 'large'
  className?: string
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
