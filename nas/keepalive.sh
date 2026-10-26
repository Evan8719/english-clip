#!/bin/sh
# English Clip · 守护脚本（每 5 分钟跑一次；不健康就重启）
# 设计：一切正常时静默（不输出）；只在真的重启过时输出一行，便于上层转发。
set -eu

DIR=${EC_APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}
LOG=$DIR/logs/server.log
PORT=${EC_PORT:-4188}

healthy() {
  curl -fsS -m 5 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1
}

# 日志超过 5MB 就轮转，保留一份
if [ -f "$LOG" ]; then
  size=$(wc -c < "$LOG" 2>/dev/null || echo 0)
  if [ "$size" -gt 5242880 ]; then
    mv -f "$LOG" "$LOG.1"
  fi
fi

if healthy; then
  exit 0
fi

echo "$(date '+%F %T') 健康检查失败，重启 English Clip 后端" >> "$DIR/logs/keepalive.log"
if "$DIR/run.sh" > /dev/null 2>&1; then
  echo "健康检查失败，已重启（$(date '+%F %T')）"
else
  echo "健康检查失败，且重启也失败了（$(date '+%F %T')），见 $LOG"
fi
