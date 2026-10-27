# release-20261026-982f3fe-materials

- Source branch: `design/english-clip-practice-brief`
- Source commits: `107947d` (starter pack and app entry), `982f3fe` (reliable audio seeking)
- Archive SHA-256: `b749b539412aff06cdae39cc730de9ad7887264c59616598d8f9ec4affe3072c`
- Scope: frontend assets and the first public listening/speaking material pack only. The backend, configuration, and data format are unchanged.

## Contents

- Adds an in-app “素材” tab linking to the starter pack.
- Adds eight short ELLLO conversations (547 seconds total), original transcripts, source links, attribution, expression prompts, and retelling prompts.
- Adds playback speed, five-second stepping, manual A/B looping, transcript selection/copying, and locally remembered listening position.
- Loads each short audio file into the browser before playback so seeking works even though the static server does not implement HTTP Range requests.
- Keeps downloaded third-party media out of Git. The source-selection manifest, downloader, verifier, and page template remain in source control.

## Checks

- `npm run lint`: passed with three pre-existing unused-variable warnings outside this change.
- `npm run build:web`: passed.
- `npm run materials:verify`: passed; 8 lessons, 547 seconds, 27 generated files checked, all audio probed successfully, all hashes matched.
- Public health, home page, practice page, catalog, and a served audio hash: passed.
- Browser acceptance: the app “素材” tab, lesson list, lesson switching, transcript, source link, and real audio playback were observed. The first deployment exposed unreliable seeking without Range support; this release contains the subsequent browser-blob fix. The final browser automation session timed out before repeating the complete A/B gesture, so that specific post-fix interaction is not recorded as visually passed.
- Authenticated sync was not changed. Production health still reported the same single account and 14 entries after deployment; no user entry was created, edited, or deleted during acceptance.

## NAS release and rollback

- Active frontend: `$APP_ROOT/releases/release-20261026-982f3fe-materials/web` through `$APP_ROOT/web`.
- Previous trial release retained: `$APP_ROOT/releases/release-20261026-107947d-materials/web`.
- Original pre-release frontend retained: `$APP_ROOT/releases/web-before-20261026-107947d`.
- Consistent data copies retained at `$APP_ROOT/backups/data-before-20261026-107947d/store.json` and `$APP_ROOT/backups/data-before-20261026-982f3fe/store.json`.
- Rollback: repoint `$APP_ROOT/web` to either retained frontend directory, then verify `/health`, `/`, and the intended static assets. Do not replace `data/` for a frontend-only rollback.

## Git synchronization

Both source commits were created locally. GitHub fetch succeeded and showed no newer remote changes, but push could not complete because this computer had no working GitHub authentication; the remote branch was confirmed absent. The NAS release therefore references verified local commits and still needs to be synchronized after GitHub login is restored.
