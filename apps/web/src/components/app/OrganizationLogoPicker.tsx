import { ImagePlus, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, Input } from '@mba-desk/ui'
import { OrganizationLogo } from './OrganizationLogo'

const OUTPUT_SIZE = 512

export function OrganizationLogoPicker({
  organization,
  value,
  onChange,
  disabled = false,
}: {
  organization?: { id: string; logo?: string | null } | null
  value: Blob | null
  onChange: (value: Blob | null, removeExisting?: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
  }

  const closeCropper = () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    setSourceUrl(null)
  }

  return (
    <>
      <div className="grid gap-2">
        <span className="text-sm font-semibold">{t('organizations.logo')}</span>
        <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
          {previewUrl ? (
            <img
              className="size-14 rounded-xl object-cover"
              src={previewUrl}
              alt=""
            />
          ) : (
            <OrganizationLogo organization={organization} className="size-14" />
          )}
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {t('organizations.selectLogo')}
            </Button>
            {(value || organization?.logo) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(null, true)}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('organizations.removeLogo')}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('organizations.logoHint')}
        </p>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={selectFile}
          disabled={disabled}
        />
      </div>
      <LogoCropDialog
        sourceUrl={sourceUrl}
        onClose={closeCropper}
        onCrop={(blob) => {
          onChange(blob)
          closeCropper()
        }}
      />
    </>
  )
}

function LogoCropDialog({
  sourceUrl,
  onClose,
  onCrop,
}: {
  sourceUrl: string | null
  onClose: () => void
  onCrop: (blob: Blob) => void
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [isCropping, setIsCropping] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    offsetX: number
    offsetY: number
  } | null>(null)

  useEffect(() => {
    if (!sourceUrl) {
      setImage(null)
      return
    }
    const nextImage = new Image()
    nextImage.onload = () => setImage(nextImage)
    nextImage.src = sourceUrl
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
  }, [sourceUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    drawCrop(canvas, image, zoom, offsetX, offsetY)
  }, [image, offsetX, offsetY, zoom])

  const confirmCrop = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsCropping(true)
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error('Crop failed')),
          'image/png',
        ),
      )
      onCrop(blob)
    } finally {
      setIsCropping(false)
    }
  }

  const panTo = (nextX: number, nextY: number) => {
    if (!image) return
    const { maxOffsetX, maxOffsetY } = getMaxOffsets(image, zoom)
    setOffsetX(clamp(nextX, -maxOffsetX, maxOffsetX))
    setOffsetY(clamp(nextY, -maxOffsetY, maxOffsetY))
  }

  const startPan = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!image) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX,
      offsetY,
    }
  }

  const movePan = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const scale =
      OUTPUT_SIZE / event.currentTarget.getBoundingClientRect().width
    panTo(
      drag.offsetX + (event.clientX - drag.x) * scale,
      drag.offsetY + (event.clientY - drag.y) * scale,
    )
  }

  const stopPan = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const panWithKeyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const distance = event.shiftKey ? 25 : 10
    const movements: Partial<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    }
    const movement = movements[event.key]
    if (!movement) return
    event.preventDefault()
    panTo(offsetX + movement[0], offsetY + movement[1])
  }

  return (
    <Dialog
      open={Boolean(sourceUrl)}
      onOpenChange={(open) => !open && onClose()}
      title={t('organizations.cropLogoTitle')}
      description={t('organizations.cropLogoDescription')}
      size="lg"
    >
      <div className="grid w-full gap-5">
        <canvas
          ref={canvasRef}
          width={OUTPUT_SIZE}
          height={OUTPUT_SIZE}
          className="mx-auto aspect-square w-full max-w-sm touch-none cursor-grab rounded-2xl border bg-muted object-contain outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          role="img"
          tabIndex={image ? 0 : -1}
          aria-label={t('organizations.cropLogoPreview')}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onKeyDown={panWithKeyboard}
        />
        <div className="grid gap-3">
          <Input
            label={t('organizations.logoZoom')}
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => {
              const nextZoom = Number(event.target.value)
              setZoom(nextZoom)
              if (!image) return
              const { maxOffsetX, maxOffsetY } = getMaxOffsets(image, nextZoom)
              setOffsetX((value) => clamp(value, -maxOffsetX, maxOffsetX))
              setOffsetY((value) => clamp(value, -maxOffsetY, maxOffsetY))
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('organizations.cancel')}
          </Button>
          <Button
            type="button"
            isLoading={isCropping}
            disabled={!image}
            onClick={() => void confirmCrop()}
          >
            {t('organizations.useLogo')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const context = canvas.getContext('2d')
  if (!context) return
  const scale =
    Math.max(
      OUTPUT_SIZE / image.naturalWidth,
      OUTPUT_SIZE / image.naturalHeight,
    ) * zoom
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const { maxOffsetX, maxOffsetY } = getMaxOffsets(image, zoom)
  const x = (OUTPUT_SIZE - width) / 2 + clamp(offsetX, -maxOffsetX, maxOffsetX)
  const y = (OUTPUT_SIZE - height) / 2 + clamp(offsetY, -maxOffsetY, maxOffsetY)

  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  context.drawImage(image, x, y, width, height)
}

function getMaxOffsets(image: HTMLImageElement, zoom: number) {
  const scale =
    Math.max(
      OUTPUT_SIZE / image.naturalWidth,
      OUTPUT_SIZE / image.naturalHeight,
    ) * zoom
  return {
    maxOffsetX: Math.max(0, (image.naturalWidth * scale - OUTPUT_SIZE) / 2),
    maxOffsetY: Math.max(0, (image.naturalHeight * scale - OUTPUT_SIZE) / 2),
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
