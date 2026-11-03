export function NavIcon({ name }: { name: 'book' | 'review' | 'plus' | 'audio' | 'chat' }) {
  const paths = { book: 'M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Zm0 12h15M8 8h7', review: 'M4 10a8 8 0 1 1 2 8M4 4v6h6M12 7v5l3 2', plus: 'M12 4v16M4 12h16', audio: 'M4 14v-3a8 8 0 0 1 16 0v3M4 13H2v7h5v-7H4Zm16 0h2v7h-5v-7h3Z', chat: 'M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9ZM8 8h8M8 12h5' }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
