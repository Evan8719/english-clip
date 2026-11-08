export function coverImageUrl(path: string) { return path.startsWith('/') ? `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}${path}` : path }
