export type IconName = 'book' | 'review' | 'plus' | 'audio' | 'chat' | 'dictionary' | 'methods' | 'settings' | 'mic' | 'play' | 'link' | 'external' | 'note' | 'bookmark' | 'close' | 'pause' | 'next' | 'previous' | 'eye' | 'check' | 'search' | 'filter' | 'more'
export function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    book: 'M4 4h11a4 4 0 0 1 4 4v12H7a3 3 0 0 1-3-3V4Zm0 12h15M8 8h6',
    review: 'M4 8a8 8 0 1 1-1 7M4 3v5h5M12 7v5l3 2',
    plus: 'M12 5v14M5 12h14',
    audio: 'M4 14v-3a8 8 0 0 1 16 0v3M4 13H2v7h5v-7H4Zm16 0h2v7h-5v-7h3Z',
    chat: 'M20 14a4 4 0 0 1-4 4H9l-5 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7ZM8 8h8M8 12h5',
    dictionary: 'M3 5h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H3V5Zm10 3a3 3 0 0 1 3-3h5v13h-5a3 3 0 0 0-3 3M6 9h3M6 12h3',
    methods: 'M4 8l8-4 8 4-8 4-8-4Zm3 3v5c3 3 7 3 10 0v-5M20 8v7',
    settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4M8 22h8',
    play: 'm9 5 11 7-11 7V5Z',
    link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    external: 'M14 3h7v7M21 3 10 14M10 5H4v15h15v-6',
    note: 'M5 3h14v18H5V3Zm4 5h6M9 12h6M9 16h3',
    bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
    close: 'm6 6 12 12M6 18 18 6',
    pause: 'M8 5v14M16 5v14',
    next: 'm9 5 7 7-7 7',
    previous: 'm15 5-7 7 7 7',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    filter: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    more: 'M5 11v2M12 11v2M19 11v2',
    check: 'm5 12 4 4L19 6',
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
