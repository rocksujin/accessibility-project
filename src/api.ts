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
