/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_ODCLOUD_API_KEY: string
  readonly VITE_ODCLOUD_BASE_URL: string
  readonly VITE_ODCLOUD_ENDPOINT_PATH: string
  readonly VITE_DART_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
