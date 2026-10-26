/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 自建后端地址；留空表示同源（NAS 部署） */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
