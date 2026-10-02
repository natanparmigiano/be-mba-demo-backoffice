import {
  Check,
  ChevronsUpDown,
  FileText,
  Image,
  LoaderCircle,
  MapPin,
  Search,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, Input, Pill } from '../ui'
import { WhatsAppText } from './WhatsAppText'

interface TemplateExample {
  header_text?: string[]
  header_text_named_params?: Array<{ param_name: string; example: string }>
  body_text?: string[][]
  body_text_named_params?: Array<{ param_name: string; example: string }>
}

interface TemplateButtonDefinition {
  type: string
  text?: string
  url?: string
  example?: string[] | string
}

export interface ComposerTemplateComponent {
  type: string
  format?: string
  text?: string
  example?: TemplateExample
  buttons?: TemplateButtonDefinition[]
}

export interface ComposerTemplateDefinition {
  id: string
  name: string
  language: string
  category: string | null
  parameterFormat: 'NAMED' | 'POSITIONAL'
  components: ComposerTemplateComponent[]
}

export interface ComposerTemplatePage {
  templates: ComposerTemplateDefinition[]
  nextCursor: string | null
}

export interface ComposerTemplateDraft {
  type: 'template'
  preview: string
  template: {
    name: string
    language: { code: string }
    components?: unknown[]
  }
  headerMedia?: {
    kind: 'document' | 'image' | 'video'
    file: File
  }
}

type ParameterField = {
  id: string
  kind: 'coupon' | 'location' | 'media' | 'text' | 'url'
  componentIndex: number
  parameterIndex: number
  token?: string
  parameterName?: string
  buttonIndex?: number
  mediaKind?: 'document' | 'image' | 'video'
  example?: string
  required?: boolean
  linkedFieldId?: string
}

export function TemplateMessageDialog({
  open,
  sending,
  embedded = false,
  loadTemplates,
  onClose,
  onSend,
}: {
  open: boolean
  sending: boolean
  embedded?: boolean
  loadTemplates: (after?: string) => Promise<ComposerTemplatePage>
  onClose: () => void
  onSend: (draft: ComposerTemplateDraft) => Promise<void>
}) {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<ComposerTemplateDefinition[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [headerMedia, setHeaderMedia] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setTemplates([])
    setNextCursor(null)
    setSelectedName('')
    setSelectedLanguage('')
    setValues({})
    setHeaderMedia(null)
    setPickerOpen(false)
    setPickerSearch('')
    setError(null)
    setLoading(true)
    void loadTemplates()
      .then((page) => {
        if (!active) return
        const sorted = sortTemplates(page.templates)
        setTemplates(sorted)
        setNextCursor(page.nextCursor)
        setSelectedName(sorted[0]?.name ?? '')
        setSelectedLanguage(sorted[0]?.language ?? '')
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : t('chatComposer.templates.loadFailed'),
          )
        }
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadTemplates, open, t])

  const selected = templates.find(
    (template) =>
      template.name === selectedName && template.language === selectedLanguage,
  )
  const filteredTemplates = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase()
    if (!query) return templates
    return templates.filter((template) =>
      `${template.name} ${template.language} ${template.category ?? ''}`
        .toLocaleLowerCase()
        .includes(query),
    )
  }, [pickerSearch, templates])
  const fields = useMemo(
    () => (selected ? templateParameterFields(selected) : []),
    [selected],
  )

  const selectVariant = (template: ComposerTemplateDefinition) => {
    setSelectedName(template.name)
    setSelectedLanguage(template.language)
    setValues({})
    setHeaderMedia(null)
    setError(null)
    setPickerOpen(false)
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await loadTemplates(nextCursor)
      setTemplates((current) =>
        sortTemplates(
          Array.from(
            new Map(
              [...current, ...page.templates].map((template) => [
                template.id,
                template,
              ]),
            ).values(),
          ),
        ),
      )
      setNextCursor(page.nextCursor)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('chatComposer.templates.loadFailed'),
      )
    } finally {
      setLoadingMore(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setError(null)
    const missing = fields.some((field) => {
      if (field.kind === 'media') return !headerMedia
      return field.required !== false && !values[field.id]?.trim()
    })
    if (missing) {
      setError(t('chatComposer.templates.requiredParameters'))
      return
    }
    const locationFields = fields.filter((field) => field.kind === 'location')
    if (locationFields.length) {
      const locationValue = (token: string) => {
        const field = locationFields.find(
          (candidate) => candidate.token === token,
        )
        return Number(field ? values[field.id] : Number.NaN)
      }
      const latitude = locationValue('latitude')
      const longitude = locationValue('longitude')
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        setError(t('chatComposer.templates.invalidLocation'))
        return
      }
    }

    try {
      const components = buildSendComponents(selected, fields, values)
      const mediaField = fields.find((field) => field.kind === 'media')
      await onSend({
        type: 'template',
        preview: templateTextPreview(selected, fields, values),
        template: {
          name: selected.name,
          language: { code: selected.language },
          ...(components.length ? { components } : {}),
        },
        ...(mediaField?.mediaKind && headerMedia
          ? {
              headerMedia: {
                kind: mediaField.mediaKind,
                file: headerMedia,
              },
            }
          : {}),
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('chatComposer.sendFailed'),
      )
    }
  }

  const form = (
    <form
      className={embedded ? 'grid w-full gap-6' : 'grid w-full gap-5'}
      onSubmit={(event) => void submit(event)}
    >
      {error && (
        <p
          className="rounded-lg bg-destructive/8 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div
          className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t('chatComposer.templates.loading')}
        </div>
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('chatComposer.templates.empty')}
        </p>
      ) : (
        <>
          <div className="grid gap-1.5 rounded-xl border bg-background p-4 text-sm">
            <span className="font-semibold">
              {t('chatComposer.fields.templateName')}
            </span>
            <button
              type="button"
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 text-left shadow-xs transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
              onClick={() => setPickerOpen(true)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {selected?.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {selected?.language}
                  {selected?.category ? ` · ${selected.category}` : ''}
                </span>
              </span>
              <ChevronsUpDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          </div>

          {selected && (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)]">
              <section className="grid content-start gap-4 rounded-xl border bg-background p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold">
                    {t('chatComposer.templates.parameters')}
                  </h3>
                  {selected.category && <Pill>{selected.category}</Pill>}
                </div>
                {fields.length === 0 ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {t('chatComposer.templates.noParameters')}
                  </p>
                ) : (
                  fields
                    .filter((field) => !field.linkedFieldId)
                    .map((field) => (
                      <TemplateParameterInput
                        key={field.id}
                        field={field}
                        value={values[field.id] ?? ''}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.id]: value,
                          }))
                        }
                        onFile={setHeaderMedia}
                      />
                    ))
                )}
              </section>
              <div className="lg:sticky lg:top-24">
                <TemplatePreview
                  template={selected}
                  fields={fields}
                  values={values}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div
        className={
          embedded
            ? 'flex flex-wrap justify-end gap-2 border-t pt-5'
            : 'flex flex-wrap justify-between gap-2'
        }
      >
        <span />
        <span className="flex gap-2">
          {!embedded && (
            <Button type="button" variant="outline" onClick={onClose}>
              {t('chatComposer.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={!selected || loading}
            isLoading={sending}
          >
            {t('chatComposer.send')}
          </Button>
        </span>
      </div>
    </form>
  )

  const picker = (
    <Dialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      title={t('chatComposer.templates.pickerTitle')}
      description={t('chatComposer.templates.pickerDescription')}
      size="lg"
    >
      <div className="grid w-full gap-3">
        <Input
          leadingIcon={Search}
          value={pickerSearch}
          placeholder={t('chatComposer.templates.pickerSearch')}
          aria-label={t('chatComposer.templates.pickerSearch')}
          onChange={(event) => setPickerSearch(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
        />
        <div
          className="max-h-[55vh] overflow-y-auto rounded-xl border"
          role="listbox"
          aria-label={t('chatComposer.templates.pickerTitle')}
          onScroll={(event) => {
            const target = event.currentTarget
            if (
              nextCursor &&
              !loadingMore &&
              target.scrollHeight - target.scrollTop - target.clientHeight < 96
            ) {
              void loadMore()
            }
          }}
        >
          {filteredTemplates.length ? (
            filteredTemplates.map((template) => {
              const isSelected = template.id === selected?.id
              return (
                <button
                  key={template.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="flex w-full cursor-pointer items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => selectVariant(template)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {template.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {template.language}
                      {template.category ? ` · ${template.category}` : ''}
                    </span>
                  </span>
                  {isSelected && (
                    <Check className="size-4 text-primary" aria-hidden />
                  )}
                </button>
              )
            })
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t('chatComposer.templates.pickerEmpty')}
            </p>
          )}
          {loadingMore && (
            <p
              className="flex items-center justify-center gap-2 border-t p-3 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t('chatComposer.templates.loadingMore')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )

  if (embedded)
    return (
      <>
        {form}
        {picker}
      </>
    )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      title={t('chatComposer.dialogs.template.title')}
      description={t('chatComposer.dialogs.template.description')}
      size="lg"
      dismissible={!pickerOpen}
    >
      {form}
      {picker}
    </Dialog>
  )
}

function templateTextPreview(
  template: ComposerTemplateDefinition,
  fields: ParameterField[],
  values: Record<string, string>,
): string {
  return template.components
    .filter(
      (component) =>
        (component.type === 'HEADER' ||
          component.type === 'BODY' ||
          component.type === 'FOOTER') &&
        component.text,
    )
    .map((component) =>
      component.type === 'FOOTER'
        ? component.text!
        : replaceParameters(
            component.text!,
            fields,
            values,
            template.components.indexOf(component),
          ),
    )
    .join('\n\n')
}

function TemplateParameterInput({
  field,
  value,
  onChange,
  onFile,
}: {
  field: ParameterField
  value: string
  onChange: (value: string) => void
  onFile: (file: File | null) => void
}) {
  const { t } = useTranslation()
  const label = parameterLabel(field, t)
  if (field.kind === 'media') {
    const Icon =
      field.mediaKind === 'image'
        ? Image
        : field.mediaKind === 'video'
          ? Video
          : FileText
    return (
      <label className="grid gap-1.5 text-sm font-semibold">
        <span>{label}</span>
        <span className="flex min-h-10 items-center gap-2 rounded-lg border bg-card px-3 py-2 font-normal">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="file"
            required
            className="min-w-0 flex-1 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-foreground"
            accept={
              field.mediaKind === 'image'
                ? 'image/jpeg,image/png'
                : field.mediaKind === 'video'
                  ? 'video/3gpp,video/mp4'
                  : '.doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.txt'
            }
            onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)}
          />
        </span>
      </label>
    )
  }
  return (
    <Input
      label={label}
      required={field.required !== false}
      inputMode={
        field.kind === 'location' &&
        (field.token === 'latitude' || field.token === 'longitude')
          ? 'decimal'
          : undefined
      }
      value={value}
      placeholder={field.example}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}

function TemplatePreview({
  template,
  fields,
  values,
}: {
  template: ComposerTemplateDefinition
  fields: ParameterField[]
  values: Record<string, string>
}) {
  const { t } = useTranslation()
  const header = template.components.find(
    (component) => component.type === 'HEADER',
  )
  const body = template.components.find(
    (component) => component.type === 'BODY',
  )
  const footer = template.components.find(
    (component) => component.type === 'FOOTER',
  )
  const buttons =
    template.components.find((component) => component.type === 'BUTTONS')
      ?.buttons ?? []
  const renderText = (text: string, componentIndex: number) =>
    replaceParameters(text, fields, values, componentIndex)

  return (
    <section
      className="grid content-start gap-2"
      aria-label={t('chatComposer.templates.preview')}
    >
      <h3 className="text-sm font-bold">
        {t('chatComposer.templates.preview')}
      </h3>
      <div className="rounded-xl bg-muted p-4">
        <article className="grid gap-2 rounded-xl border bg-card p-3 shadow-sm">
          {header?.format === 'TEXT' && header.text && (
            <WhatsAppText
              className="text-sm font-semibold"
              text={renderText(
                header.text,
                template.components.indexOf(header),
              )}
            />
          )}
          {header?.format && header.format !== 'TEXT' && (
            <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg bg-muted text-xs text-muted-foreground">
              {header.format === 'LOCATION' ? (
                <MapPin className="size-5" aria-hidden />
              ) : header.format === 'VIDEO' ? (
                <Video className="size-5" aria-hidden />
              ) : header.format === 'IMAGE' ? (
                <Image className="size-5" aria-hidden />
              ) : (
                <FileText className="size-5" aria-hidden />
              )}
              {t('chatComposer.templates.headerPreview', {
                type: header.format.toLowerCase(),
              })}
            </div>
          )}
          {body?.text && (
            <WhatsAppText
              className="text-sm leading-5"
              text={renderText(body.text, template.components.indexOf(body))}
            />
          )}
          {footer?.text && (
            <WhatsAppText
              className="text-xs text-muted-foreground"
              text={footer.text}
            />
          )}
          {buttons.length > 0 && (
            <div className="mt-1 grid divide-y border-t text-center text-xs font-semibold text-primary">
              {buttons.map((button, index) => (
                <span key={`${button.type}-${index}`} className="py-2">
                  {button.text ?? t('chatComposer.templates.button')}
                </span>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

function templateParameterFields(
  template: ComposerTemplateDefinition,
): ParameterField[] {
  const fields: ParameterField[] = []
  template.components.forEach((component, componentIndex) => {
    if (
      (component.type === 'HEADER' || component.type === 'BODY') &&
      component.text
    ) {
      const tokens = placeholderTokens(component.text)
      tokens.forEach((token, parameterIndex) => {
        fields.push({
          id: `${componentIndex}:text:${token}`,
          kind: 'text',
          componentIndex,
          parameterIndex,
          token,
          parameterName:
            template.parameterFormat === 'NAMED' ? token : undefined,
          example: parameterExample(component, token, parameterIndex),
        })
      })
    }
    if (component.type === 'HEADER' && component.format) {
      const mediaKind = component.format.toLowerCase()
      if (
        mediaKind === 'document' ||
        mediaKind === 'image' ||
        mediaKind === 'video'
      ) {
        fields.push({
          id: `${componentIndex}:media`,
          kind: 'media',
          componentIndex,
          parameterIndex: 0,
          mediaKind,
        })
      }
      if (component.format === 'LOCATION') {
        ;['latitude', 'longitude', 'name', 'address'].forEach((token, index) =>
          fields.push({
            id: `${componentIndex}:location:${token}`,
            kind: 'location',
            componentIndex,
            parameterIndex: index,
            token,
            required: index < 2,
          }),
        )
      }
    }
    if (component.type === 'BUTTONS') {
      component.buttons?.forEach((button, buttonIndex) => {
        if (
          button.type === 'URL' &&
          button.url &&
          placeholderTokens(button.url).length
        ) {
          const authenticationCodeField =
            template.category?.toUpperCase() === 'AUTHENTICATION'
              ? fields.find(
                  (field) =>
                    field.kind === 'text' &&
                    template.components[field.componentIndex]?.type === 'BODY',
                )
              : undefined
          fields.push({
            id: `${componentIndex}:url:${buttonIndex}`,
            kind: 'url',
            componentIndex,
            parameterIndex: 0,
            buttonIndex,
            example: Array.isArray(button.example)
              ? button.example[0]
              : button.example,
            ...(authenticationCodeField
              ? {
                  linkedFieldId: authenticationCodeField.id,
                  required: false,
                }
              : {}),
          })
        }
        if (button.type === 'COPY_CODE') {
          fields.push({
            id: `${componentIndex}:coupon:${buttonIndex}`,
            kind: 'coupon',
            componentIndex,
            parameterIndex: 0,
            buttonIndex,
            example: Array.isArray(button.example)
              ? button.example[0]
              : button.example,
          })
        }
      })
    }
  })
  return fields
}

function buildSendComponents(
  template: ComposerTemplateDefinition,
  fields: ParameterField[],
  values: Record<string, string>,
): unknown[] {
  const components: unknown[] = []
  for (const type of ['HEADER', 'BODY'] as const) {
    const componentIndex = template.components.findIndex(
      (component) => component.type === type,
    )
    if (componentIndex < 0) continue
    const textFields = fields.filter(
      (field) =>
        field.componentIndex === componentIndex && field.kind === 'text',
    )
    const locationFields = fields.filter(
      (field) =>
        field.componentIndex === componentIndex && field.kind === 'location',
    )
    const parameters: unknown[] = textFields.map((field) => ({
      type: 'text',
      text: values[field.id]!.trim(),
      ...(field.parameterName ? { parameter_name: field.parameterName } : {}),
    }))
    if (locationFields.length) {
      const locationValue = (token: string) => {
        const field = locationFields.find(
          (candidate) => candidate.token === token,
        )
        return field ? values[field.id]?.trim() : undefined
      }
      const latitude = locationValue('latitude') ?? ''
      const longitude = locationValue('longitude') ?? ''
      const name = locationValue('name')
      const address = locationValue('address')
      parameters.push({
        type: 'location',
        location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          ...(name ? { name } : {}),
          ...(address ? { address } : {}),
        },
      })
    }
    if (parameters.length) {
      components.push({ type: type.toLowerCase(), parameters })
    }
  }
  fields
    .filter((field) => field.kind === 'url' || field.kind === 'coupon')
    .forEach((field) => {
      components.push({
        type: 'button',
        sub_type: field.kind === 'url' ? 'url' : 'copy_code',
        index: field.buttonIndex!,
        parameters: [
          field.kind === 'url'
            ? {
                type: 'text',
                text: values[field.linkedFieldId ?? field.id]!.trim(),
              }
            : { type: 'coupon_code', coupon_code: values[field.id]!.trim() },
        ],
      })
    })
  return components
}

function replaceParameters(
  text: string,
  fields: ParameterField[],
  values: Record<string, string>,
  componentIndex: number,
): string {
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (placeholder, token: string) => {
    const field = fields.find(
      (candidate) =>
        candidate.componentIndex === componentIndex &&
        candidate.kind === 'text' &&
        candidate.token === token,
    )
    if (!field) return placeholder
    return values[field.id]?.trim() || field.example || placeholder
  })
}

function placeholderTokens(text: string): string[] {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/{{\s*([^{}]+?)\s*}}/g), (match) => match[1]!),
    ),
  )
}

function parameterExample(
  component: ComposerTemplateComponent,
  token: string,
  index: number,
): string | undefined {
  const named =
    component.type === 'HEADER'
      ? component.example?.header_text_named_params
      : component.example?.body_text_named_params
  const namedValue = named?.find((item) => item.param_name === token)?.example
  if (namedValue) return namedValue
  return component.type === 'HEADER'
    ? component.example?.header_text?.[index]
    : component.example?.body_text?.[0]?.[index]
}

function parameterLabel(
  field: ParameterField,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (field.kind === 'media') {
    return t('chatComposer.templates.mediaParameter', {
      type: field.mediaKind,
    })
  }
  if (field.kind === 'url') return t('chatComposer.templates.urlParameter')
  if (field.kind === 'coupon') return t('chatComposer.templates.codeParameter')
  if (field.kind === 'location') {
    return t(`chatComposer.templates.location.${field.token}`)
  }
  return field.parameterName
    ? t('chatComposer.templates.namedParameter', {
        name: field.parameterName,
      })
    : t('chatComposer.templates.numberedParameter', {
        number: field.parameterIndex + 1,
      })
}

function sortTemplates(
  templates: ComposerTemplateDefinition[],
): ComposerTemplateDefinition[] {
  return [...templates].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.language.localeCompare(right.language),
  )
}
