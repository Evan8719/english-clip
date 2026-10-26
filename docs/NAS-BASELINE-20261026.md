# NAS 源码接管基线

日期：2026-10-26。GitHub 原基线：`18c9d35`。

## 来源与范围

从 NAS `$APP_ROOT/src-build/` 取回程序源码、公共词包、构建锁文件及 `nas/` 部署说明。下载使用目录白名单，排除用户数据、运行配置、日志、密钥、依赖和构建目录。

实际运行后端 `server/server.mjs`、源码副本 `src-build/nas/server.mjs` 和本地 `nas/server.mjs` 的 SHA-256 相同：

`720b6789013e60ba766e7db59c87a0a3d01e38ec50d58a4fcdb1069da3c2b69b`

未将运行中的前端全部文件与构建源码逐一对应，因此不能把这份源码直接描述为经过完整复现验证的线上发布。

本次新增 Git/发布流程说明、敏感文件忽略规则、跨平台行尾规则和 `build:web` 命令，并把 README 与环境模板更新为 NAS 架构。实际连接元数据保存在忽略的本地记录；公开文档使用占位符，启动/守护脚本通过自身位置或 `EC_APP_DIR` 确定根目录。应用交互和查词代码按 NAS 原样接管；用户提出的卡片、排序和释义改进仍处于建议阶段。

## 验证结果

- 既有 SSH 管理连接认证成功；公共服务的 NAS 本机 `/health` 正常。
- `npm ci --ignore-scripts --no-audit --no-fund` 成功；未执行 Electron 下载脚本。
- `npm run lint` 通过，存在三个原有未使用变量警告：`scripts/smoke-test.mjs` 的两个参数、`nas/import.mjs` 的一个导入。本轮未做无关清理。
- `npm run build:web` 通过 TypeScript 检查和 Vite 构建。
- `node --check nas/server.mjs` 和 `node --check nas/import.mjs` 通过。
- 脱敏后的 `nas/run.sh`、`nas/keepalive.sh` 经 NAS 的 `sh -n` 语法检查通过；未执行脚本或切换服务，实际启动行为仍待正式发布前验证。
- 原有 macOS Chrome 烟测未在 Windows 执行；本轮不据此声称浏览器全流程验收通过。

本次未发布 NAS，未修改正式数据、密钥、配置、启动方式或 Docker 权限。Git 同步状态以实际远端核对结果为准。
