/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for the scan/explain API. Empty in dev (proxied). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
