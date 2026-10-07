import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Tabs, Textarea } from '@mba-desk/ui'

type Mode = 'visual' | 'source'

export function SkillMarkdownEditor({
  label,
  value,
  maxLength = 20_000,
  onChange,
  labels,
}: {
  label: string
  value: string
  maxLength?: number
  onChange: (value: string) => void
  labels: {
    modes: string
    visual: string
    source: string
    editor: string
    bold: string
    italic: string
    heading: string
    bullets: string
    numbered: string
  }
}) {
  const [mode, setMode] = useState<Mode>('visual')
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValue = useRef<string | null>(null)

  useEffect(() => {
    if (mode !== 'visual' || !editorRef.current) return
    if (htmlToMarkdown(editorRef.current.innerHTML) === value) return
    editorRef.current.innerHTML = markdownToHtml(value)
    lastValue.current = value
  }, [mode, value])

  const command = (name: string, argument?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    if (!editorRef.current) return
    const next = htmlToMarkdown(editorRef.current.innerHTML)
    lastValue.current = next
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Tabs
          items={[
            { value: 'visual', label: labels.visual },
            { value: 'source', label: labels.source },
          ]}
          value={mode}
          variant="pills"
          size="compact"
          onValueChange={setMode}
          ariaLabel={labels.modes}
        />
      </div>
      {mode === 'source' ? (
        <Textarea
          className="min-h-72 font-mono text-xs"
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex flex-wrap gap-1 border-b bg-muted/20 p-2">
            <ToolbarButton label={labels.bold} onClick={() => command('bold')}>
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label={labels.italic}
              onClick={() => command('italic')}
            >
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label={labels.heading}
              onClick={() => command('formatBlock', 'h2')}
            >
              <Heading2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label={labels.bullets}
              onClick={() => command('insertUnorderedList')}
            >
              <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label={labels.numbered}
              onClick={() => command('insertOrderedList')}
            >
              <ListOrdered className="size-4" />
            </ToolbarButton>
          </div>
          <div
            ref={editorRef}
            className="prose min-h-72 max-w-none px-4 py-3 text-sm leading-6 outline-none [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_strong]:font-bold [&_ul]:list-disc"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={labels.editor}
            aria-multiline="true"
            onInput={(event) => {
              const next = htmlToMarkdown(event.currentTarget.innerHTML).slice(
                0,
                maxLength,
              )
              lastValue.current = next
              onChange(next)
            }}
          />
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function markdownToHtml(markdown: string): string {
  const inline = (value: string) =>
    escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) output.push(`</${list}>`)
    list = null
  }
  for (const line of lines) {
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const numbered = line.match(/^\d+\.\s+(.+)$/)
    if (bullet || numbered) {
      const nextList = bullet ? 'ul' : 'ol'
      if (list !== nextList) {
        closeList()
        list = nextList
        output.push(`<${list}>`)
      }
      output.push(`<li>${inline((bullet ?? numbered)?.[1] ?? '')}</li>`)
    } else {
      closeList()
      if (!line.trim()) output.push('<p><br></p>')
      else if (line.startsWith('## '))
        output.push(`<h2>${inline(line.slice(3))}</h2>`)
      else if (line.startsWith('# '))
        output.push(`<h2>${inline(line.slice(2))}</h2>`)
      else output.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return output.join('')
}

function htmlToMarkdown(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html
  const render = (node: Node, listIndex = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const children = [...node.childNodes]
      .map((child, index) => render(child, index))
      .join('')
    switch (node.tagName) {
      case 'STRONG':
      case 'B':
        return `**${children}**`
      case 'EM':
      case 'I':
        return `*${children}*`
      case 'CODE':
        return `\`${children}\``
      case 'H1':
        return `# ${children}\n\n`
      case 'H2':
        return `## ${children}\n\n`
      case 'P':
      case 'DIV':
        return `${children}\n\n`
      case 'BR':
        return '\n'
      case 'LI':
        return `${node.parentElement?.tagName === 'OL' ? `${listIndex + 1}.` : '-'} ${children.trim()}\n`
      case 'UL':
      case 'OL':
        return `${children}\n`
      default:
        return children
    }
  }
  return [...root.childNodes]
    .map((node, index) => render(node, index))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
