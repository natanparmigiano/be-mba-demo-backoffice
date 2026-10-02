import {
  Car,
  Flag,
  Heart,
  Lightbulb,
  PawPrint,
  Plus,
  Puzzle,
  Search,
  Smile,
  Sticker,
  Trophy,
  UserRound,
  Utensils,
} from 'lucide-react'
import { useMemo, useRef, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import emojiData from '../../assets/emoji-categories.json'
import { cn } from '../ui'

interface EmojiEntry {
  code: string[]
  emoji: string
  name: string
}

interface EmojiAsset {
  emojis: Record<string, Record<string, EmojiEntry[]>>
}

const emojiAsset = emojiData as EmojiAsset

const CATEGORY_CONFIG = [
  {
    name: 'Smileys & Emotion',
    translationKey: 'smileysEmotion',
    icon: Smile,
  },
  { name: 'People & Body', translationKey: 'peopleBody', icon: UserRound },
  { name: 'Component', translationKey: 'component', icon: Puzzle },
  { name: 'Animals & Nature', translationKey: 'animalsNature', icon: PawPrint },
  { name: 'Food & Drink', translationKey: 'foodDrink', icon: Utensils },
  { name: 'Travel & Places', translationKey: 'travelPlaces', icon: Car },
  { name: 'Activities', translationKey: 'activities', icon: Trophy },
  { name: 'Objects', translationKey: 'objects', icon: Lightbulb },
  { name: 'Symbols', translationKey: 'symbols', icon: Heart },
  { name: 'Flags', translationKey: 'flags', icon: Flag },
] as const satisfies ReadonlyArray<{
  name: string
  translationKey: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}>

type EmojiCategoryName = (typeof CATEGORY_CONFIG)[number]['name']

const ALL_EMOJIS = CATEGORY_CONFIG.flatMap((category) =>
  categoryEntries(category.name),
)

function categoryEntries(category: EmojiCategoryName): EmojiEntry[] {
  const groups = emojiAsset.emojis[category]
  return groups ? Object.values(groups).flat() : []
}

export function EmojiPickerPanel({
  className,
  disabled = false,
  stickers,
  stickersLoading = false,
  stickerError,
  onAddSticker,
  onSelect,
  onSelectSticker,
}: {
  className?: string
  disabled?: boolean
  stickers?: readonly StickerLibraryItem[]
  stickersLoading?: boolean
  stickerError?: string | null
  onAddSticker?: (file: File) => void | Promise<void>
  onSelect: (emoji: string) => void | Promise<void>
  onSelectSticker?: (sticker: StickerLibraryItem) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const stickerInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'emoji' | 'stickers'>('emoji')
  const [category, setCategory] =
    useState<EmojiCategoryName>('Smileys & Emotion')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const entries = useMemo(
    () =>
      normalizedQuery
        ? ALL_EMOJIS.filter(
            (entry) =>
              entry.name.toLocaleLowerCase().includes(normalizedQuery) ||
              entry.emoji.includes(normalizedQuery),
          )
        : categoryEntries(category),
    [category, normalizedQuery],
  )
  const hasStickerLibrary = Boolean(stickers && onAddSticker && onSelectSticker)

  return (
    <div
      className={cn(
        'flex h-[min(27rem,70dvh)] w-[min(23rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl',
        className,
      )}
    >
      <div className="border-b p-3">
        <label className="flex h-9 items-center gap-2 rounded-xl bg-muted px-3 text-muted-foreground focus-within:ring-3 focus-within:ring-ring/20">
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">{t('chatComposer.emojiSearch')}</span>
          <input
            autoFocus
            type="search"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            value={query}
            disabled={disabled}
            placeholder={t('chatComposer.emojiSearch')}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>

      <div
        className="flex shrink-0 overflow-x-auto border-b px-1"
        role="tablist"
        aria-label={t('chatComposer.emojiCategoriesLabel')}
      >
        {hasStickerLibrary && (
          <button
            type="button"
            role="tab"
            aria-label={t('chatComposer.stickers')}
            aria-selected={mode === 'stickers'}
            title={t('chatComposer.stickers')}
            className={cn(
              'grid size-10 shrink-0 cursor-pointer place-items-center border-b-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              mode === 'stickers'
                ? 'border-primary text-primary'
                : 'border-transparent',
            )}
            disabled={disabled}
            onClick={() => {
              setMode('stickers')
              setQuery('')
            }}
          >
            <Sticker className="size-4" aria-hidden />
          </button>
        )}
        {CATEGORY_CONFIG.map((item) => {
          const Icon = item.icon
          const label = t(`chatComposer.emojiCategories.${item.translationKey}`)
          const selected =
            mode === 'emoji' && !normalizedQuery && category === item.name
          return (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-label={label}
              aria-selected={selected}
              title={label}
              className={cn(
                'grid size-10 shrink-0 cursor-pointer place-items-center border-b-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                selected ? 'border-primary text-primary' : 'border-transparent',
              )}
              disabled={disabled}
              onClick={() => {
                setMode('emoji')
                setQuery('')
                setCategory(item.name)
              }}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {mode === 'stickers' && hasStickerLibrary ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/*,.webp"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void onAddSticker?.(file)
              }}
            />
            <button
              type="button"
              className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait disabled:opacity-50"
              aria-label={t('chatComposer.addSticker')}
              title={t('chatComposer.addSticker')}
              disabled={disabled || stickersLoading}
              onClick={() => stickerInputRef.current?.click()}
            >
              <Plus className="size-6" aria-hidden />
            </button>
            {stickersLoading && (stickers?.length ?? 0) === 0 ? (
              <p className="col-span-full grid min-h-28 place-items-center text-sm text-muted-foreground">
                {t('chatComposer.loadingStickers')}
              </p>
            ) : (
              (stickers ?? []).map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl bg-muted/50 p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait disabled:opacity-50"
                  aria-label={t('chatComposer.sendSticker')}
                  title={t('chatComposer.sendSticker')}
                  disabled={disabled || stickersLoading}
                  onClick={() => void onSelectSticker?.(sticker)}
                >
                  <img
                    src={sticker.url}
                    alt=""
                    className="size-full object-contain"
                  />
                </button>
              ))
            )}
            {stickerError && (
              <p
                className="col-span-full text-xs text-destructive"
                role="alert"
              >
                {stickerError}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="sticky top-0 z-10 bg-card/95 px-1 pb-2 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
              {normalizedQuery
                ? t('chatComposer.emojiSearchResults')
                : t(
                    `chatComposer.emojiCategories.${CATEGORY_CONFIG.find((item) => item.name === category)?.translationKey ?? 'smileysEmotion'}`,
                  )}
            </p>
            {entries.length > 0 ? (
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-9">
                {entries.map((entry, index) => (
                  <button
                    key={`${entry.code.join('-')}-${index}`}
                    type="button"
                    className="grid aspect-square cursor-pointer place-items-center rounded-lg text-xl hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait disabled:opacity-50"
                    aria-label={entry.name}
                    title={entry.name}
                    disabled={disabled}
                    onClick={() => void onSelect(entry.emoji)}
                  >
                    {entry.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <p className="grid h-full min-h-32 place-items-center text-sm text-muted-foreground">
                {t('chatComposer.emojiNoResults')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export interface StickerLibraryItem {
  id: number
  url: string
}
