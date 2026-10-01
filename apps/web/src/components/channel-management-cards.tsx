import {
  Command,
  LoaderCircle,
  MessageCircleQuestion,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import type { ChannelQrState } from '../channel-qr'
import { ChannelQrCode } from './channel-qr-code'
import { SettingsCard } from './settings-card'
import { Button, Dialog, Input, Textarea } from './ui'

interface ConversationalCommand {
  command_name: string
  command_description: string
}

interface ConversationalComponentsState {
  status: 'loading' | 'available' | 'error'
  prompts: string[]
  commands: ConversationalCommand[]
}

export function QrCodesSettingsCard({
  channelId,
  phoneNumber,
  canManage,
  state,
  onChanged,
}: {
  channelId: number
  phoneNumber: string
  canManage: boolean
  state: ChannelQrState
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [isCreating, setIsCreating] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [message, setMessage] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [action, setAction] = useState<'edit' | 'remove' | null>(null)
  const [isActionBusy, setIsActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const createQrCode = async () => {
    if (!message.trim()) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const response = await apiClient.api.playground.qr[':channelId'].$post({
        param: { channelId: String(channelId) },
        json: { prefilledMessage: message.trim(), imageFormat: 'SVG' },
      })
      if (!response.ok) throw new Error()
      setMessage('')
      setShowCreator(false)
      onChanged()
    } catch {
      setCreateError(t('channels.qr.createFailed'))
    } finally {
      setIsCreating(false)
    }
  }

  const updateQrCode = async () => {
    if (!state.code || !message.trim()) return
    setIsActionBusy(true)
    setActionError(null)
    try {
      const response = await apiClient.api.playground.qr[':channelId'][
        ':code'
      ].$post({
        param: { channelId: String(channelId), code: state.code },
        json: { prefilledMessage: message.trim() },
      })
      if (!response.ok) throw new Error()
      setAction(null)
      setMessage('')
      onChanged()
    } catch {
      setActionError(t('channels.qr.updateFailed'))
    } finally {
      setIsActionBusy(false)
    }
  }

  const removeQrCode = async () => {
    if (!state.code) return
    setIsActionBusy(true)
    setActionError(null)
    try {
      const response = await apiClient.api.playground.qr[':channelId'][
        ':code'
      ].$delete({
        param: { channelId: String(channelId), code: state.code },
      })
      if (!response.ok) throw new Error()
      setAction(null)
      onChanged()
    } catch {
      setActionError(t('channels.qr.removeFailed'))
    } finally {
      setIsActionBusy(false)
    }
  }

  return (
    <>
      <SettingsCard
        icon={<QrCode className="size-5" aria-hidden />}
        title={t('channels.qr.title')}
        description={t('channels.qr.formDescription')}
        action={
          canManage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAction(null)
                setActionError(null)
                setMessage('')
                setShowCreator(true)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t('channels.qr.create')}
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ChannelQrCode
            phoneNumber={phoneNumber}
            showDownload
            state={state}
            onEdit={
              canManage && state.status === 'available'
                ? () => {
                    setActionError(null)
                    setMessage(state.prefilledMessage ?? '')
                    setAction('edit')
                  }
                : undefined
            }
            onRemove={
              canManage && state.status === 'available'
                ? () => {
                    setActionError(null)
                    setAction('remove')
                  }
                : undefined
            }
          />
        </div>
      </SettingsCard>

      <Dialog
        open={showCreator}
        onOpenChange={setShowCreator}
        title={t('channels.qr.create')}
        description={t('channels.qr.createDescription')}
        icon={<DialogIcon icon={<Plus className="size-5" />} />}
      >
        <QrEditor
          error={createError}
          isBusy={isCreating}
          message={message}
          submitLabel={t('channels.qr.create')}
          onCancel={() => setShowCreator(false)}
          onChange={setMessage}
          onSubmit={() => void createQrCode()}
        />
      </Dialog>
      <Dialog
        open={action === 'edit'}
        onOpenChange={(open) => !open && setAction(null)}
        title={t('channels.qr.editTitle')}
        description={t('channels.qr.editDescription')}
        icon={<DialogIcon icon={<Pencil className="size-5" />} />}
      >
        <QrEditor
          error={actionError}
          isBusy={isActionBusy}
          message={message}
          submitLabel={t('channels.qr.saveEdit')}
          onCancel={() => setAction(null)}
          onChange={setMessage}
          onSubmit={() => void updateQrCode()}
        />
      </Dialog>
      <Dialog
        open={action === 'remove'}
        onOpenChange={(open) => !open && setAction(null)}
        title={t('channels.qr.removeTitle')}
        description={t('channels.qr.removeConfirmation')}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} />}
      >
        <div className="grid w-full gap-4">
          <ErrorMessage message={actionError} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAction(null)}
            >
              {t('channels.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isActionBusy}
              onClick={() => void removeQrCode()}
            >
              {t('channels.qr.confirmRemove')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

export function ConversationalComponentsSettingsCard({
  channelId,
  canManage,
}: {
  channelId: number
  canManage: boolean
}) {
  const { t } = useTranslation()
  const [components, setComponents] = useState<ConversationalComponentsState>({
    status: 'loading',
    prompts: [],
    commands: [],
  })
  const [editor, setEditor] = useState<{
    type: 'prompt' | 'command'
    index: number | null
  } | null>(null)
  const [removal, setRemoval] = useState<{
    type: 'prompt' | 'command'
    index: number
  } | null>(null)
  const [prompt, setPrompt] = useState('')
  const [commandName, setCommandName] = useState('')
  const [commandDescription, setCommandDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    setComponents((current) => ({ ...current, status: 'loading' }))
    try {
      const response = await apiClient.api.playground.components[
        ':channelId'
      ].$get({ param: { channelId: String(channelId) } })
      if (!response.ok) throw new Error()
      const { result } = await response.json()
      setComponents({
        status: 'available',
        prompts: result.prompts ?? [],
        commands: result.commands ?? [],
      })
    } catch {
      setComponents({ status: 'error', prompts: [], commands: [] })
    }
  }, [channelId])

  useEffect(() => void load(), [load])

  const persist = async (
    prompts: string[],
    commands: ConversationalCommand[],
  ) => {
    const response = await apiClient.api.playground.components[
      ':channelId'
    ].$post({
      param: { channelId: String(channelId) },
      json: {
        prompts,
        commands: commands.map((command) => ({
          commandName: command.command_name,
          commandDescription: command.command_description,
        })),
      },
    })
    if (!response.ok) throw new Error()
  }

  const save = async () => {
    if (!editor) return
    const prompts = [...components.prompts]
    const commands = [...components.commands]
    if (editor.type === 'prompt') {
      const value = prompt.trim()
      if (!value) return
      if (editor.index === null) prompts.push(value)
      else prompts[editor.index] = value
    } else {
      const command = {
        command_name: commandName.trim(),
        command_description: commandDescription.trim(),
      }
      if (!command.command_name || !command.command_description) return
      if (editor.index === null) commands.push(command)
      else commands[editor.index] = command
    }
    setIsBusy(true)
    setError(null)
    try {
      await persist(prompts, commands)
      setEditor(null)
      await load()
    } catch {
      setError(t('channels.components.saveFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const remove = async () => {
    if (!removal) return
    const prompts =
      removal.type === 'prompt'
        ? components.prompts.filter((_, index) => index !== removal.index)
        : components.prompts
    const commands =
      removal.type === 'command'
        ? components.commands.filter((_, index) => index !== removal.index)
        : components.commands
    setIsBusy(true)
    setError(null)
    try {
      await persist(prompts, commands)
      setRemoval(null)
      await load()
    } catch {
      setError(t('channels.components.removeFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <>
      <SettingsCard
        icon={<Command className="size-5" aria-hidden />}
        title={t('channels.components.title')}
        description={t('channels.components.description')}
      >
        {components.status === 'loading' ? (
          <div className="grid min-h-28 place-items-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">{t('channels.components.loading')}</span>
          </div>
        ) : components.status === 'error' ? (
          <div className="grid justify-items-start gap-3 rounded-xl bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              {t('channels.components.loadFailed')}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
            >
              <RefreshCw className="size-4" aria-hidden />
              {t('channels.components.retry')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <ComponentList
              title={t('channels.components.icebreakers')}
              description={t('channels.components.icebreakersDescription')}
              icon={<MessageCircleQuestion className="size-4" aria-hidden />}
              empty={t('channels.components.noIcebreakers')}
              canManage={canManage}
              canAdd={components.prompts.length < 4}
              items={components.prompts.map((value) => ({ title: value }))}
              onAdd={() => {
                setError(null)
                setPrompt('')
                setEditor({ type: 'prompt', index: null })
              }}
              onEdit={(index) => {
                setError(null)
                setPrompt(components.prompts[index] ?? '')
                setEditor({ type: 'prompt', index })
              }}
              onRemove={(index) => {
                setError(null)
                setRemoval({ type: 'prompt', index })
              }}
            />
            <ComponentList
              title={t('channels.components.commands')}
              description={t('channels.components.commandsDescription')}
              icon={<Command className="size-4" aria-hidden />}
              empty={t('channels.components.noCommands')}
              canManage={canManage}
              canAdd={components.commands.length < 30}
              items={components.commands.map((command) => ({
                title: `/${command.command_name}`,
                description: command.command_description,
              }))}
              onAdd={() => {
                setError(null)
                setCommandName('')
                setCommandDescription('')
                setEditor({ type: 'command', index: null })
              }}
              onEdit={(index) => {
                const command = components.commands[index]
                if (!command) return
                setError(null)
                setCommandName(command.command_name)
                setCommandDescription(command.command_description)
                setEditor({ type: 'command', index })
              }}
              onRemove={(index) => {
                setError(null)
                setRemoval({ type: 'command', index })
              }}
            />
          </div>
        )}
      </SettingsCard>

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        title={t(
          editor?.index === null
            ? editor.type === 'prompt'
              ? 'channels.components.createIcebreaker'
              : 'channels.components.createCommand'
            : editor?.type === 'prompt'
              ? 'channels.components.editIcebreaker'
              : 'channels.components.editCommand',
        )}
        description={t('channels.components.editorDescription')}
        icon={
          <DialogIcon
            icon={
              editor?.type === 'prompt' ? (
                <MessageCircleQuestion className="size-5" />
              ) : (
                <Command className="size-5" />
              )
            }
          />
        }
      >
        <div className="grid w-full gap-4">
          {editor?.type === 'prompt' ? (
            <Textarea
              autoFocus
              maxLength={80}
              label={t('channels.components.icebreaker')}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          ) : (
            <>
              <Input
                autoFocus
                maxLength={32}
                label={t('channels.components.commandName')}
                value={commandName}
                onChange={(event) => setCommandName(event.target.value)}
              />
              <Textarea
                maxLength={256}
                label={t('channels.components.commandDescription')}
                value={commandDescription}
                onChange={(event) => setCommandDescription(event.target.value)}
              />
            </>
          )}
          <ErrorMessage message={error} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditor(null)}
            >
              {t('channels.cancel')}
            </Button>
            <Button
              type="button"
              disabled={
                editor?.type === 'prompt'
                  ? !prompt.trim()
                  : !commandName.trim() || !commandDescription.trim()
              }
              isLoading={isBusy}
              onClick={() => void save()}
            >
              {t('channels.components.save')}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={removal !== null}
        onOpenChange={(open) => !open && setRemoval(null)}
        title={t('channels.components.removeTitle')}
        description={t('channels.components.removeConfirmation')}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} />}
      >
        <div className="grid w-full gap-4">
          <ErrorMessage message={error} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoval(null)}
            >
              {t('channels.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isBusy}
              onClick={() => void remove()}
            >
              {t('channels.components.remove')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function QrEditor({
  error,
  isBusy,
  message,
  submitLabel,
  onCancel,
  onChange,
  onSubmit,
}: {
  error: string | null
  isBusy: boolean
  message: string
  submitLabel: string
  onCancel: () => void
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid w-full gap-4">
      <Textarea
        autoFocus
        label={t('channels.qr.prefilledMessage')}
        value={message}
        onChange={(event) => onChange(event.target.value)}
      />
      <ErrorMessage message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('channels.cancel')}
        </Button>
        <Button
          type="button"
          disabled={!message.trim()}
          isLoading={isBusy}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

function ComponentList({
  title,
  description,
  icon,
  empty,
  items,
  canManage,
  canAdd,
  onAdd,
  onEdit,
  onRemove,
}: {
  title: string
  description: string
  icon: React.ReactNode
  empty: string
  items: Array<{ title: string; description?: string }>
  canManage: boolean
  canAdd: boolean
  onAdd: () => void
  onEdit: (index: number) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {canManage && canAdd && (
          <Button type="button" variant="outline" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            {t('channels.components.add')}
          </Button>
        )}
      </div>
      <div className="border-t bg-muted/10 p-4">
        {items.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item, index) => (
              <li
                key={`${item.title}-${index}`}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-semibold">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label={t('channels.components.edit')}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => onEdit(index)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      aria-label={t('channels.components.remove')}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function DialogIcon({ icon }: { icon: React.ReactNode }) {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
      aria-hidden
    >
      {icon}
    </span>
  )
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null
}
