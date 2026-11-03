# release-20261103-268f114-library

Published on 2026-11-03 from GitHub-synchronized commit `268f1142f3ff381090ca019f62758490890e419b`, branch `codex/library-deepseek`.

- Program archive SHA-256: `0b59be5f957617c4826fb7a20122db869b98f836ed5e4d97f9c0f2000c51ae41`; all staged file checks passed.
- Previous program: `release-20261103-35aecd7-superdesign`, retained for rollback.
- Consistent pre-switch data backup: `$APP_ROOT/backups/before-release-20261103-268f114-library-retry2/data.tar.gz`, SHA-256 `b27052c90c81ed5429b58310277898fe6ad03b9dddff2deb3cf3b27c70516f24`. An earlier backup before the import is retained without the `-retry2` suffix.
- Private import: 73 original files, all verified by SHA-256 after copying. 15 readable EPUBs, 58 audio files; 30 audio transcripts immediately produced exercises. 28 podcasts wait for the local worker. Seven invalid EPUB containers were excluded and retained locally in the failure report.
- Reference levels at import: A1 5, A2 29, B1 13, B2 24, C1 1, C2 1. These are editable estimates/source references, not certified CEFR levels.
- User-authorized DeepSeek credential migration happened internally on the NAS; the application stores it encrypted. No secret or original media is in Git.

Added EPUB chapter reading, offline book cache, source-linked capture and return, graded library, automatic audio/text pairing, local ASR queue and DeepSeek streamed feedback. Mobile navigation uses larger icon/label targets and removes the blue tap highlight on flip cards.

## Actual verification

- TypeScript/Vite, lint (three existing warnings), syntax and whitespace checks passed.
- Isolated backend tests passed book progress, account isolation, content deduplication, encrypted provider keys, ASR claim/completion and incremental SSE.
- Browser at 390px and 1280px passed real EPUB parsing, paired import, selected-text capture, return to source and offline reading. Mobile targets were 62px high, navigation bottom 844px, no horizontal overflow, and transparent card tap highlight.
- Actual installed subtitle-tool model transcribed a one-minute sample. The full isolated worker flow returned 13 time segments and generated nine exercise cards. CUDA reuse through existing pyVideoTrans libraries was subsequently verified in the local worker.
- NAS program files matched the verified release, all 73 imported originals passed hashes, and existing entry objects were unchanged from the pre-import backup. Public health remained one account and 14 entries.
- Public HTTPS index, JS, CSS, service worker and starter catalog matched release hashes; unauthenticated media access returned 401.
- Real DeepSeek call from the NAS returned its first text in 1,336ms and finished in 2,429ms on one synthetic example, correctly correcting `look forward to meeting`. This is one measurement, not a latency guarantee. It did not include private learning material.
- Existing authenticated production UI was not driven by browser automation. Backend/reader flows were tested with isolated accounts; production data preservation was checked directly.

The first switch checked readiness too soon and automatically restored the old program. Import data was preserved. A new full backup and readiness polling were used on retry, and the repeated import skipped all 73 duplicates.

Rollback restores the two previous backend modules from the backup, removes only newly added program modules, atomically repoints `$APP_ROOT/web` to the previous release using `mv -Tf`, and restarts. Preserve current `data/`, uploads and encrypted keys; do not restore an old data archive over subsequent user changes.
