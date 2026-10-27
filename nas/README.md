# English Clip · NAS 自建部署

把 Vercel + Supabase 换成「NAS 上自己的后端 + 自己的前端」，数据留在家里。

本文的 `$APP_ROOT`、NAS 管理地址和任务编号均为占位符。实际连接信息保存在忽略的本地 `work/` 记录中；执行示例前先设置 `APP_ROOT`。将 `run.sh`、`keepalive.sh` 放在应用根目录，脚本默认从自身位置推导根目录，也可通过 `EC_APP_DIR` 指定。

## 现状

| 项 | 值 |
|----|----|
| 对外地址 | **https://clip.evenhoo.top:8443** （已上线，证书 ACME 自动续期） |
| 服务位置 | NAS 宿主机 `$APP_ROOT/` |
| 监听 | `127.0.0.1:4188`（只允许 Lucky 反代进来，不直接对局域网/公网开端口） |
| 数据 | `data/store.json`（全部账号 + 词条） |
| 守护 | Hermes 定时任务 `<KEEPALIVE_JOB_ID>`（每 5 分钟健康检查 + 自动拉活） |
| 代码 | 仓库 `nas/` 目录（`server.mjs` / `run.sh` / `keepalive.sh` / `import.mjs` / `Dockerfile`） |

## 架构

```
手机/电脑
   │  https://clip.evenhoo.top:8443      ← Lucky（DNS + 反代 + 证书）
   ▼
127.0.0.1:4188    ← nas/server.mjs（零依赖 Node 进程）
   ├── /               静态前端（web/，即 dist/ 产物）
   ├── /api/*          登录 + 同步接口
   └── data/store.json 全部词条（原子写入 + .bak 轮转）
```

- 一个进程同时发前端和 API ⇒ 同源、无跨域、Service Worker 正常（可加到主屏）。
- 前端仍然**本地优先**（IndexedDB 是主数据），后端只做跨设备同步。断网照样记词。

## 为什么不用 Docker

部署机上 `应用账号` 不在 `docker` 组（`/var/run/docker.sock` 是 `root:docker srw-rw----`），
所以走**用户级进程 + 外部守护**。`nas/Dockerfile` 是留给以后拿到 Docker 权限时用的，
跑的是同一个 `server.mjs`，行为一致。

## 部署机上的目录

| 路径 | 说明 |
|------|------|
| `$APP_ROOT/server/server.mjs` | 后端进程 |
| `$APP_ROOT/server/import.mjs` | 从旧版导出的 JSON 导入词条 |
| `$APP_ROOT/web/` | 前端静态产物 |
| `$APP_ROOT/config.env` | 本机绑定配置（**不在仓库里**） |
| `$APP_ROOT/data/store.json` | **全部数据**（要备份的就是它） |
| `$APP_ROOT/data/secret.key` | Token 签名密钥（0600，丢了所有人需重新登录） |
| `$APP_ROOT/data/invite-code.txt` | 注册第二个账号所需邀请码 |
| `$APP_ROOT/logs/server.log` | 日志（超 5MB 自动轮转） |
| `$APP_ROOT/src-build/` | 源码副本 + node_modules（只用于重新构建） |

## 常用命令

```sh
$APP_ROOT/run.sh                    # 启动（已在跑就跳过）
EC_RESTART=1 $APP_ROOT/run.sh       # 强制重启（改完代码/前端）
curl -s http://127.0.0.1:4188/health                 # 健康检查
curl -sI https://clip.evenhoo.top:8443/health        # 对外健康检查
tail -f $APP_ROOT/logs/server.log   # 日志
tail $APP_ROOT/logs/keepalive.log   # 守护重启记录
```

## 守护（Hermes 定时任务）

NAS 上 `应用账号` **装不了 crontab**（`/var/spool/cron` 仅 root），所以借常驻的 Hermes 容器当看门狗：

- 脚本 `/opt/data/scripts/english-clip-keepalive.sh`：SSH 到宿主机跑 `keepalive.sh` 并读 `/health`
- 定时任务 `<KEEPALIVE_JOB_ID>`，`*/5 * * * *`，`no_agent`（0 token），**健康时静默**
- 宿主机 `keepalive.sh`：健康检查失败就 `run.sh` 重启，日志超 5MB 轮转

顺带解决开机自启：NAS 重启 → Hermes 容器自动回来 → 5 分钟内拉活。

## Lucky 反代配置（外网入口）

配置在 NAS 的 **Lucky 2.20.2**（管理页 `http://<NAS_ADMIN_HOST>:<ADMIN_PORT>`）。
Lucky 的配置文件是**加密二进制且 root 属主**，只能用它的界面改。

需要的三样（都已配好）：

1. **DNS**：动态域名任务 `english-clip` → 阿里云 → A 记录 `clip.evenhoo.top` = `{ipv4Addr}`（自动跟随家宽 IP）
2. **证书**：SSL 证书 `English Clip` → ACME / ZeroSSL / 阿里云 DNS 验证 → 域名 `clip.evenhoo.top`（自动续期）
3. **Web 服务**：在现有 `所有地址8443` 规则下加**子规则**
   - 子规则名称：`English Clip`
   - 前端地址：`clip.evenhoo.top` ← **只写域名**，不要带 `https://` 或端口
     （Lucky 会自己补成 `https://clip.evenhoo.top:8443`；写成 `https://clip.evenhoo.top:8443` 会变成
     `:8443:8443` 而匹配不上）
   - 后端地址：`http://127.0.0.1:4188`
   - 服务类型：反向代理

> 改 Lucky 界面时注意：它是 Element Plus 组件，`element.click()` 这类合成事件的**不好使**
> （下拉打不开），需要用 CDP 的真实鼠标事件（`Input.dispatchMouseEvent`）。

## 重新构建前端

依赖安装必须跳过脚本，否则 electron 会去 GitHub 拉二进制（国内会卡住）：

```sh
cd $APP_ROOT/src-build
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund
npm run build:web                   # tsc -b && vite build，不触发 prebuild
```

`public/lexicon.json` 已在仓库里。普通发布使用现有词包；显式更新词库时才运行重建命令。

构建完成后，按 [修改与发布流程](../docs/WORKFLOW.md) 创建独立版本目录、备份并切换。不要直接删除或覆盖唯一的 `web/` 目录；本节构建命令不代表已完成正式发布。

## 导入旧数据

```sh
# 先停服务（避免内存副本覆盖），再导入，再启动
kill "$(cat $APP_ROOT/logs/ec.pid)"
cd $APP_ROOT/server
node import.mjs /path/to/export.json [邮箱]
$APP_ROOT/run.sh
```

合并规则与前端一致：同一个 id 按 `updatedAt` 取新；写前自动留 `.before-import` 备份。

## 备份

```sh
cp $APP_ROOT/data/store.json \
   /path/to/backup/english-clip-$(date +%F).json
```

`data/` 目录整体拷走即完整备份。另有接口 `GET /api/export`（需登录）直接下载当前账号 JSON。

## 换机器 / 恢复

1. 拷 `server/`、`web/`、`run.sh`、`keepalive.sh`、`config.env`
2. 拷 `data/`（必须，含密钥和数据）
3. 跑 `./run.sh`，再挂回 Hermes 守护脚本

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无鉴权） |
| GET | `/api/config` | 是否已有账号 |
| POST | `/api/auth/register` | `{email,password,inviteCode?}` → `{token,user}` |
| POST | `/api/auth/login` | `{email,password}` → `{token,user}` |
| GET | `/api/auth/me` | 当前用户（Bearer） |
| POST | `/api/auth/logout` | 退出（Bearer，作废该用户所有旧 Token） |
| GET | `/api/entries` | 拉全量词条（Bearer） |
| POST | `/api/entries` | `{entries:[...]}` upsert，按 `updatedAt` 取新（Bearer） |
| GET | `/api/export` | 下载 JSON 备份（Bearer） |

认证用 Bearer Token（localStorage），**不用 Cookie**。跨域白名单见 `EC_ALLOWED_ORIGINS`。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `EC_PORT` | `4188` | 监听端口 |
| `EC_HOST` | `127.0.0.1` | 监听地址，**别改成 0.0.0.0**（会被局域网直连，绕过 Lucky 的 TLS） |
| `EC_DATA_DIR` | `../data` | 数据目录 |
| `EC_WEB_DIR` | `../web` | 静态目录 |
| `EC_ALLOWED_ORIGINS` | Vercel 站 + clip 站 | 允许的跨域来源 |

绑定地址读 `config.env`（同目录），改完 `EC_RESTART=1 ./run.sh` 生效。

## 未做 / 局限

- 单文件 JSON 存储：几千条无压力（每次同步整体重写几 MB）。上万条再考虑换 SQLite。
- 账号体系是自建的简单版（scrypt + HMAC Token），家庭内部够用。
- 家里宽带或 NAS 断线时外网就用不了（本地 IndexedDB 数据不丢，只是不同步）。
