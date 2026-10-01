import { Fragment, type ReactNode } from 'react'
import { cn } from '../ui'

const INLINE_MARKERS = [
  { marker: '```', tag: 'monospace' },
  { marker: '*', tag: 'bold' },
  { marker: '_', tag: 'italic' },
  { marker: '~', tag: 'strike' },
  { marker: '`', tag: 'code' },
] as const

type InlineTag = (typeof INLINE_MARKERS)[number]['tag']

export function WhatsAppText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div className={cn('whitespace-normal break-words', className)}>
      {renderMultilineText(text)}
    </div>
  )
}

function renderMultilineText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const multilineCode = /```([^`]*\n[\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null
  let section = 0

  while ((match = multilineCode.exec(text))) {
    if (match.index > cursor) {
      nodes.push(...renderLines(text.slice(cursor, match.index), section++))
    }
    nodes.push(
      <code
        key={`code-${section++}`}
        className="my-1 block overflow-x-auto whitespace-pre-wrap rounded-md bg-foreground/8 px-2 py-1 font-mono text-[0.92em]"
      >
        {match[1]}
      </code>,
    )
    cursor = match.index + match[0].length
  }
  if (cursor < text.length || nodes.length === 0) {
    nodes.push(...renderLines(text.slice(cursor), section))
  }
  return nodes
}

function renderLines(text: string, section: number): ReactNode[] {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const bullet = line.match(/^[*-]\s+(.+)$/)
    if (bullet) {
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index]?.match(/^[*-]\s+(.+)$/)
        if (!item) break
        items.push(item[1]!)
        index += 1
      }
      nodes.push(
        <ul
          key={`${section}-bullets-${index}`}
          className="list-outside list-disc pl-5"
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineText(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/)
    if (numbered) {
      const start = Number(numbered[1])
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index]?.match(/^\d+\.\s+(.+)$/)
        if (!item) break
        items.push(item[1]!)
        index += 1
      }
      nodes.push(
        <ol
          key={`${section}-numbers-${index}`}
          className="list-outside list-decimal pl-5"
          start={start}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineText(item)}</li>
          ))}
        </ol>,
      )
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const item = lines[index]?.match(/^>\s?(.*)$/)
        if (!item) break
        quoteLines.push(item[1]!)
        index += 1
      }
      nodes.push(
        <blockquote
          key={`${section}-quote-${index}`}
          className="border-l-2 border-current/30 pl-2"
        >
          {quoteLines.map((item, itemIndex) => (
            <Fragment key={itemIndex}>
              {itemIndex > 0 && <br />}
              {renderInlineText(item)}
            </Fragment>
          ))}
        </blockquote>,
      )
      continue
    }

    nodes.push(
      line ? (
        <div key={`${section}-line-${index}`}>{renderInlineText(line)}</div>
      ) : (
        <div key={`${section}-line-${index}`} className="h-[1lh]" aria-hidden />
      ),
    )
    index += 1
  }
  return nodes
}

function renderInlineText(text: string, keyPrefix = 'inline'): ReactNode[] {
  const match = findFirstInlineMatch(text)
  if (!match) return [text]

  const before = text.slice(0, match.start)
  const content = text.slice(match.contentStart, match.contentEnd)
  const after = text.slice(match.end)
  const contentNodes =
    match.tag === 'code' || match.tag === 'monospace'
      ? content
      : renderInlineText(content, `${keyPrefix}-nested`)

  return [
    before,
    formatInlineNode(match.tag, contentNodes, `${keyPrefix}-${match.start}`),
    ...renderInlineText(after, `${keyPrefix}-${match.end}`),
  ]
}

function findFirstInlineMatch(text: string): {
  tag: InlineTag
  start: number
  contentStart: number
  contentEnd: number
  end: number
} | null {
  for (let start = 0; start < text.length; start += 1) {
    for (const candidate of INLINE_MARKERS) {
      const { marker, tag } = candidate
      if (
        !text.startsWith(marker, start) ||
        !isOpeningBoundary(text, start, marker)
      ) {
        continue
      }
      const contentStart = start + marker.length
      for (let close = contentStart + 1; close < text.length; close += 1) {
        if (
          text.startsWith(marker, close) &&
          isClosingBoundary(text, close, marker)
        ) {
          return {
            tag,
            start,
            contentStart,
            contentEnd: close,
            end: close + marker.length,
          }
        }
      }
    }
  }
  return null
}

function isOpeningBoundary(
  text: string,
  index: number,
  marker: string,
): boolean {
  const previous = text[index - 1]
  const next = text[index + marker.length]
  return (
    Boolean(next && !/\s/.test(next)) &&
    (!previous || !/[\p{L}\p{N}]/u.test(previous))
  )
}

function isClosingBoundary(
  text: string,
  index: number,
  marker: string,
): boolean {
  const previous = text[index - 1]
  const next = text[index + marker.length]
  return (
    Boolean(previous && !/\s/.test(previous)) &&
    (!next || !/[\p{L}\p{N}]/u.test(next))
  )
}

function formatInlineNode(
  tag: InlineTag,
  content: ReactNode,
  key: string,
): ReactNode {
  if (tag === 'bold') return <strong key={key}>{content}</strong>
  if (tag === 'italic') return <em key={key}>{content}</em>
  if (tag === 'strike') return <s key={key}>{content}</s>
  return (
    <code
      key={key}
      className="rounded bg-foreground/8 px-1 py-0.5 font-mono text-[0.92em]"
    >
      {content}
    </code>
  )
}
