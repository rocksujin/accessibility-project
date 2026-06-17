import { useRef, useState } from 'react'
import './ExplainPanel.scss'

export type ExplainPayload = {
  source: 'scan' | 'snippet' | 'wcag' | 'kwcag'
  kind: string
  element: string
  detail: string
  html?: string
  reference?: string
  language?: 'en' | 'ko'
}

type Phase = 'idle' | 'streaming' | 'done' | 'error'

/**
 * Tiny inline renderer: handles fenced code blocks (```html ... ```) and
 * markdown headings (## Title). Anything else renders as plain paragraphs.
 * Good enough for the structured response shape we ask Claude to produce.
 */
function renderMarkdown(text: string) {
  const parts: { kind: 'text' | 'code' | 'heading'; content: string }[] = []
  let rest = text
  while (rest.length > 0) {
    const fenceStart = rest.indexOf('```')
    if (fenceStart < 0) {
      parts.push({ kind: 'text', content: rest })
      break
    }
    if (fenceStart > 0) parts.push({ kind: 'text', content: rest.slice(0, fenceStart) })
    const afterFence = rest.slice(fenceStart + 3)
    const fenceEnd = afterFence.indexOf('```')
    if (fenceEnd < 0) {
      // unterminated code block (still streaming)
      const firstNewline = afterFence.indexOf('\n')
      const body = firstNewline >= 0 ? afterFence.slice(firstNewline + 1) : afterFence
      parts.push({ kind: 'code', content: body })
      break
    }
    const block = afterFence.slice(0, fenceEnd)
    const firstNewline = block.indexOf('\n')
    const body = firstNewline >= 0 ? block.slice(firstNewline + 1) : block
    parts.push({ kind: 'code', content: body })
    rest = afterFence.slice(fenceEnd + 3)
  }

  return parts.flatMap((p, i) => {
    if (p.kind === 'code') {
      return [
        <pre key={`p-${i}`} className="explain-panel__code">
          <code>{p.content}</code>
        </pre>,
      ]
    }
    // Split text into headings + paragraphs
    return p.content
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para, j) => {
        if (para.startsWith('## ')) {
          return (
            <h4 key={`p-${i}-${j}`} className="explain-panel__h">
              {para.replace(/^##\s+/, '')}
            </h4>
          )
        }
        if (para.startsWith('# ')) {
          return (
            <h4 key={`p-${i}-${j}`} className="explain-panel__h">
              {para.replace(/^#\s+/, '')}
            </h4>
          )
        }
        return (
          <p key={`p-${i}-${j}`} className="explain-panel__p">
            {para}
          </p>
        )
      })
  })
}

export function ExplainPanel({ payload }: { payload: ExplainPayload }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = async () => {
    setPhase('streaming')
    setText('')
    setError(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(detail.slice(0, 240))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let parsed: { type: string; text?: string; error?: string }
          try {
            parsed = JSON.parse(trimmed)
          } catch {
            continue
          }
          if (parsed.type === 'text' && parsed.text) {
            setText((t) => t + parsed.text)
          } else if (parsed.type === 'done') {
            setPhase('done')
          } else if (parsed.type === 'error') {
            setError(parsed.error ?? 'Streaming failed.')
            setPhase('error')
          }
        }
      }
      setPhase((p) => (p === 'streaming' ? 'done' : p))
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    setPhase('idle')
    setText('')
  }

  if (phase === 'idle') {
    return (
      <div className="explain-panel">
        <button
          type="button"
          className="explain-panel__trigger"
          onClick={run}
          aria-label={`Explain "${payload.element}" with AI and suggest a fix`}
        >
          <span aria-hidden="true">✨</span> Explain &amp; suggest fix
        </button>
      </div>
    )
  }

  return (
    <div className="explain-panel" aria-live="polite">
      <div className="explain-panel__header">
        <span className="explain-panel__title">
          <span aria-hidden="true">✨</span> AI explanation
        </span>
        {phase === 'streaming' && (
          <button
            type="button"
            className="explain-panel__cancel"
            onClick={cancel}
          >
            Cancel
          </button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <button
            type="button"
            className="explain-panel__cancel"
            onClick={cancel}
          >
            Close
          </button>
        )}
      </div>

      <div className="explain-panel__body">
        {renderMarkdown(text)}
        {phase === 'streaming' && (
          <span className="explain-panel__caret" aria-hidden="true" />
        )}
        {phase === 'error' && (
          <p className="explain-panel__err" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className="explain-panel__foot">
        AI-generated by Claude. Verify before applying.
      </p>
    </div>
  )
}
