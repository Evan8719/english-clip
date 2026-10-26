#!/bin/sh
# English Clip · 启动脚本（宿主机应用用户，无需 root）
#
# 用法：./run.sh                启动（已在运行则跳过）
#       EC_RESTART=1 ./run.sh   强制重启
#
# 绑定地址/端口优先读同目录的 config.env（宿主机本机配置，不在仓库里）：
#   EC_HOST=127.0.0.1     仅本机（配合 Lucky 反代，最安全）
#   EC_HOST=0.0.0.0       局域网可直连（在 Lucky 规则配好之前用）
set -eu

DIR=${EC_APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}
NODE=${EC_NODE:-/usr/bin/node}
PIDFILE=$DIR/logs/ec.pid
LOG=$DIR/logs/server.log
# 先读本机配置，再取默认值（顺序不能反）
if [ -f "$DIR/config.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/config.env"
fi
PORT=${EC_PORT:-4188}
BIND=${EC_HOST:-127.0.0.1}

mkdir -p "$DIR/logs" "$DIR/data"

running() {
  [ -f "$PIDFILE" ] || return 1
  pid=$(cat "$PIDFILE" 2>/dev/null || echo '')
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  return 0
}

if running; then
  if [ "${EC_RESTART:-0}" = "1" ]; then
    echo "停止旧进程 pid=$(cat "$PIDFILE")"
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    sleep 1
  else
    echo "已在运行 pid=$(cat "$PIDFILE")"
    exit 0
  fi
fi

cd "$DIR/server"
EC_PORT="$PORT" EC_HOST="$BIND" setsid nohup "$NODE" server.mjs >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
sleep 1

if running; then
  echo "已启动 pid=$(cat "$PIDFILE") 监听 $BIND:$PORT"
else
  echo "启动失败，见 $LOG" >&2
  exit 1
fi
