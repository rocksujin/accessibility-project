import type { Page } from 'playwright'
import type { ScannedStop, StopType, ScannedIssue } from './types.js'

export const VIEWPORT = { w: 1280, h: 800 }

type RawStop = {
  tag: string
  type: StopType
  label: string
  rect: { x: number; y: number; w: number; h: number }
  contrastInfo: { ratio: number; fg: string; bg: string } | null
  outlineRemoved: boolean
}

export async function scanUrl(page: Page, url: string): Promise<{
  finalUrl: string
  stops: ScannedStop[]
  screenshot: string
}> {
  await page.setViewportSize({ width: VIEWPORT.w, height: VIEWPORT.h })

  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 15_000,
  }).catch(async (e) => {
    // networkidle can hang on long-polling sites; fall back to domcontentloaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    void e
  })

  // give late JS a beat to render UI controls
  await page.waitForTimeout(400)

  const finalUrl = page.url()

  const rawStops = await page.evaluate(extractStopsInPage)
  const screenshotBuf = await page.screenshot({ fullPage: false, type: 'png' })
  const screenshot = `data:image/png;base64,${screenshotBuf.toString('base64')}`

  const stops: ScannedStop[] = rawStops.map((s) => ({
    tag: s.tag,
    type: s.type,
    label: s.label,
    rect: s.rect,
    issue: deriveIssue(s) ?? undefined,
  }))

  return { finalUrl, stops, screenshot }
}

const HTML_PAGE_TEMPLATE = (body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #ffffff; color: #111; }
    </style>
  </head>
  <body>${body}</body>
</html>`

export async function scanHtml(page: Page, html: string): Promise<{
  stops: ScannedStop[]
  screenshot: string
}> {
  await page.setViewportSize({ width: VIEWPORT.w, height: VIEWPORT.h })

  // If the user pasted a fragment, wrap it so the page has a baseline document.
  const isFullDoc = /<html[\s>]/i.test(html) || /<!doctype/i.test(html)
  const content = isFullDoc ? html : HTML_PAGE_TEMPLATE(html)

  await page.setContent(content, { waitUntil: 'load', timeout: 5_000 })
  await page.waitForTimeout(150)

  const rawStops = await page.evaluate(extractStopsInPage)

  // Clip the screenshot to the body's actual content so tiny snippets don't
  // get rendered with a giant 1280x800 sea of whitespace.
  const bodyRect = await page.evaluate(() => {
    const b = document.body
    const r = b.getBoundingClientRect()
    return {
      width: Math.max(320, Math.min(window.innerWidth, Math.ceil(r.width))),
      height: Math.max(120, Math.min(window.innerHeight, Math.ceil(r.height + 24))),
    }
  })

  const screenshotBuf = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: bodyRect.width, height: bodyRect.height },
  })
  const screenshot = `data:image/png;base64,${screenshotBuf.toString('base64')}`

  const stops: ScannedStop[] = rawStops.map((s) => ({
    tag: s.tag,
    type: s.type,
    label: s.label,
    rect: s.rect,
    issue: deriveIssue(s) ?? undefined,
  }))

  return { stops, screenshot }
}

function deriveIssue(s: RawStop): ScannedIssue | null {
  if (!s.label) {
    return {
      kind: 'no-label',
      detail: `${humanType(s.type)} has no accessible name. Screen readers will announce it as just "${s.type}".`,
    }
  }
  if (s.contrastInfo && s.contrastInfo.ratio < 4.5) {
    return {
      kind: 'low-contrast',
      detail: `Text contrast is ${s.contrastInfo.ratio.toFixed(2)}:1 (needs 4.5:1 for AA). Foreground ${s.contrastInfo.fg} on background ${s.contrastInfo.bg}.`,
    }
  }
  if (s.outlineRemoved) {
    return {
      kind: 'invisible-focus',
      detail: 'CSS removes the default focus outline without a visible replacement. Keyboard users lose track of their position.',
    }
  }
  return null
}

function humanType(t: StopType): string {
  if (t === 'link') return 'Link'
  if (t === 'button') return 'Button'
  if (t === 'input') return 'Input'
  if (t === 'textarea') return 'Textarea'
  return 'Control'
}

/**
 * Runs inside the target page via `page.evaluate`. Keep this hermetic — no
 * external imports, no closures, just web APIs.
 */
function extractStopsInPage(): RawStop[] {
  const SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  function typeOf(el: Element): StopType {
    const tag = el.tagName
    if (tag === 'A') return 'link'
    if (tag === 'BUTTON') return 'button'
    if (tag === 'INPUT') return 'input'
    if (tag === 'TEXTAREA') return 'textarea'
    if (tag === 'SELECT') return 'input'
    return 'other'
  }

  function accessibleName(el: HTMLElement): string {
    const ariaLabel = el.getAttribute('aria-label')?.trim()
    if (ariaLabel) return ariaLabel

    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ')
      if (text) return text
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.labels && el.labels.length > 0) {
        const lt = Array.from(el.labels).map((l) => l.textContent?.trim() || '').filter(Boolean).join(' ')
        if (lt) return lt
      }
      const placeholder = (el as HTMLInputElement).placeholder?.trim?.()
      // placeholder is NOT a real label, but we surface it so the label heuristic
      // can show "input has only a placeholder" rather than reporting blank text.
      if (placeholder) return ''
    }

    if (el instanceof HTMLImageElement) {
      const alt = el.alt?.trim()
      if (alt) return alt
    }

    const text = el.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text

    const title = el.getAttribute('title')?.trim()
    if (title) return title

    return ''
  }

  function parseColor(str: string): [number, number, number, number] | null {
    const m = str.match(/^rgba?\(([^)]+)\)$/)
    if (!m) return null
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    if (parts.length < 3) return null
    return [parts[0], parts[1], parts[2], parts[3] ?? 1]
  }

  function relLuminance(r: number, g: number, b: number): number {
    const trans = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * trans(r) + 0.7152 * trans(g) + 0.0722 * trans(b)
  }

  function contrastRatio(a: [number, number, number, number], b: [number, number, number, number]): number {
    const la = relLuminance(a[0], a[1], a[2])
    const lb = relLuminance(b[0], b[1], b[2])
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
  }

  function effectiveBg(el: HTMLElement): [number, number, number, number] | null {
    let cur: HTMLElement | null = el
    while (cur) {
      const cs = getComputedStyle(cur)
      const bg = parseColor(cs.backgroundColor)
      const bgImg = cs.backgroundImage
      if (bgImg && bgImg !== 'none') return null
      if (bg && bg[3] > 0) return bg
      cur = cur.parentElement
    }
    return [255, 255, 255, 1]
  }

  function computeContrast(el: HTMLElement): { ratio: number; fg: string; bg: string } | null {
    const cs = getComputedStyle(el)
    if (!el.textContent || !el.textContent.trim()) return null
    const fg = parseColor(cs.color)
    if (!fg) return null
    const bg = effectiveBg(el)
    if (!bg) return null
    return {
      ratio: contrastRatio(fg, bg),
      fg: `rgb(${Math.round(fg[0])}, ${Math.round(fg[1])}, ${Math.round(fg[2])})`,
      bg: `rgb(${Math.round(bg[0])}, ${Math.round(bg[1])}, ${Math.round(bg[2])})`,
    }
  }

  function outlineLooksRemoved(el: HTMLElement): boolean {
    const cs = getComputedStyle(el)
    const outline = cs.outlineStyle
    const boxShadow = cs.boxShadow
    if (outline !== 'none' && outline !== '') return false
    if (boxShadow && boxShadow !== 'none') return false
    return true
  }

  const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
  const vw = window.innerWidth
  const vh = window.innerHeight

  const stops: RawStop[] = []
  for (const el of els) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue

    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    // only in-viewport for visualizer relevance
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue

    const type = typeOf(el)
    const label = accessibleName(el)
    const contrastInfo = (type === 'button' || type === 'link') ? computeContrast(el) : null
    const outlineRemoved = outlineLooksRemoved(el)

    stops.push({
      tag: el.tagName,
      type,
      label,
      rect: {
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        w: Math.min(vw, rect.width),
        h: Math.min(vh, rect.height),
      },
      contrastInfo,
      outlineRemoved,
    })
  }

  // Cap so the visualizer stays readable.
  return stops.slice(0, 40)
}
