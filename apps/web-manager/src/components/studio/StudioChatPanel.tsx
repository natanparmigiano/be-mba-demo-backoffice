import { s, type Chat } from '@hashbrownai/core'
import { HashbrownProvider, useChat, useTool } from '@hashbrownai/react'
import {
  Bot,
  Check,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  SendHorizontal,
  Square,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  addMcpServer,
  deleteFile,
  getAgentConfig,
  getMcpDefinition,
  listFiles,
  patchAgentConfig,
  patchMcpDefinition,
  putFile,
  readFile,
} from '../../studio-agent-tools'
import type { StudioDocument } from '../../studio-agtx'
import { saveStudioConversation } from '../../studio-projects'
import { Button, Dialog, Textarea } from '@mba-desk/ui'
import { buildStudioAgentSystemPrompt } from './studio-agent-prompt'

interface StudioChatPanelProps {
  projectId: string
  document: StudioDocument
  initialConversation: unknown[]
  onChange: (document: StudioDocument) => void
}

export function StudioChatPanel(props: StudioChatPanelProps) {
  return (
    <HashbrownProvider url="/api/hashbrown">
      <StudioChat {...props} />
    </HashbrownProvider>
  )
}

function StudioChat({
  projectId,
  document,
  initialConversation,
  onChange,
}: StudioChatPanelProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [persistenceError, setPersistenceError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef(document)
  documentRef.current = document

  const commit = (nextDocument: StudioDocument) => {
    documentRef.current = nextDocument
    onChange(nextDocument)
    return { ok: true }
  }

  const getCurrentAgentConfig = useTool({
    name: 'get_current_agent_config',
    description: 'Return the complete current AGTX agent.yaml configuration.',
    handler: async () => getAgentConfig(documentRef.current),
    deps: [],
  })
  const patchCurrentAgentConfig = useTool({
    name: 'patch_current_agent_config',
    description:
      'Apply an RFC 7396 JSON Merge Patch to agent.yaml. Arrays replace the complete array.',
    schema: s.object('Agent config patch', {
      patchJson: s.string('A JSON object containing the merge patch.'),
    }),
    handler: async ({ patchJson }) =>
      commit(patchAgentConfig(documentRef.current, patchJson)),
    deps: [onChange],
  })
  const getCurrentMcpDefinition = useTool({
    name: 'get_mcp_definition',
    description: 'Return MCPs/<name>.mcpx as a structured object.',
    schema: s.object('MCP definition lookup', {
      name: s.string('The lowercase snake_case MCP name.'),
    }),
    handler: async ({ name }) => getMcpDefinition(documentRef.current, name),
    deps: [],
  })
  const patchCurrentMcpDefinition = useTool({
    name: 'patch_mcp_definition',
    description:
      'Apply an RFC 7396 JSON Merge Patch to MCPs/<name>.mcpx. Arrays replace the complete array.',
    schema: s.object('MCP definition patch', {
      name: s.string('The lowercase snake_case MCP name.'),
      patchJson: s.string('A JSON object containing the merge patch.'),
    }),
    handler: async ({ name, patchJson }) =>
      commit(patchMcpDefinition(documentRef.current, name, patchJson)),
    deps: [onChange],
  })
  const addRemoteMcpServer = useTool({
    name: 'add_mcp_server',
    description:
      'Add a remote MCP server connector. Credentials are intentionally not accepted or stored.',
    schema: s.object('Remote MCP server', {
      name: s.string('Unique lowercase snake_case connector name.'),
      description: s.string('A clear description of the server capabilities.'),
      baseUrl: s.string('The absolute MCP server URL.'),
      authType: s.string('One of API_KEY, OAUTH2_CLIENT_CREDENTIALS, or NONE.'),
    }),
    handler: async (input) => commit(addMcpServer(documentRef.current, input)),
    deps: [onChange],
  })
  const listPackageFiles = useTool({
    name: 'list_files',
    description:
      'List agent.yaml and every asset packaged in the current AGTX.',
    handler: async () => listFiles(documentRef.current),
    deps: [],
  })
  const readPackageFile = useTool({
    name: 'read_file',
    description:
      'Read agent.yaml or an asset. Text is returned as UTF-8 and binary files as base64.',
    schema: s.object('Package file lookup', {
      path: s.string('agent.yaml or a path under files/ or MCPs/.'),
    }),
    handler: async ({ path }) => readFile(documentRef.current, path),
    deps: [],
  })
  const putPackageFile = useTool({
    name: 'put_file',
    description:
      'Create or replace a package asset under files/ or MCPs/. Does not create manifest references automatically.',
    schema: s.object('Package file contents', {
      path: s.string('A safe path under files/ or MCPs/.'),
      content: s.string('The complete file contents.'),
      encoding: s.string('Either utf8 or base64.'),
    }),
    handler: async ({ path, content, encoding }) =>
      commit(putFile(documentRef.current, path, content, encoding)),
    deps: [onChange],
  })
  const deletePackageFile = useTool({
    name: 'delete_file',
    description:
      'Delete an unreferenced package asset. Referenced knowledge and MCP files are rejected.',
    schema: s.object('Package file deletion', {
      path: s.string('A safe path under files/ or MCPs/.'),
    }),
    handler: async ({ path }) => commit(deleteFile(documentRef.current, path)),
    deps: [onChange],
  })

  const chat = useChat<Chat.AnyTool>({
    system: buildStudioAgentSystemPrompt(document.name),
    messages: restoreConversation(initialConversation),
    tools: [
      getCurrentAgentConfig,
      patchCurrentAgentConfig,
      getCurrentMcpDefinition,
      patchCurrentMcpDefinition,
      addRemoteMcpServer,
      listPackageFiles,
      readPackageFile,
      putPackageFile,
      deletePackageFile,
    ],
  })

  useEffect(() => {
    const viewport = scrollRef.current
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [chat.messages, chat.isLoading])

  useEffect(() => {
    if (chat.isLoading) return
    const timeout = window.setTimeout(() => {
      void saveStudioConversation(
        projectId,
        serializeConversation(chat.messages),
      )
        .then(() => setPersistenceError(false))
        .catch(() => setPersistenceError(true))
    }, 1_000)
    return () => window.clearTimeout(timeout)
  }, [chat.isLoading, chat.messages, projectId])

  const resetConversation = async () => {
    setResetting(true)
    try {
      await saveStudioConversation(projectId, [])
      chat.setMessages([])
      setPersistenceError(false)
      setResetOpen(false)
    } catch {
      setPersistenceError(true)
    } finally {
      setResetting(false)
    }
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || chat.isLoading) return
    chat.sendMessage({ role: 'user', content })
    setDraft('')
  }

  return (
    <aside
      className="hidden w-80 shrink-0 flex-col border-l bg-card xl:flex"
      aria-label={t('studio.chat.title')}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold">{t('studio.chat.title')}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {t('studio.chat.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          aria-label={t('studio.chat.reset')}
          title={t('studio.chat.reset')}
          disabled={chat.isLoading}
          onClick={() => setResetOpen(true)}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
        aria-live="polite"
      >
        <div className="mt-auto grid gap-3">
          {chat.messages.length === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-center">
              <Bot className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-xs font-semibold">
                {t('studio.chat.emptyTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('studio.chat.emptyDescription')}
              </p>
            </div>
          )}
          {chat.messages.map((message, index) => {
            if (message.role === 'user') {
              return (
                <div
                  key={`${message.role}-${index}`}
                  className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground"
                >
                  {messageText(message.content)}
                </div>
              )
            }
            if (message.role !== 'assistant') return null

            const content = messageText(message.content)
            return (
              <div key={`${message.role}-${index}`} className="grid gap-1.5">
                {content && (
                  <div className="mr-5 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs leading-5 text-foreground">
                    <MarkdownMessage content={messageText(message.content)} />
                  </div>
                )}
                {message.toolCalls.map((toolCall) => (
                  <ToolActivityMessage
                    key={toolCall.toolCallId}
                    name={toolCall.name}
                    status={toolCall.status}
                    failed={
                      toolCall.status === 'done' &&
                      toolCall.result.status === 'rejected'
                    }
                  />
                ))}
              </div>
            )
          })}
          {chat.isLoading && (
            <div className="mr-auto flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {t('studio.chat.thinking')}
            </div>
          )}
          {chat.error && (
            <p role="alert" className="text-xs leading-5 text-danger">
              {t('studio.chat.error')}
            </p>
          )}
          {persistenceError && (
            <p role="alert" className="text-xs leading-5 text-danger">
              {t('studio.chat.persistenceError')}
            </p>
          )}
        </div>
      </div>

      <form className="shrink-0 border-t p-3" onSubmit={send}>
        <Textarea
          value={draft}
          rows={3}
          placeholder={t('studio.chat.placeholder')}
          aria-label={t('studio.chat.inputLabel')}
          disabled={chat.isLoading}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          {chat.isLoading ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => chat.stop()}
            >
              <Square className="size-3.5" />
              {t('studio.chat.stop')}
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              <SendHorizontal className="size-3.5" />
              {t('studio.chat.send')}
            </Button>
          )}
        </div>
      </form>
      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('studio.chat.resetTitle')}
        description={t('studio.chat.resetDescription')}
      >
        <Button variant="outline" onClick={() => setResetOpen(false)}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="danger"
          disabled={resetting}
          onClick={() => void resetConversation()}
        >
          {resetting
            ? t('studio.chat.resetting')
            : t('studio.chat.confirmReset')}
        </Button>
      </Dialog>
    </aside>
  )
}

function restoreConversation(
  messages: unknown[],
): Chat.Message<string, Chat.AnyTool>[] {
  return messages.filter((message) => {
    if (!message || typeof message !== 'object' || !('role' in message))
      return false
    if (message.role === 'user' || message.role === 'error')
      return 'content' in message && typeof message.content === 'string'
    return (
      message.role === 'assistant' &&
      'toolCalls' in message &&
      Array.isArray(message.toolCalls)
    )
  }) as Chat.Message<string, Chat.AnyTool>[]
}

function serializeConversation(
  messages: Chat.Message<string, Chat.AnyTool>[],
): unknown[] {
  return JSON.parse(JSON.stringify(messages)) as unknown[]
}

const toolActivityKeys: Record<string, string> = {
  get_current_agent_config: 'studio.chat.tools.readAgentConfig',
  patch_current_agent_config: 'studio.chat.tools.updateAgentConfig',
  get_mcp_definition: 'studio.chat.tools.readMcpDefinition',
  patch_mcp_definition: 'studio.chat.tools.updateMcpDefinition',
  add_mcp_server: 'studio.chat.tools.addMcpServer',
  list_files: 'studio.chat.tools.listFiles',
  read_file: 'studio.chat.tools.readFile',
  put_file: 'studio.chat.tools.writeFile',
  delete_file: 'studio.chat.tools.deleteFile',
}

function ToolActivityMessage({
  name,
  status,
  failed,
}: {
  name: string
  status: 'pending' | 'done'
  failed: boolean
}) {
  const { t } = useTranslation()
  const label = t(toolActivityKeys[name] ?? 'studio.chat.tools.working')

  return (
    <div className="mr-auto flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-[11px] text-muted-foreground">
      {status === 'pending' ? (
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
      ) : failed ? (
        <CircleAlert className="size-3 text-danger" aria-hidden="true" />
      ) : (
        <Check className="size-3 text-success" aria-hidden="true" />
      )}
      <span>{label}</span>
      <span className="sr-only">
        {failed
          ? t('studio.chat.tools.failed')
          : status === 'done'
            ? t('studio.chat.tools.complete')
            : t('studio.chat.tools.inProgress')}
      </span>
    </div>
  )
}

function messageText(content: unknown) {
  if (typeof content === 'string') return content
  if (content === undefined || content === null) return ''
  return JSON.stringify(content)
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-background/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-border [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background/70 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-background/50 [&_th]:p-1.5 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
