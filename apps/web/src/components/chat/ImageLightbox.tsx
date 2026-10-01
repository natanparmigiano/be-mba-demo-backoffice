import {
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_STEP = 0.25

interface Point {
  x: number
  y: number
}

interface PinchStart {
  distance: number
  midpoint: Point
  offset: Point
  scale: number
}

export function LightboxImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const panStartRef = useRef<{ pointer: Point; offset: Point } | undefined>(
    undefined,
  )
  const pinchStartRef = useRef<PinchStart | undefined>(undefined)
  const scaleRef = useRef(scale)
  const titleId = useId()
  const descriptionId = useId()

  const reset = useCallback(() => {
    setScale(1)
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setOffset({ x: 0, y: 0 })
  }, [])

  const close = useCallback(() => setOpen(false), [])

  scaleRef.current = scale

  const updateScale = useCallback((nextScale: number) => {
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
    setScale(clampedScale)
    if (clampedScale <= 1) setOffset({ x: 0, y: 0 })
  }, [])

  const changeZoom = useCallback((amount: number) => {
    setScale((currentScale) => {
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, currentScale + amount),
      )
      if (nextScale <= 1) setOffset({ x: 0, y: 0 })
      return nextScale
    })
  }, [])

  const zoomAt = useCallback((factor: number, clientPoint?: Point) => {
    setScale((currentScale) => {
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, currentScale * factor),
      )
      if (nextScale <= 1) {
        setOffset({ x: 0, y: 0 })
        return nextScale
      }

      const stage = stageRef.current
      if (clientPoint && stage) {
        const bounds = stage.getBoundingClientRect()
        const point = {
          x: clientPoint.x - bounds.left - bounds.width / 2,
          y: clientPoint.y - bounds.top - bounds.height / 2,
        }
        setOffset((currentOffset) => ({
          x: point.x - (point.x - currentOffset.x) * (nextScale / currentScale),
          y: point.y - (point.y - currentOffset.y) * (nextScale / currentScale),
        }))
      }
      return nextScale
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        changeZoom(ZOOM_STEP)
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        changeZoom(-ZOOM_STEP)
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        reset()
        return
      }
      if (event.key.startsWith('Arrow') && scaleRef.current > 1) {
        event.preventDefault()
        const distance = event.shiftKey ? 40 : 12
        setOffset((current) => ({
          x:
            current.x +
            (event.key === 'ArrowLeft'
              ? distance
              : event.key === 'ArrowRight'
                ? -distance
                : 0),
          y:
            current.y +
            (event.key === 'ArrowUp'
              ? distance
              : event.key === 'ArrowDown'
                ? -distance
                : 0),
        }))
        return
      }
      if (event.key !== 'Tab') return

      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled)',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
      pointersRef.current.clear()
    }
  }, [changeZoom, close, open, reset, zoomAt])

  const onPointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size === 1) {
      panStartRef.current = {
        pointer: { x: event.clientX, y: event.clientY },
        offset,
      }
      return
    }

    const points = [...pointersRef.current.values()]
    const first = points[0]
    const second = points[1]
    if (!first || !second) return
    pinchStartRef.current = {
      distance: distanceBetween(first, second),
      midpoint: midpointBetween(first, second),
      offset,
      scale,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const points = [...pointersRef.current.values()]
    if (points.length >= 2 && pinchStartRef.current) {
      const first = points[0]
      const second = points[1]
      if (!first || !second) return
      const start = pinchStartRef.current
      const midpoint = midpointBetween(first, second)
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(
          MIN_SCALE,
          start.scale * (distanceBetween(first, second) / start.distance),
        ),
      )
      setScale(nextScale)
      setOffset({
        x:
          start.offset.x +
          (midpoint.x - start.midpoint.x) * (nextScale > 1 ? 1 : 0),
        y:
          start.offset.y +
          (midpoint.y - start.midpoint.y) * (nextScale > 1 ? 1 : 0),
      })
      return
    }

    if (scale > 1 && panStartRef.current) {
      setOffset({
        x:
          panStartRef.current.offset.x +
          event.clientX -
          panStartRef.current.pointer.x,
        y:
          panStartRef.current.offset.y +
          event.clientY -
          panStartRef.current.pointer.y,
      })
    }
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLImageElement>) => {
    pointersRef.current.delete(event.pointerId)
    pinchStartRef.current = undefined
    const remaining = [...pointersRef.current.values()][0]
    panStartRef.current = remaining ? { pointer: remaining, offset } : undefined
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomAt(Math.exp(-event.deltaY * 0.002), {
      x: event.clientX,
      y: event.clientY,
    })
  }

  const transformStyle: CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg) scale(${scale * (flipX ? -1 : 1)}, ${scale * (flipY ? -1 : 1)})`,
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="group relative block w-full cursor-zoom-in rounded-[inherit] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        aria-label={t('chat.openImage', { alt })}
      >
        <img className={className} src={src} alt={alt} />
        <span className="pointer-events-none absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-lightbox-surface/80 text-lightbox-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="size-4" aria-hidden />
        </span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-[100] flex flex-col bg-lightbox text-lightbox-foreground"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <div className="relative z-10 flex shrink-0 items-center gap-2 border-b border-lightbox-border bg-lightbox-surface/90 px-2 py-2 backdrop-blur-md sm:px-4">
              <p className="hidden min-w-0 flex-1 truncate text-sm sm:block">
                {alt}
              </p>
              <div
                className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto sm:justify-center"
                role="toolbar"
                aria-label={t('chat.imageControls')}
              >
                <LightboxControl
                  label={t('chat.zoomOut')}
                  disabled={scale <= MIN_SCALE}
                  onClick={() => changeZoom(-ZOOM_STEP)}
                >
                  <ZoomOut />
                </LightboxControl>
                <span className="w-12 shrink-0 text-center text-xs tabular-nums">
                  {Math.round(scale * 100)}%
                </span>
                <LightboxControl
                  label={t('chat.zoomIn')}
                  disabled={scale >= MAX_SCALE}
                  onClick={() => changeZoom(ZOOM_STEP)}
                >
                  <ZoomIn />
                </LightboxControl>
                <ToolbarDivider />
                <LightboxControl
                  label={t('chat.rotateLeft')}
                  onClick={() => setRotation((value) => value - 90)}
                >
                  <RotateCcw />
                </LightboxControl>
                <LightboxControl
                  label={t('chat.rotateRight')}
                  onClick={() => setRotation((value) => value + 90)}
                >
                  <RotateCw />
                </LightboxControl>
                <ToolbarDivider />
                <LightboxControl
                  label={t('chat.flipHorizontal')}
                  pressed={flipX}
                  onClick={() => setFlipX((value) => !value)}
                >
                  <FlipHorizontal2 />
                </LightboxControl>
                <LightboxControl
                  label={t('chat.flipVertical')}
                  pressed={flipY}
                  onClick={() => setFlipY((value) => !value)}
                >
                  <FlipVertical2 />
                </LightboxControl>
                <ToolbarDivider />
                <LightboxControl label={t('chat.resetImage')} onClick={reset}>
                  <Undo2 />
                </LightboxControl>
              </div>
              <div className="flex flex-1 justify-end">
                <LightboxControl
                  ref={closeRef}
                  label={t('chat.closeImageViewer')}
                  onClick={close}
                >
                  <X />
                </LightboxControl>
              </div>
            </div>

            <div
              ref={stageRef}
              className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-4 sm:p-8"
              onClick={(event) => {
                if (event.target === event.currentTarget) close()
              }}
              onWheel={onWheel}
            >
              <h2 id={titleId} className="sr-only">
                {t('chat.imageViewerTitle')}
              </h2>
              <p id={descriptionId} className="sr-only">
                {t('chat.imageViewerDescription')}
              </p>
              <img
                className={cn(
                  'max-h-full max-w-full touch-none select-none object-contain will-change-transform',
                  scale > 1
                    ? 'cursor-grab active:cursor-grabbing'
                    : 'cursor-zoom-in',
                )}
                src={src}
                alt={alt}
                draggable={false}
                style={transformStyle}
                onDoubleClick={(event) => {
                  if (scale === 1) {
                    zoomAt(2, { x: event.clientX, y: event.clientY })
                  } else {
                    updateScale(1)
                  }
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <p className="rounded-full bg-lightbox-surface/80 px-3 py-1.5 text-center text-xs text-lightbox-foreground/80 backdrop-blur-sm">
                  {t('chat.imageViewerHint')}
                </p>
              </div>
              <p className="sr-only" aria-live="polite">
                {t('chat.imageTransform', {
                  zoom: Math.round(scale * 100),
                  rotation: ((rotation % 360) + 360) % 360,
                })}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

const LightboxControl = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    pressed?: boolean
    children: ReactNode
  }
>(function LightboxControl(
  { label, pressed, children, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-lightbox-foreground transition-colors hover:bg-lightbox-foreground/15 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-lightbox-foreground/35 disabled:cursor-default disabled:opacity-35',
        pressed && 'bg-lightbox-foreground/20',
        className,
      )}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      {...props}
    >
      <span className="[&>svg]:size-5" aria-hidden>
        {children}
      </span>
    </button>
  )
})

function ToolbarDivider() {
  return (
    <span className="mx-1 h-6 w-px shrink-0 bg-lightbox-border" aria-hidden />
  )
}

function distanceBetween(first: Point, second: Point): number {
  return Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
}

function midpointBetween(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}
