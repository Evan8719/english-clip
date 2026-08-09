import type { EntryKind } from '../types'

export function normalizeHeadword(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'“”‘’([{]+/, '')
    .replace(/[\s"'“”‘’)\]}.,!?;:]+$/, '')
    .replace(/\s+/g, ' ')
}

export function detectKind(text: string): EntryKind {
  const trimmed = text.trim()
  if (!trimmed) return 'word'
  if (/[.!?。！？]/.test(trimmed) || trimmed.split(/\s+/).length > 8) {
    return 'sentence'
  }
  if (/\s/.test(trimmed)) return 'phrase'
  return 'word'
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
