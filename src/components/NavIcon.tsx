export type IconName = 'book' | 'review' | 'plus' | 'audio' | 'chat' | 'dictionary' | 'methods' | 'settings' | 'mic' | 'play' | 'link' | 'external' | 'note' | 'bookmark' | 'collect' | 'sparkle' | 'close' | 'pause' | 'next' | 'previous' | 'eye' | 'check' | 'search' | 'filter' | 'more' | 'shuffle' | 'send' | 'keyboard' | 'edit' | 'volume'
export function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    book: 'M4 4h11a4 4 0 0 1 4 4v12H7a3 3 0 0 1-3-3V4Zm0 12h15M8 8h6',
    review: 'M4 8a8 8 0 1 1-1 7M4 3v5h5M12 7v5l3 2',
    plus: 'M12 5v14M5 12h14',
    audio: 'M4 14v-3a8 8 0 0 1 16 0v3M4 13H2v7h5v-7H4Zm16 0h2v7h-5v-7h3Z',
    chat: 'M20 14a4 4 0 0 1-4 4H9l-5 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7ZM8 8h8M8 12h5',
    dictionary: 'M3 5h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H3V5Zm10 3a3 3 0 0 1 3-3h5v13h-5a3 3 0 0 0-3 3M6 9h3M6 12h3',
    methods: 'M4 8l8-4 8 4-8 4-8-4Zm3 3v5c3 3 7 3 10 0v-5M20 8v7',
    settings: 'M9 2h6l.5 2.8 1.7.8 2.5-1.3 2 2-1.3 2.5.8 1.7L24 11v3l-2.8.5-.8 1.7 1.3 2.5-2 2-2.5-1.3-1.7.8L15 23H9l-.5-2.8-1.7-.8-2.5 1.3-2-2 1.3-2.5-.8-1.7L0 14v-3l2.8-.5.8-1.7-1.3-2.5 2-2 2.5 1.3 1.7-.8L9 2ZM15.4 12.5a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0Z',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4M8 22h8',
    play: 'm9 5 11 7-11 7V5Z',
    link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    external: 'M14 3h7v7M21 3 10 14M10 5H4v15h15v-6',
    note: 'M5 3h14v18H5V3Zm4 5h6M9 12h6M9 16h3',
    bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
    collect: 'M6 3h12v18l-6-4-6 4V3Zm3 7h6m-3-3v6',
    sparkle: 'm12 2 2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3zM19 2v4m-2-2h4',
    close: 'm6 6 12 12M6 18 18 6',
    pause: 'M8 5v14M16 5v14',
    next: 'm9 5 7 7-7 7',
    previous: 'm15 5-7 7 7 7',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    filter: 'M3 4h18v2l-7 7v4l-4 3v-7L3 6z',
    volume: 'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    shuffle: 'M3 5h3l12 14h3M17 16l4 3-4 3M3 19h3l4-5M14 10l4-5h3M17 2l4 3-4 3',
    send: 'm3 3 19 9-19 9 4-9-4-9Zm4 9h15',
    keyboard: 'M2 6h20v13H2V6Zm3 4h1m3 0h1m3 0h1m3 0h1M5 14h1m3 0h1m3 0h1m3 0h1M7 17h10',
    edit: 'm4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4',
    more: 'M5 11v2M12 11v2M19 11v2',
    check: 'm5 12 4 4L19 6',
  }
  if (name === 'more') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></svg>
  return <svg width="24" height="24" viewBox={name === 'settings' ? '-2 -1 28 27' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
