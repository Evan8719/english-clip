import { listEntries } from '../db/entries'
import { nowIso } from './normalize'

export async function exportEntriesJson(): Promise<void> {
  const entries = await listEntries()
  const payload = {
    exportedAt: nowIso(),
    version: 1,
    entries,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `english-clip-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
