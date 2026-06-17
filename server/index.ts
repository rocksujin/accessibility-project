import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import { scanHtml, scanUrl, VIEWPORT } from './scan.js'
import { streamExplain, type ExplainRequest } from './explain.js'
import type {
  ScanError,
  ScanHtmlResponse,
  ScanResponse,
} from './types.js'

const PORT = Number(process.env.PORT) || 3001

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser
  browser = await chromium.launch({ headless: true })
  return browser
}

async function newScanContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  const context = await b.newContext({
    viewport: { width: VIEWPORT.w, height: VIEWPORT.h },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (kayai-scanner)',
  })
  // tsx/esbuild wraps named functions in __name(). When we ship our extractor
  // to the page via page.evaluate(fn), that __name call is included — so we
  // shim it on every page in this context. The shim is a no-op.
  await context.addInitScript(() => {
    if (typeof (globalThis as { __name?: unknown }).__name !== 'function') {
      (globalThis as { __name: <T>(fn: T) => T }).__name = (fn) => fn
    }
  })
  return context
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    browser: browser?.isConnected() ? 'connected' : 'idle',
    viewport: VIEWPORT,
  })
})

app.post('/api/scan', async (req: Request, res: Response<ScanResponse | ScanError>) => {
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (!rawUrl) {
    res.status(400).json({ error: 'url is required' })
    return
  }

  let target: URL
  try {
    target = new URL(rawUrl)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      res.status(400).json({ error: 'only http(s) URLs are supported' })
      return
    }
  } catch {
    res.status(400).json({ error: 'invalid URL' })
    return
  }

  const start = Date.now()
  const context = await newScanContext()
  const page = await context.newPage()

  try {
    const result = await scanUrl(page, target.toString())
    const body: ScanResponse = {
      url: target.toString(),
      finalUrl: result.finalUrl,
      viewport: { w: VIEWPORT.w, h: VIEWPORT.h },
      screenshot: result.screenshot,
      stops: result.stops,
      durationMs: Date.now() - start,
    }
    res.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'scan failed',
      detail: message,
    })
  } finally {
    await context.close().catch(() => {})
  }
})

app.post(
  '/api/scan-html',
  async (req: Request, res: Response<ScanHtmlResponse | ScanError>) => {
    const html = typeof req.body?.html === 'string' ? req.body.html : ''
    if (!html.trim()) {
      res.status(400).json({ error: 'html is required' })
      return
    }
    if (html.length > 200_000) {
      res.status(413).json({ error: 'html too large (max 200KB)' })
      return
    }

    const start = Date.now()
    const context = await newScanContext()
    const page = await context.newPage()

    try {
      const result = await scanHtml(page, html)
      const body: ScanHtmlResponse = {
        screenshot: result.screenshot,
        stops: result.stops,
        durationMs: Date.now() - start,
      }
      res.json(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(400).json({
        error: 'scan failed',
        detail: message,
      })
    } finally {
      await context.close().catch(() => {})
    }
  },
)

app.post('/api/explain', async (req: Request, res: Response) => {
  const body = req.body as Partial<ExplainRequest>
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid body' })
    return
  }
  if (!body.kind || !body.element || !body.detail || !body.source) {
    res.status(400).json({ error: 'kind, element, detail, source are required' })
    return
  }

  // NDJSON streaming: one JSON object per line, no buffering.
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const write = (obj: unknown) => {
    res.write(JSON.stringify(obj) + '\n')
  }

  try {
    for await (const text of streamExplain(body as ExplainRequest)) {
      write({ type: 'text', text })
    }
    write({ type: 'done' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    write({ type: 'error', error: message })
  } finally {
    res.end()
  }
})

const server = app.listen(PORT, () => {
  console.log(`[scan-server] listening on http://localhost:${PORT}`)
})

async function shutdown() {
  console.log('[scan-server] shutting down')
  await browser?.close().catch(() => {})
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
