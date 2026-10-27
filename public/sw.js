/* English Clip — lightweight offline shell + lexicon cache */
const VERSION = 'english-clip-v11'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/zh-gloss.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isStaticPack =
    url.pathname.endsWith('/lexicon.json') || url.pathname.endsWith('/zh-gloss.json')
  const isSameOrigin = url.origin === self.location.origin

  if (isStaticPack) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (isSameOrigin) {
    event.respondWith(networkFallingBackToCache(request))
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(VERSION)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

async function networkFallingBackToCache(request) {
  const cache = await caches.open(VERSION)
  try {
    const response = await fetch(request)
    if (response.ok && (request.url.includes('/assets/') || request.mode === 'navigate')) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/index.html')
      if (fallback) return fallback
    }
    throw new Error('Offline and not cached')
  }
}
