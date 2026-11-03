import { unzipSync, strFromU8 } from 'fflate'
import { getDb } from '../db/database'
import { getStoredUserId } from './sync'

export interface BookChapter { title: string; paragraphs: string[] }
export interface BookData { title: string; author: string; chapters: BookChapter[] }
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export function estimateLevel(text: string) {
  const words = text.match(/[A-Za-z]+/g) || []
  if (words.length < 30) return ''
  const sentenceLength = words.length / Math.max(1, (text.match(/[.!?]+/g) || []).length)
  const longRatio = words.filter((word) => word.length > 7).length / words.length
  const score = sentenceLength + longRatio * 35
  return score < 12 ? 'A1' : score < 17 ? 'A2' : score < 23 ? 'B1' : score < 30 ? 'B2' : score < 38 ? 'C1' : 'C2'
}
export function cleanTranscript(text: string) {
  if (/\nREAD\s*\n/.test(text)) return text.split(/\nREAD\s*\n/).slice(1).join('\n').trim()
  return text.replace(/^\d+\s*$/gm, '').replace(/^.*-->.*$/gm, '').replace(/<[^>]*>/g, '').trim()
}
export function parseTimedTranscript(text: string): Array<{ start: number; end: number; text: string }> {
  const seconds = (value: string) => value.replace(',', '.').split(':').reduce((sum, part) => sum * 60 + Number(part), 0)
  const result = []
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n'), index = lines.findIndex((line) => line.includes('-->'))
    if (index < 0) continue
    const match = lines[index].match(/([\d:. ,]+)\s*-->\s*([\d:.,]+)/)
    if (!match) continue
    const start = seconds(match[1].trim()), end = seconds(match[2].trim())
    const content = lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0 && content) result.push({ start, end, text: content })
  }
  return result
}
export async function contentHash(file: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map((v) => v.toString(16).padStart(2, '0')).join('')
}
export async function parseEpub(file: File): Promise<BookData> {
  if (file.size > 30 * 1024 * 1024) throw Error('电子书请控制在 30 MB 内')
  let total = 0
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => { total += entry.originalSize; if (total > 40 * 1024 * 1024) throw Error('电子书解压内容过大'); return /\.(xml|opf|xhtml|html|htm)$/i.test(entry.name) } })
  const xml = (path: string) => new DOMParser().parseFromString(strFromU8(zip[path] || new Uint8Array()), 'application/xml')
  const root = xml('META-INF/container.xml').querySelector('rootfile')?.getAttribute('full-path')
  if (!root || !zip[root]) throw Error('无法读取 EPUB 目录，请检查文件是否下载完整')
  const opf = xml(root), base = root.includes('/') ? root.slice(0, root.lastIndexOf('/') + 1) : ''
  const resolvePath = (href: string) => decodeURIComponent(new URL(href, `https://epub.local/${base}`).pathname.slice(1))
  const manifest = new Map([...opf.querySelectorAll('manifest > item')].map((item) => [item.getAttribute('id'), item.getAttribute('href') || '']))
  const chapters: BookChapter[] = []
  for (const ref of opf.querySelectorAll('spine > itemref')) {
    const path = resolvePath(manifest.get(ref.getAttribute('idref')) || '')
    if (!zip[path]) continue
    const doc = new DOMParser().parseFromString(strFromU8(zip[path]), 'text/html')
    doc.querySelectorAll('script,style,nav,iframe,object,svg').forEach((node) => node.remove())
    const paragraphs = [...doc.querySelectorAll('p,h1,h2,h3,blockquote')].map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean)
    if (paragraphs.length) chapters.push({ title: doc.querySelector('h1,h2,h3')?.textContent?.trim() || `第 ${chapters.length + 1} 节`, paragraphs })
  }
  if (!chapters.length) throw Error('书籍没有可读取的正文，暂不支持加密 EPUB')
  return { title: opf.getElementsByTagNameNS('*', 'title')[0]?.textContent || file.name.replace(/\.epub$/i, ''), author: opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent || '', chapters }
}
export async function cacheMaterial<T>(id: string, value: T) { const uid = getStoredUserId(); if (uid) await (await getDb()).put('meta', { key: `material:${uid}:${id}`, value }) }
export async function readCachedMaterial<T>(id: string): Promise<T | null> { const uid = getStoredUserId(); if (!uid) return null; return (await (await getDb()).get('meta', `material:${uid}:${id}`))?.value as T || null }
