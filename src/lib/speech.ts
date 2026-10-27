import { normalizeHeadword } from './normalize'

let currentAudio: HTMLAudioElement | null = null

interface FreeDictionaryPhonetic {
  text?: string
  audio?: string
}

interface FreeDictionaryEntry {
  phonetics?: FreeDictionaryPhonetic[]
}

async function fetchDictionaryAudio(text: string): Promise<string | undefined> {
  const word = normalizeHeadword(text)
  if (!word || /\s/.test(word)) return undefined
  if (typeof navigator !== 'undefined' && !navigator.onLine) return undefined

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as FreeDictionaryEntry[]
    const phonetics = data[0]?.phonetics ?? []
    const withAudio =
      phonetics.find((p) => p.audio && /us/i.test(p.audio)) ||
      phonetics.find((p) => p.audio && p.audio.length > 0)
    return withAudio?.audio || undefined
  } catch {
    return undefined
  }
}

function playAudioUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      currentAudio?.pause()
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => resolve(true)
      audio.onerror = () => resolve(false)
      void audio.play().then(
        () => undefined,
        () => resolve(false),
      )
    } catch {
      resolve(false)
    }
  })
}

function pickEnglishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const prefer = [
    (v: SpeechSynthesisVoice) => /google us english/i.test(v.name),
    (v: SpeechSynthesisVoice) => /samantha|victoria|alex|daniel|moira/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.lang.toLowerCase() === 'en-us',
    (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith('en'),
  ]
  for (const match of prefer) {
    const found = voices.find(match)
    if (found) return found
  }
  return undefined
}

function speakWithTts(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'en-US'
  utter.rate = 0.9
  utter.pitch = 1
  const voice = pickEnglishVoice()
  if (voice) {
    utter.voice = voice
    utter.lang = voice.lang || 'en-US'
  }
  window.speechSynthesis.speak(utter)
}

/**
 * Prefer real dictionary audio; fall back to TTS only if needed.
 * Pass `preferredAudioUrl` from enrichment when available.
 */
export async function speakEnglish(
  text: string,
  preferredAudioUrl?: string,
): Promise<void> {
  const value = text.trim()
  if (!value) return

  const url = preferredAudioUrl || (await fetchDictionaryAudio(value))
  if (url) {
    const ok = await playAudioUrl(url)
    if (ok) return
  }

  speakWithTts(value)
}

/** Warm up voice list on some browsers (Chrome loads async). */
export function warmSpeechVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  void window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    void window.speechSynthesis.getVoices()
  }
}
