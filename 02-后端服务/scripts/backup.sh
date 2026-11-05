#!/usr/bin/env bash
# MySQL 备份脚本：每日 02:00 由 cron 调用
# 用法：bash scripts/backup.sh
# cron 示例：0 2 * * * cd /opt/jianheng/02-后端服务 && bash scripts/backup.sh >> logs/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d_%H%M)
OUT_DIR="${BACKUP_DIR:-./backups}"
DB_NAME="${MYSQL_DATABASE:-miniprogram}"
ROOT_PWD="${MYSQL_ROOT_PASSWORD:-123456}"

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/jianheng_${STAMP}.sql.gz"

docker compose exec -T mysql mysqldump \
  -uroot -p"$ROOT_PWD" \
  --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip > "$OUT"

# 保留 7 天
find "$OUT_DIR" -name 'jianheng_*.sql.gz' -mtime +7 -delete

echo "$(date '+%F %T') backup ok: $OUT"
