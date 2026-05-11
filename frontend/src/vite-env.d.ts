/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly [key: `VITE_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
