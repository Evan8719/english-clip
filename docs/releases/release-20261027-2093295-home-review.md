# release-20261027-2093295-home-review

- Published: 2026-10-27 17:50 Asia/Shanghai.
- Source: local `2093295d6164ec8d5675bd80afcf642d07588104`; GitHub branch `codex/home-review` at `d4e22ece4af4710a997b6ebda9d5b6628d1de27b`. Their exact Git tree is `f9f1cb1baecb66e6469ef277972352160813fc83`.
- Archive SHA-256: `8db421a489b6c02d064b3494c372f4165c5cfcc00c85d2a6f88068327cda0b17`. All 39 files passed SHA-256 verification on the NAS.
- Active frontend: `$APP_ROOT/releases/release-20261027-2093295-home-review/web` through `$APP_ROOT/web`. The Node backend, configuration and data format were unchanged.
- Previous frontend retained: `release-20261027-ed61f14-home-review`; the earlier `release-20261026-982f3fe-materials` is also retained.
- Consistent JSON snapshot: `$APP_ROOT/backups/data-before-20261027-2093295-home-review/store.json`, parsed successfully before switching. The previous snapshot is also retained.

## Changes

The home tab now shows all recorded entries in a two-column card layout, newest first, with search, source chips, type and sort controls, and a single-column option. The original tap-to-flip card and detailed capture fields remain. The second tab is a one-card-at-a-time review flow; the material practice pack remains available. The PWA shell cache was updated, and the external font import was removed after a browser startup stall was observed in an isolated test.

## Checks

- `npm run lint`: passed with three pre-existing unused-variable warnings outside these changes.
- `npm run build:web`: passed TypeScript and Vite build.
- `npm run materials:verify`: passed, eight lessons and 27 verified material files.
- On the public address, the home HTML, service worker, JS, CSS, practice page, catalog and a real audio file matched the packaged SHA-256 values. `/health` was healthy with one account and 14 entries; unauthenticated `/api/entries` returned 401.
- A fresh isolated 390px browser profile loaded the actual NAS page with no font request interception and no horizontal overflow. It completed test-data capture, source filtering, card flip, review marking and persistence after reload. The test entry remained only in that isolated browser profile. The same flow passed against the local production build.
- The existing user account was not logged in during acceptance, so authenticated production account reads and writes are not claimed as verified. No formal user entry was created, edited or deleted.

Rollback: atomically repoint `$APP_ROOT/web` to either retained frontend release, then verify `/health`, `/`, the referenced JS/CSS and practice assets. Do not replace `data/` for a frontend-only rollback. The backend and data backup remain available separately.
