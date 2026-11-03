# release-20261103-2da05e7-restore-card

- Published: 2026-11-03 11:03 Asia/Shanghai.
- Source: local commit `2da05e7b86800275f08c2bb5e198f672e3eddf18`; GitHub branch `codex/restore-card-feel` at `3aabdc1f14f4b47990ceb577ed959eff85304bf1`. Both have tree `3e81caf9a5c791df38b57c892a125b00e36282cb`.
- Archive SHA-256: `545c508b876b8d4204cf9b9343afa1b9b20440c0ce0967dfa3c3583ab935ef1f`. All 39 frontend and practice files passed SHA-256 verification on the NAS.
- Active frontend: `$APP_ROOT/releases/release-20261103-2da05e7-restore-card/web` through `$APP_ROOT/web`.
- Previous frontend retained: `release-20261027-c052ab2-compact-home`.
- Data snapshot: `$APP_ROOT/backups/data-before-release-20261103-2da05e7-restore-card/store.json`, parsed successfully and checksum recorded before switching. The backend, configuration, and data format were unchanged.

## Changes

Home cards again use a full-width flip face with a prominent word or sentence and the original inline metadata. The narrow right information rail was removed. Card spacing and action buttons were adjusted while keeping the single-column list, center capture button, bottom navigation, and bold Chinese title. Optional context appears as a short preview. The PWA shell cache version was incremented.

## Checks

- `npm run lint`: passed with three pre-existing warnings in unrelated scripts.
- `npm run build:web`: passed TypeScript and Vite build. `git diff --check` and `node --check public/sw.js` passed.
- Local isolated 390px mobile browser: four cards in one 358px column, ordinary card height 166px, sentence card height 187px, no horizontal overflow, title weight 800, bottom bar flush with the 844px viewport. Source filtering, card flip and Chinese meaning, review marking, and center `+` capture passed.
- Public home HTML, service worker, JS, CSS, practice page, catalog, and audio file matched the release SHA-256 values. `/health` was healthy with one account and 14 entries; unauthenticated `/api/entries` returned 401.
- Public isolated 390px mobile browser: center `+` capture, source filtering, card flip, and review completion passed using test data only in its isolated local browser profile.
- The existing account was not logged in during acceptance. Authenticated production account reads and writes were not verified; no formal user entry was changed.

Rollback: atomically repoint `$APP_ROOT/web` to `releases/release-20261027-c052ab2-compact-home/web`, then verify `/health`, `/`, the referenced JS/CSS, and practice assets. Do not replace `data/` for a frontend-only rollback.
