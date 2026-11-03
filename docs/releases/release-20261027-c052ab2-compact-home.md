# release-20261027-c052ab2-compact-home

- Published: 2026-11-03 10:42 Asia/Shanghai.
- Source: local commit `c052ab2d55dd9e1740627478a18e85955d33a83d`; GitHub branch `codex/compact-home-nav` at `5d4985e6d1ca1c40c16805e31289febe5ba98202`. Both have tree `6abe8ed586186b03c049d68e61d23bc60af95422`.
- Archive SHA-256: `ff97ce98b9b100aba66da581cd4b5b1a26105a2bf19d009b3dfed80da344c378`. All 39 frontend and practice files passed SHA-256 verification on the NAS.
- Active frontend: `$APP_ROOT/releases/release-20261027-c052ab2-compact-home/web` through `$APP_ROOT/web`.
- Previous frontend retained: `release-20261027-2093295-home-review`.
- Data snapshot: `$APP_ROOT/backups/data-before-release-20261027-c052ab2-compact-home/store.json`, parsed successfully and checksum recorded before switching. The backend, configuration, and data format were unchanged.

## Changes

The home entry list is a compact single column, including for sentences. Cards show source, type, familiarity, and context in the available space. The original tap-to-flip meaning remains. Capture is now the centered `+` in the bottom navigation. The navigation bar sits flush with the viewport bottom, and the Chinese home title has stronger weight. The PWA shell cache version was incremented. The existing review and practice material flows remain available.

## Checks

- `npm run lint`: passed with three pre-existing warnings in unrelated scripts.
- `npm run build:web`: passed TypeScript and Vite build. `node --check public/sw.js` and `git diff --check` passed.
- `npm run materials:verify`: passed, eight lessons and 27 verified material files.
- Local isolated 390px mobile browser: single-column cards, no horizontal overflow, 800-weight home title, bottom bar at viewport edge, capture, source filtering, card flip with meaning, review completion, and newest-first saved entry passed.
- Public home HTML, service worker, JS, CSS, practice page, catalog, and audio file matched the release SHA-256 values. `/health` was healthy with one account and 14 entries; unauthenticated `/api/entries` returned 401.
- Public isolated 390px mobile browser: bottom `+` capture, source filtering, flip, and review marking passed with test data stored only in the isolated browser profile.
- The existing account was not logged in during acceptance. Authenticated production account reads and writes were not verified; no formal user entry was changed.

Rollback: atomically repoint `$APP_ROOT/web` to `releases/release-20261027-2093295-home-review/web`, then verify `/health`, `/`, the referenced JS/CSS, and practice assets. Do not replace `data/` for a frontend-only rollback.
