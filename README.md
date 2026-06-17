# kayai

Accessibility checker for the modern web — measures pages against WCAG 2.2 AA and KWCAG 2.2 (한국형), and visualizes keyboard navigation with real screenshots of the target page.

## Stack

- **Frontend**: React 19 + Vite + SCSS
- **Routing**: react-router-dom v7
- **Scan server**: Express + Playwright (local Node process)

## Setup

```sh
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
```

The `postinstall` hook downloads Chromium for Playwright (~170 MB; one-time, runs after every `npm install`). If you ever want to skip it, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` before installing.

### AI explanations (optional)

The Audit, Focus Flow, and Snippet Check pages have a **"✨ Explain & suggest fix"** button on each detected issue. Clicking it streams a plain-language explanation plus a code fix from Claude (Haiku 4.5).

To enable it:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Paste it into `.env` as `ANTHROPIC_API_KEY=sk-ant-...`.
3. Restart the scan server (`npm run dev`).

Without a key, the button still appears but clicking shows a clear error — the rest of the app works fine. Cost per explanation with Haiku is roughly **$0.001–0.005**.

**Privacy note for Snippet Check**: the pasted HTML is sent to Anthropic to generate the explanation. Don't paste anything sensitive.

## Running locally

```sh
npm run dev
```

This starts both processes concurrently:

- **Vite** on `http://localhost:5173` (frontend)
- **Scan server** on `http://localhost:3001` (Playwright + Express)

Vite proxies `/api/*` to `http://localhost:3001`, so frontend calls to `/api/scan` "just work" with no CORS setup.

Health check: `curl http://localhost:3001/health`.

## How the scan works

`POST /api/scan { url }` → the server:

1. Opens a fresh Chromium context (1280×800 viewport)
2. Navigates to the URL (15 s timeout, `networkidle` → `domcontentloaded` fallback)
3. Takes a viewport screenshot
4. Runs an in-page evaluator that:
   - finds all focusable elements (links, buttons, inputs, `[tabindex]`)
   - records each one's bounding rect, accessible name, and tag
   - flags issues: missing label, low contrast (<4.5:1), removed focus outline

Response includes a base64 PNG screenshot and a `stops[]` array with viewport-pixel coordinates that the frontend overlays directly. See `server/types.ts` for the full shape.

## Sites that won't scan

- **Cloudflare-protected pages** — bot challenge blocks the headless browser.
- **Login walls / paywalls** — anything past auth.
- **SPAs that never hit `networkidle`** — long-polling, websockets, or heavy analytics. The scanner falls back to `domcontentloaded` after 15s, which usually still works but may capture an incomplete state.

When a scan fails, the Keyboard page shows an error state with a **Try again** button and a **Use demo mock →** button that loads the built-in schematic so the visualizer is still useful.

## Tuning

- **Viewport**: edit `VIEWPORT` in `server/scan.ts` (currently 1280×800).
- **Navigation timeout**: 15 s primary + 10 s fallback in `scan.ts`.
- **Stop count cap**: 40 (in `extractStopsInPage`), to keep the visualizer readable.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite + scan server concurrently |
| `npm run dev:vite` | Frontend only |
| `npm run dev:server` | Scan server only (auto-restart on edit) |
| `npm run build` | Type-check + Vite production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the built frontend (no scan server) |

## Deployment

The frontend is a static SPA; build with `npm run build` and host on any static host.

The scan server is **not yet wired for production deployment.** It needs a Node host that supports installing Playwright/Chromium (Railway, Fly.io, Render, a small VPS). Adjust the frontend's API base URL (currently hard-coded as `/api/scan`) to point at the deployed server.
