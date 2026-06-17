import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-haiku-4-5-20251001'

export type ExplainRequest = {
  /** Where the issue came from. */
  source: 'scan' | 'snippet' | 'wcag' | 'kwcag'
  /** Stable issue identifier (e.g. "no-label", "1.1.1", "5.1.1"). */
  kind: string
  /** Human-friendly label of the element or rule ("Email input", "Images missing alt"). */
  element: string
  /** Existing detail text from the scanner / WCAG library. */
  detail: string
  /** Optional raw HTML snippet (Snippet Check only). */
  html?: string
  /** Optional WCAG/KWCAG reference for context ("1.1.1 Non-text Content"). */
  reference?: string
  /** Response language. */
  language?: 'en' | 'ko'
}

const SYSTEM_PROMPT = `You are a senior web-accessibility expert. A developer has detected an
accessibility issue on their page and wants a clear explanation plus a concrete fix.

Respond in Markdown with exactly two sections in this order:

## Why this matters
Two or three sentences explaining the real-world user impact — who is affected and how.
Reference the relevant WCAG criterion when it adds clarity. No preamble, no restating
the issue title.

## Suggested fix
One fenced HTML code block showing the corrected markup. Keep it minimal — only the
elements that need to change, not the whole page. After the code block, add 1-2 lines
in plain text describing what changed.

Hard rules:
- Total response under 220 words.
- Never wrap your response in a top-level heading; start directly with "## Why this matters".
- If the response language is Korean, write both sections in Korean (but keep code as-is).
- If you do not have enough information to give a concrete fix, say so honestly in one
  line rather than inventing markup.
- Do not apologize, do not say "Sure" or "Here is" — go straight to the explanation.`

function userPrompt(req: ExplainRequest): string {
  const lines: string[] = []
  lines.push(`Issue kind: ${req.kind}`)
  lines.push(`Element: ${req.element}`)
  lines.push(`Source: ${req.source}`)
  if (req.reference) lines.push(`Reference: ${req.reference}`)
  lines.push('')
  lines.push(`Detail from scanner: ${req.detail}`)
  if (req.html) {
    lines.push('')
    lines.push('HTML snippet:')
    lines.push('```html')
    lines.push(req.html.slice(0, 8_000))
    lines.push('```')
  }
  if (req.language === 'ko') {
    lines.push('')
    lines.push('Respond in Korean.')
  }
  return lines.join('\n')
}

export async function* streamExplain(req: ExplainRequest): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env and restart the scan server.',
    )
  }

  const client = new Anthropic({ apiKey })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 700,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt(req) }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta' &&
      event.delta.text
    ) {
      yield event.delta.text
    }
  }
}
