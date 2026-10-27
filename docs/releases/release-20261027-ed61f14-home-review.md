# release-20261027-ed61f14-home-review

- Date: 2026-10-27 (Asia/Shanghai). Superseded during the same release session by `release-20261027-2093295-home-review`.
- Source: local `ed61f1478b2cd46435f8b262395c36b7c1982e1c`; GitHub `codex/home-review` equivalent tree `b872691f4c9f2accb06ac986f9046a356d412445` at remote commit `e8801fbcb20dedd80874db7ca197edcdcc5914f3`.
- Archive SHA-256: `15f156d8fef4547779980d64d405700eca708bfa94df551df8a914027b330ed6`. The frontend and the verified eight-lesson practice pack contained 39 files; all remote file checksums passed.
- Previous frontend: `release-20261026-982f3fe-materials`. Backend and data format were unchanged.
- Consistent JSON snapshot: `$APP_ROOT/backups/data-before-20261027-ed61f14-home-review/store.json`, parsed successfully before switching. It remains on the NAS.

Public asset hashes, `/health`, the practice page and an audio file matched the release. Health still showed one account and 14 entries; unauthenticated `/api/entries` returned 401. In a fresh isolated browser, the external Google Fonts request stalled and delayed the app script. The release was promptly superseded by the font-independent version above. The isolated browser's test entry stayed in that browser profile, not in the NAS account. No authenticated production account read or write was performed.

Rollback route: repoint `$APP_ROOT/web` to `$APP_ROOT/releases/release-20261026-982f3fe-materials/web` or this retained release, then verify public health and static files. Keep `data/` untouched for frontend-only rollback.
