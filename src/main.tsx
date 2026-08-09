import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const isDesktop = Boolean(
  (window as Window & { englishClipDesktop?: { isDesktop?: boolean } }).englishClipDesktop
    ?.isDesktop,
)

// PWA SW is for browsers only; Electron loads dist via file://.
if (!isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ignore SW registration failures
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
