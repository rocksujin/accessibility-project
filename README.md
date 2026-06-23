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

### Environment variables

See `.env.example` for the full list. The key ones:

| Variable | Side | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Enables the `/api/explain` endpoint (AI fix suggestions). |
| `PORT` | server | Port the scan server listens on (default `3001`; host platforms usually inject this). |
| `ALLOWED_ORIGINS` | server | Comma-separated CORS allowlist of frontend origins. Default `*` allows any. Lock this down in production, e.g. `https://<your-username>.github.io`. |
| `VITE_API_BASE` | frontend (build-time) | Backend origin the SPA calls. Leave **unset** in dev (Vite proxies `/api` to `:3001`). Set it when building for static hosting so POSTs hit the real backend instead of returning 405. |

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

The frontend and the scan server deploy separately.

### Frontend (static SPA)

Build and host on any static host (GitHub Pages, Netlify, etc.):

```sh
VITE_API_BASE=https://your-backend.onrender.com npm run build
```

`VITE_API_BASE` is baked in at build time so the SPA's `POST /api/scan` and `/api/explain` calls hit the deployed backend instead of the static host (which would return 405). Leave it unset for local dev — `src/api.ts` falls back to same-origin and Vite proxies `/api` to `:3001`.

### Scan server (Docker)

The backend needs Playwright/Chromium, so it ships as a Docker image built on Microsoft's Playwright base image (Chromium + OS libraries preinstalled). See `Dockerfile`.

```sh
docker build -t kayai-scan .
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e ALLOWED_ORIGINS=https://<your-username>.github.io \
  kayai-scan
```

This runs on any container host that supports it (Render, Fly.io, Railway, a VPS). The container reads `$PORT` (injected by most platforms, default `3001`) and `ALLOWED_ORIGINS` for CORS. The server runs the TypeScript directly via `tsx` (`npm start`) — no separate build step.
