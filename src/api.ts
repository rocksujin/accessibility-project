// Base URL for the scan/explain backend.
//
// - In dev, leave VITE_API_BASE unset: Vite proxies "/api" to localhost:3001
//   (see vite.config.ts), so requests stay same-origin.
// - In production (static hosting like GitHub Pages, which only serves GET and
//   returns 405 for the POSTs the scanner makes), set VITE_API_BASE at build
//   time to the deployed backend origin, e.g.
//     VITE_API_BASE=https://kayai-scan.onrender.com
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

/** Build an absolute URL for an API path like "/api/scan". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Error thrown for a non-OK API response; carries the HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ScanStop = {
  tag: string;
  type: string;
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  issue?: { kind: string; detail: string };
};

export type ScanResponse = {
  url: string;
  finalUrl: string;
  viewport: { w: number; h: number };
  screenshot: string | null;
  stops: ScanStop[];
};

/** POST a URL to the scan backend. Resolves with the scan data, or throws an
 *  ApiError carrying the HTTP status on failure. */
export async function requestScan(url: string): Promise<ScanResponse> {
  const res = await fetch(apiUrl("/api/scan"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || j.error || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export type ScanErrorInfo = { heading: string; message: string };

// Turn a raw scan failure into a specific, human message. We classify on the
// backend HTTP status and the upstream response status / Playwright error text.
export function describeScanError(err: unknown): ScanErrorInfo {
  const status = err instanceof ApiError ? err.status : 0;
  const raw = err instanceof Error ? err.message : String(err);
  const d = raw.toLowerCase();

  // Our own backend couldn't be reached (e.g. static host answered the POST, or
  // VITE_API_BASE points at the wrong place).
  if (status === 404 || status === 405) {
    return {
      heading: "Scanner offline",
      message:
        "The scanner service couldn't be reached. Please try again in a moment.",
    };
  }

  // The backend rejected the input as not a valid URL.
  if (status === 400) {
    return {
      heading: "Invalid URL",
      message: "That isn't a valid http(s) address. Check it and try again.",
    };
  }

  const upstream = raw.match(/UPSTREAM_STATUS (\d+)/);
  const upstreamCode = upstream ? Number(upstream[1]) : 0;

  // The page doesn't exist: unknown domain (DNS) or a 404/410 from the server.
  if (
    upstreamCode === 404 ||
    upstreamCode === 410 ||
    d.includes("err_name_not_resolved") ||
    d.includes("name not resolved") ||
    d.includes("enotfound") ||
    d.includes("getaddrinfo")
  ) {
    return {
      heading: "Page not found",
      message:
        "That page doesn't exist. Double-check the URL for typos and try again.",
    };
  }

  // The site blocked our automated browser: bot protection, login wall, or rate
  // limiting (403/401/429/451/503), or the navigation timed out / was aborted.
  if (
    upstreamCode === 401 ||
    upstreamCode === 403 ||
    upstreamCode === 407 ||
    upstreamCode === 429 ||
    upstreamCode === 451 ||
    upstreamCode === 503 ||
    d.includes("timeout") ||
    d.includes("err_aborted") ||
    d.includes("err_http2") ||
    d.includes("err_connection") ||
    d.includes("econnrefused") ||
    d.includes("blocked")
  ) {
    return {
      heading: "Site blocked the scan",
      message:
        "This site blocked our automated browser. Try a different, publicly accessible page.",
    };
  }

  // Any other upstream error response.
  if (upstreamCode >= 400) {
    return {
      heading: "Page couldn't be loaded",
      message: `The site returned an error (HTTP ${upstreamCode}), so there was nothing to scan.`,
    };
  }

  return {
    heading: "Scan failed",
    message: raw || "The scanner returned an error.",
  };
}
