# release-20261103-35aecd7-superdesign

- Published on 2026-11-03 (Asia/Shanghai) from commit `35aecd7d8e5629e130b2c367aa0ca4833d8d959f` on GitHub branch `codex/superdesign-redesign`. Local and remote commit IDs matched before packaging.
- Archive SHA-256: `97e895ebe0f65f6df99d30003c99a8eedaf1973733e43539b09887e4483b475b`. The full file manifest passed on the NAS before switching.
- Active frontend: `$APP_ROOT/releases/release-20261103-35aecd7-superdesign/web`, through `$APP_ROOT/web`.
- Active backend SHA-256: `server.mjs` = `9d8f6d42d34de12686ca8081334a23fbaabbe31571021dcae6e89c3d152e3193`; `media.mjs` = `f51b9ef55b653a052b019e1ac079a69acde1d44d107c5ff6599b3da2a6db0f8b`.
- Previous frontend retained: `release-20261103-2da05e7-restore-card`.
- Consistent backup, taken with the writer stopped: `$APP_ROOT/backups/before-release-20261103-35aecd7-superdesign-retry2/data.tar.gz`; SHA-256 `7304365638a9c5e33ae1ff37f552c6f0ceec08930a9bb79e3bdd77f8c8cf64a6`. The old backend and checksums are in the same backup folder. The separate pre-redesign backup is retained.

## Changes

The selected Superdesign notebook layout is connected to real IndexedDB and NAS data. Home has a prominent capture action, single-column flip cards, source filters, desktop detail panel, and flush mobile bottom navigation. Added offline dictionary search, private audio/video/text materials, transcript editing, A/B loop playback, automatic transcript-based exercise cards, shadowing with local recording, optional external transcription and AI text conversation, and five offline learning-method cards with action links.

Private material data lives under `data/media/`; no original media, user entries, credentials, or AI keys are in the source package. An OpenAI API key must be configured through Settings to enable external transcription and AI conversation.

## Verification

- TypeScript/Vite build passed; lint passed with three existing warnings in unrelated scripts; backend and service-worker syntax checks and diff whitespace checks passed.
- Local 390px and 1280px browser acceptance passed: capture/source fields, card flip and Chinese meaning, dictionary search, materials/practice navigation, no horizontal overflow, and mobile navigation flush with the viewport bottom.
- Learning methods: five cards and five actions render at 390px, no horizontal overflow; capture action opens the real capture form.
- Isolated backend acceptance passed: authenticated entry sync, text-material exercise generation, file upload, signed Range playback, encrypted API-key persistence, and cross-account isolation. Isolated UI acceptance passed login, eight starter lessons, transcript material upload, exercise generation, and saving a sourced expression. Subsequent stored-entry count confirmed silent sync persisted.
- Starter pack verification passed: eight lessons and 27 verified files.
- Public HTTPS index, JS, CSS, service worker, and starter catalog returned 200 and matched local release hashes. Public media API without authentication returned 401.
- Public health remained one account and 14 entries. Post-release comparison found account and entry objects identical to the consistent pre-switch backup; only the top-level save timestamp changed.
- Existing authenticated production browser acceptance was unavailable: repeated browser-control attachment attempts timed out. No production account password was available, and no credential was fabricated. Production user-data writes were not tested.
- Actual external AI transcription/conversation and microphone recording on a physical phone remain unverified without a configured key/device permission. They are not claimed as passed.

The first attempt used `mv` without `-T` to replace a directory symlink. The resource check detected the old frontend, and the script automatically restored the old backend. The two temporary symlinks were inspected and removed. The second attempt used verified `mv -Tf`, a new consistent backup, and passed startup/resource checks. No data rollback was performed.

## Rollback

Stop the backend writer. Restore the old `server.mjs` from the backup folder, remove only the newly introduced program module `server/media.mjs`, atomically replace `$APP_ROOT/web` with a symlink to `releases/release-20261103-2da05e7-restore-card/web` using `mv -Tf`, and restart through `$APP_ROOT/run.sh`. Verify health, referenced frontend assets, and existing entry reads. Preserve the current `data/` directory, including new uploads; a code rollback must not restore the old data archive over subsequent user changes.
