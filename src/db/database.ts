import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Entry, Lemma } from '../types'

interface ClipDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: {
      'by-updated': string
      'by-created': string
      'by-reviewed': string
    }
  }
  lemmaCache: {
    key: string
    value: Lemma
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

const DB_NAME = 'english-clip'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ClipDB>> | null = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ClipDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' })
          store.createIndex('by-updated', 'updatedAt')
          store.createIndex('by-created', 'createdAt')
          store.createIndex('by-reviewed', 'lastReviewedAt')
        }
        if (!db.objectStoreNames.contains('lemmaCache')) {
          db.createObjectStore('lemmaCache', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}
