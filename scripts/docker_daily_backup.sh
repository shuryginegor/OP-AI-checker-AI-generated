#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_INTERVAL_SEC="${BACKUP_INTERVAL_SEC:-86400}"
BACKUP_RUN_ONCE="${BACKUP_RUN_ONCE:-false}"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-lecture_db}"
export PGHOST PGPORT PGUSER PGDATABASE
if [ -n "${PGPASSWORD:-}" ]; then
  export PGPASSWORD
fi

mkdir -p "$BACKUP_DIR"

stop_requested=0
handle_stop() {
  stop_requested=1
}
trap handle_stop INT TERM

run_backup_once() {
  timestamp="$(date -u +%Y-%m-%d_%H-%M-%S)"
  target_file="${BACKUP_DIR}/postgres_${timestamp}.sql.gz"
  tmp_sql="${BACKUP_DIR}/.postgres_${timestamp}.sql.tmp"
  tmp_file="${BACKUP_DIR}/.postgres_${timestamp}.sql.gz.tmp"
  latest_file="${BACKUP_DIR}/latest_postgres.sql.gz"

  attempt=1
  while [ "$attempt" -le 10 ]; do
    if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
      break
    fi
    if [ "$attempt" -eq 10 ]; then
      echo "[Docker Backup] ❌ PostgreSQL (${PGHOST}:${PGPORT}/${PGDATABASE}) недоступен." >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  rm -f "$tmp_sql" "$tmp_file"
  if ! pg_dump --clean --if-exists --no-owner --no-acl -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE" > "$tmp_sql"; then
    rm -f "$tmp_sql" "$tmp_file"
    echo "[Docker Backup] ❌ Ошибка выполнения pg_dump." >&2
    return 1
  fi

  if [ ! -s "$tmp_sql" ]; then
    rm -f "$tmp_sql" "$tmp_file"
    echo "[Docker Backup] ❌ Дамп pg_dump оказался пустым." >&2
    return 1
  fi

  if ! gzip -c "$tmp_sql" > "$tmp_file"; then
    rm -f "$tmp_sql" "$tmp_file"
    echo "[Docker Backup] ❌ Ошибка сжатия gzip." >&2
    return 1
  fi
  rm -f "$tmp_sql"

  if [ ! -s "$tmp_file" ] || ! gzip -t "$tmp_file" >/dev/null 2>&1; then
    rm -f "$tmp_file"
    echo "[Docker Backup] ❌ Проверка целостности архива (gzip -t) не пройдена." >&2
    return 1
  fi

  mv -f "$tmp_file" "$target_file"
  cp -f "$target_file" "${latest_file}.tmp" && mv -f "${latest_file}.tmp" "$latest_file"

  # Ротация: удаляем бэкапы старше BACKUP_RETENTION_DAYS дней
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres_*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete || true

  file_size="$(wc -c < "$target_file" | tr -d ' ')"
  echo "[Docker Backup] ✅ Ежесуточный бэкап PostgreSQL создан и проверен: ${target_file} (${file_size} байт)"
  return 0
}

echo "[Docker Backup] Запуск службы ежесуточного резервного копирования PostgreSQL (интервал: ${BACKUP_INTERVAL_SEC} сек., хранение: ${BACKUP_RETENTION_DAYS} дн.)"

while [ "$stop_requested" -eq 0 ]; do
  run_backup_once || echo "[Docker Backup] ⚠️ Повторная попытка в следующем цикле." >&2
  if [ "$BACKUP_RUN_ONCE" = "true" ]; then
    break
  fi
  slept=0
  while [ "$slept" -lt "$BACKUP_INTERVAL_SEC" ] && [ "$stop_requested" -eq 0 ]; do
    chunk=5
    remaining=$((BACKUP_INTERVAL_SEC - slept))
    if [ "$remaining" -lt "$chunk" ]; then
      chunk="$remaining"
    fi
    sleep "$chunk"
    slept=$((slept + chunk))
  done
done
