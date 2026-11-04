import type { TimedWord } from '../lib/media'

export function TimedWords({ text, words, time, selected, onWord }: { text: string; words?: TimedWord[]; time: number; selected?: string; onWord: (word: string) => void }) {
  if (words?.length) return <>{words.map((word, index) => {
    const spoken = time >= word.start && time < word.end
    return <span key={index}><button className={`${spoken ? 'spoken ' : ''}${selected === word.text ? 'selected' : ''}`} aria-current={spoken ? 'true' : undefined} onClick={() => onWord(word.text)}>{word.text}</button>{index < words.length - 1 ? ' ' : ''}</span>
  })}</>
  return <>{text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g).map((part, index) => /^[A-Za-z]/.test(part) ? <button key={index} className={selected === part ? 'selected' : ''} onClick={() => onWord(part)}>{part}</button> : part)}</>
}
