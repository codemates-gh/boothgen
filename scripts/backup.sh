#!/usr/bin/env bash
# BoothGen — backup script
# pg_dump → gzip → GPG encrypt → local + Google Drive
# Usage: bash scripts/backup.sh

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="boothgen"
BACKUP_ROOT="$HOME/${PROJECT_NAME}-backups"
ENV_FILE="$PROJECT_DIR/.env"
SCHEMA_FILE="$PROJECT_DIR/prisma/schema.prisma"
RCLONE_REMOTE="gdrive-boothgen"  # name you gave during rclone config
GDRIVE_FOLDER="SaaS_Backup/BoothGen/backups"
RETAIN_DAYS=30

# GPG recipient — set to your key fingerprint or email.
# Can also be set as GPG_RECIPIENT in .env.local to override.
GPG_RECIPIENT="${GPG_RECIPIENT:-}"

# ── Colors ────────────────────────────────────────────────────────────────────
ok()   { echo -e "\033[0;32m✓  $*\033[0m"; }
warn() { echo -e "\033[0;33m⚠  $*\033[0m"; }
err()  { echo -e "\033[0;31m✗  $*\033[0m" >&2; exit 1; }

# ── Load .env.local ───────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || err ".env.local not found at $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Validate ──────────────────────────────────────────────────────────────────
[[ -z "$GPG_RECIPIENT" ]] && \
    err "GPG_RECIPIENT not set. Add it to .env.local or the config section of this script."

# Neon: use DIRECT_URL for pg_dump (bypasses pooler); fall back to DATABASE_URL
DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
[[ -z "$DB_URL" ]] && err "DIRECT_URL or DATABASE_URL not set in .env.local"

command -v pg_dump >/dev/null 2>&1 || err "pg_dump not found — brew install libpq && brew link --force libpq"
command -v gpg     >/dev/null 2>&1 || err "gpg not found — brew install gnupg"
command -v rclone  >/dev/null 2>&1 || err "rclone not found — brew install rclone"

# Verify GPG key exists
gpg --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 || \
    err "GPG key not found for recipient: $GPG_RECIPIENT"

# ── Setup ─────────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$BACKUP_DIR" "$BACKUP_ROOT/logs"

echo ""
echo "══════════════════════════════════════════════════"
echo "  BoothGen Backup — $TIMESTAMP"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Database dump ──────────────────────────────────────────────────────────
echo "→ Dumping database..."
DB_FILE="$BACKUP_DIR/boothgen_${TIMESTAMP}.sql.gz.gpg"
pg_dump "$DB_URL" \
    --no-owner \
    --no-privileges \
    --if-exists \
    --clean \
    --format=plain \
    | gzip \
    | gpg --batch --yes \
          --recipient "$GPG_RECIPIENT" \
          --encrypt \
    > "$DB_FILE"
ok "Database → $(basename "$DB_FILE")"

# ── 2. Encrypt .env.local ─────────────────────────────────────────────────────
echo "→ Encrypting .env.local..."
ENV_FILE_BACKUP="$BACKUP_DIR/.env.gpg"
gpg --batch --yes \
    --recipient "$GPG_RECIPIENT" \
    --encrypt \
    --output "$ENV_FILE_BACKUP" \
    "$ENV_FILE"
ok ".env.local → $(basename "$ENV_FILE_BACKUP")"

# ── 3. Schema snapshot ────────────────────────────────────────────────────────
if [[ -f "$SCHEMA_FILE" ]]; then
    echo "→ Snapshotting schema..."
    cp "$SCHEMA_FILE" "$BACKUP_DIR/schema.prisma"
    ok "schema.prisma → schema.prisma"
else
    warn "schema.prisma not found — skipping"
fi

# ── 4. RESTORE.txt ────────────────────────────────────────────────────────────
cat > "$BACKUP_DIR/RESTORE.txt" << EOF
BoothGen Backup
Timestamp : $TIMESTAMP
Host      : $(hostname)
Project   : $PROJECT_DIR

ARTIFACTS
─────────
$(basename "$DB_FILE")
  Postgres dump — pg_dump plain SQL, gzip-compressed, GPG-encrypted
  Restore:
    gpg --decrypt boothgen_${TIMESTAMP}.sql.gz.gpg | gunzip | psql "\$DIRECT_URL"
    npx prisma generate

.env.gpg
  Encrypted copy of .env.local
  Restore:
    gpg --decrypt .env.gpg > .env.local && chmod 600 .env.local

schema.prisma
  Plaintext snapshot of prisma/schema.prisma

RESTORE SCRIPT
──────────────
  ./scripts/restore.sh                          — interactive
  ./scripts/restore.sh list                     — list all backups
  ./scripts/restore.sh $TIMESTAMP db   — DB only
  ./scripts/restore.sh $TIMESTAMP all  — everything
EOF
ok "RESTORE.txt written"

# ── 5. Upload to Google Drive ─────────────────────────────────────────────────
echo "→ Uploading to Google Drive..."
GDRIVE_PATH="${RCLONE_REMOTE}:${GDRIVE_FOLDER}/${TIMESTAMP}"
rclone copy "$BACKUP_DIR" "$GDRIVE_PATH"
ok "Uploaded → $GDRIVE_PATH"

# ── 6. Purge local backups older than RETAIN_DAYS ────────────────────────────
echo "→ Pruning local backups older than ${RETAIN_DAYS} days..."
LOCAL_PURGED=0
while IFS= read -r dir; do
    [[ -z "$dir" ]] && continue
    rm -rf "$dir"
    warn "  Removed local: $(basename "$dir")"
    (( LOCAL_PURGED++ )) || true
done < <(find "$BACKUP_ROOT" \
    -mindepth 1 -maxdepth 1 \
    -type d \
    -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' \
    -mtime "+${RETAIN_DAYS}" 2>/dev/null || true)
[[ "$LOCAL_PURGED" -eq 0 ]] && ok "No local backups to purge"

# ── 7. Purge Google Drive backups older than RETAIN_DAYS ─────────────────────
echo "→ Pruning Google Drive backups older than ${RETAIN_DAYS} days..."
GDRIVE_PURGED=0
CUTOFF=$(date -v "-${RETAIN_DAYS}d" +%Y-%m-%d 2>/dev/null || \
         date -d "${RETAIN_DAYS} days ago" +%Y-%m-%d)
while IFS= read -r folder; do
    [[ -z "$folder" ]] && continue
    folder="${folder%/}"
    FOLDER_DATE=$(echo "$folder" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || true)
    [[ -z "$FOLDER_DATE" ]] && continue
    if [[ "$FOLDER_DATE" < "$CUTOFF" ]]; then
        rclone purge "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/$folder" 2>/dev/null || true
        warn "  Removed GDrive: $folder"
        (( GDRIVE_PURGED++ )) || true
    fi
done < <(rclone lsf "${RCLONE_REMOTE}:${GDRIVE_FOLDER}" --dirs-only 2>/dev/null || true)
[[ "$GDRIVE_PURGED" -eq 0 ]] && ok "No Google Drive backups to purge"

# ── Summary ───────────────────────────────────────────────────────────────────
LOCAL_COUNT=$(find "$BACKUP_ROOT" \
    -mindepth 1 -maxdepth 1 -type d \
    -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' \
    2>/dev/null | wc -l | tr -d ' ')
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo "══════════════════════════════════════════════════"
ok "Backup complete"
echo ""
echo "  Local path   : $BACKUP_DIR"
echo "  GDrive path  : $GDRIVE_PATH"
echo "  Size         : $BACKUP_SIZE"
echo "  Local kept   : $LOCAL_COUNT backup(s)"
echo "  Local purged : $LOCAL_PURGED"
echo "  GDrive purged: $GDRIVE_PURGED"
echo "══════════════════════════════════════════════════"
echo ""
