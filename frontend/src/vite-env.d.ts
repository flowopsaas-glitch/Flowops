/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // add other env variables here...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
