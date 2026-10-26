# English Clip — notes for AI agents

Local-first English vocabulary clipboard. UI language: Chinese. Product tone: quiet, no streaks/paywalls/notifications.

## Stack

- React + TypeScript + Vite (`src/`)
- IndexedDB via `idb` (`src/db/`)
- Offline lexicon: `public/lexicon.json` built by `scripts/build-lexicon.mjs`
- Self-hosted sync backend on the NAS: `nas/server.mjs` (zero-dependency Node) — replaces Supabase
- Desktop shell: Electron (`electron/main.cjs`)

## Commands

```bash
npm run dev          # web only
npm run app          # desktop (starts Vite + Electron)
npm run build        # web assets → dist/
npm run dist:mac     # build + package macOS .app/.dmg
```

> 依赖安装请加 `--ignore-scripts`，否则 electron 的安装脚本会去 GitHub 拉二进制，在国内会卡住：
> `npm install --ignore-scripts --registry=https://registry.npmmirror.com`

## Where to change things

| Goal | Files |
|------|--------|
| UI / tabs / capture flow | `src/App.tsx`, `src/components/*`, `src/index.css` |
| Entry model / CRUD | `src/types.ts`, `src/db/entries.ts` |
| Categories / sources | `src/lib/categories.ts`, capture「出处」 |
| Cloud sync (client) | `src/lib/sync.ts` (Bearer token → NAS API) |
| Cloud sync (server) | `nas/server.mjs` |
| Desktop window | `electron/main.cjs` |

## Constraints to preserve

- Capture must stay fast (text required; context/note optional)
- No notification / streak / membership UX
- Local-first: app must work without any backend reachable
- Prefer extending `Entry.enrichment` over breaking the Entry shape

## Mandatory Git and release workflow

- Read `docs/WORKFLOW.md` before changes. The user requires source changes to be committed and synchronized to GitHub as part of completion, not left only on the NAS.
- Inspect Git status and the NAS baseline first. Other devices or Hermes may change files; compare unexpected changes and preserve them. Never force-push, reset, or discard unrelated work.
- Back up changed files under `work/backups/<date>-<task>/`, preserving relative paths with a `.before` suffix and a README identifying the previous commit/release.
- Keep changes scoped. Use a task branch for substantial changes; commit focused changes with a meaningful message. Push the relevant branch and verify the remote commit. Report blocked authentication accurately.
- Use `npm ci --ignore-scripts` with the committed lockfile. For ordinary frontend builds use `npm run build:web`; `npm run build` triggers lexicon/icon regeneration through `prebuild`.
- Run relevant checks and record actual results. A frontend change needs type/build checks and browser acceptance of the affected flow; sync changes also need isolated backend checks. Existing Mac-only smoke automation is not a Windows acceptance result.
- Do not commit runtime data, exports, passwords, tokens, signing keys, private SSH identities, logs, dependencies, or backup files. Review staged files and diffs before pushing.
- Keep actual NAS LAN addresses, management ports, account names, absolute deployment paths, and private scheduler IDs in ignored `work/` notes or the local NAS skill reference. Public docs use placeholders; startup scripts derive the app root from their location or `EC_APP_DIR`.
- A Git push is not a NAS deployment. Deploy only within the user's requested scope, from a verified commit, with a unique release name, checksums, a consistent data backup, and a recorded rollback route.
- After deployment verify public health and the affected authenticated UI/data flow. Do not claim authenticated acceptance based only on `/health`. Record the release in `docs/releases/` without private data.
- Finish by stating what changed, checks passed or blocked, commit/push status, and whether NAS was actually updated.

## NAS 自建部署（2026-10-11 起）

线上不再依赖 Vercel + Supabase，主部署在自家 NAS。

- 运行位置：NAS 宿主机 `$APP_ROOT/`，一个**零依赖 Node 进程**（`nas/server.mjs`，Node 18 即可）
  同时提供静态前端（`web/`）和 `/api/*` 接口。
- 对外地址 **https://clip.evenhoo.top:8443**（Lucky 反代 + ACME 证书自动续期）；后端只绑 `127.0.0.1:4188`，不直接对局域网/公网开端口。
- 外网入口的 Lucky 配置（DNS 任务 / 证书 / Web 服务子规则）见 `nas/README.md`；改 Lucky 界面要用 CDP 真实鼠标事件，合成 click 打不开它的下拉。
- 前端 `src/lib/sync.ts` 已从 Supabase 改为调用自建 API：邮箱 + 密码换 **Bearer Token**（存 localStorage，
  不用 Cookie，方便跨域）。`SettingsView.tsx` 只用 `SyncUser` 类型，不再引 `@supabase/supabase-js`。
- 数据：`data/store.json`（原子写入 + `.bak` 轮转）。本地 IndexedDB 仍是主数据，后端只负责跨设备同步。
- 守护：NAS 上 `应用账号` 既无 crontab 权限也无 docker 组权限，因此由 **Hermes 的定时任务每 5 分钟** 通过 SSH
  做健康检查与自动拉活（job `<KEEPALIVE_JOB_ID>`，脚本 `english-clip-keepalive.sh`）。
- 细节、常用命令、备份、换机恢复：见 [`nas/README.md`](./nas/README.md)。

### 改前端时的注意

- **给 Vercel 构建必须设 `VITE_API_BASE=https://clip.evenhoo.top:8443`**，否则前端会请求同源 `/api` 而 404。
  给 NAS 构建不用设（同源）。
- 不要重新引入 Supabase 依赖。
- 后端接口契约见 `nas/README.md` 的「接口」一节。
