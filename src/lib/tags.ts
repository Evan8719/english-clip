export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,，、;；\n]+/).map(tag => tag.trim().replace(/^#+/, '').trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
}
