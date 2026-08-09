# English Clip — notes for AI agents

Local-first English vocabulary clipboard. UI language: Chinese. Product tone: quiet, no streaks/paywalls/notifications.

## Stack

- React + TypeScript + Vite (`src/`)
- IndexedDB via `idb` (`src/db/`)
- Offline lexicon: `public/lexicon.json` built by `scripts/build-lexicon.mjs`
- Optional Supabase sync: `src/lib/sync.ts` + `supabase/schema.sql`
- Desktop shell: Electron (`electron/main.cjs`)

## Commands

```bash
npm run dev          # web only
npm run app          # desktop (starts Vite + Electron)
npm run build        # web assets → dist/
npm run dist:mac     # build + package macOS .app/.dmg
```

## Where to change things

| Goal | Files |
|------|--------|
| UI / tabs / capture flow | `src/App.tsx`, `src/components/*`, `src/index.css` |
| Entry model / CRUD | `src/types.ts`, `src/db/entries.ts` |
| Lexicon search / enrich | `src/lib/lexicon.ts`, `src/lib/enrich.ts`, `data/enrichment-seed.json` |
| Cloud sync | `src/lib/sync.ts`, `.env` (`VITE_SUPABASE_*`) |
| Desktop window | `electron/main.cjs` |

## Constraints to preserve

- Capture must stay fast (text required; context/note optional)
- No notification / streak / membership UX
- Local-first: app must work without Supabase
- Prefer extending `Entry.enrichment` over breaking the Entry shape
