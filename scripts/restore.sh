#!/usr/bin/env bash
# BoothGen — interactive restore script
# Restores DB, .env, or schema from local or Google Drive backup
#
# Usage:
#   ./scripts/restore.sh                             — interactive
#   ./scripts/restore.sh list                        — list all backups and exit
#   ./scripts/restore.sh 2026-06-22_030000           — pick backup, interactive restore
#   ./scripts/restore.sh 2026-06-22_030000 db        — DB only (non-interactive)
#   ./scripts/restore.sh 2026-06-22_030000 env       — .env only
#   ./scripts/restore.sh 2026-06-22_030000 schema    — schema only
#   ./scripts/restore.sh 2026-06-22_030000 all       — everything

set -euo pipefail

# ── Config (must match backup.sh) ─────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="boothgen"
BACKUP_ROOT="$HOME/${PROJECT_NAME}-backups"
ENV_FILE="$PROJECT_DIR/.env"
SCHEMA_FILE="$PROJECT_DIR/prisma/schema.prisma"
RCLONE_REMOTE="gdrive-boothgen"  # name you gave during rclone config
GDRIVE_FOLDER="SaaS_Backup/BoothGen/backups"

# ── Colors ────────────────────────────────────────────────────────────────────
ok()   { echo -e "\033[0;32m✓  $*\033[0m"; }
warn() { echo -e "\033[0;33m⚠  $*\033[0m"; }
err()  { echo -e "\033[0;31m✗  $*\033[0m" >&2; exit 1; }

# ── Load .env.local ───────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
[[ -z "$DB_URL" ]] && err "DIRECT_URL or DATABASE_URL not set in .env.local"

# ── Sanity checks ─────────────────────────────────────────────────────────────
command -v gpg    >/dev/null 2>&1 || err "gpg not found — brew install gnupg"
command -v psql   >/dev/null 2>&1 || err "psql not found — brew install libpq && brew link --force libpq"
command -v rclone >/dev/null 2>&1 || err "rclone not found — brew install rclone"

# ── Build merged backup list ──────────────────────────────────────────────────
declare -A BACKUP_LOCATION  # timestamp → "local", "gdrive", or "both"

while IFS= read -r d; do
    ts="$(basename "$d")"
    BACKUP_LOCATION["$ts"]="local"
done < <(find "$BACKUP_ROOT" \
    -mindepth 1 -maxdepth 1 -type d \
    -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' \
    2>/dev/null | sort -r || true)

while IFS= read -r line; do
    ts="${line%/}"
    [[ -z "$ts" ]] && continue
    if [[ -n "${BACKUP_LOCATION[$ts]+x}" ]]; then
        BACKUP_LOCATION["$ts"]="both"
    else
        BACKUP_LOCATION["$ts"]="gdrive"
    fi
done < <(rclone lsf "${RCLONE_REMOTE}:${GDRIVE_FOLDER}" --dirs-only 2>/dev/null | sort -r || true)

# Sorted list of all timestamps newest first
IFS=$'\n' ALL_BACKUPS=($(echo "${!BACKUP_LOCATION[*]}" | tr ' ' '\n' | sort -r)); unset IFS

# ── "list" mode ───────────────────────────────────────────────────────────────
print_list() {
    echo ""
    echo "  BoothGen backups (newest first)"
    echo "  ────────────────────────────────────────────────────────"
    if [[ ${#ALL_BACKUPS[@]} -eq 0 ]]; then
        warn "  No backups found locally or in Google Drive."
    else
        for i in "${!ALL_BACKUPS[@]}"; do
            ts="${ALL_BACKUPS[$i]}"
            loc="${BACKUP_LOCATION[$ts]}"
            tag=""
            [[ "$loc" == "local" ]] && tag="[local]"
            [[ "$loc" == "gdrive" ]] && tag="[gdrive]"
            [[ "$loc" == "both" ]] && tag="[local][gdrive]"
            printf "  %2d)  %-25s  %s\n" "$(( i + 1 ))" "$ts" "$tag"
        done
    fi
    echo ""
}

if [[ "${1:-}" == "list" ]]; then
    print_list
    exit 0
fi

[[ ${#ALL_BACKUPS[@]} -eq 0 ]] && err "No backups found locally or in Google Drive."

# ── Select backup ─────────────────────────────────────────────────────────────
CHOSEN_TS=""
CHOSEN_ACTION=""

if [[ -n "${1:-}" ]]; then
    # Match arg against known timestamps
    for ts in "${ALL_BACKUPS[@]}"; do
        if [[ "$ts" == *"${1}"* ]]; then
            CHOSEN_TS="$ts"
            break
        fi
    done
    [[ -z "$CHOSEN_TS" ]] && err "No backup found matching: ${1}"
    CHOSEN_ACTION="${2:-}"
else
    print_list
    read -rp "  Select backup (number or partial timestamp): " SEL
    if [[ "$SEL" =~ ^[0-9]+$ ]] && (( SEL >= 1 && SEL <= ${#ALL_BACKUPS[@]} )); then
        CHOSEN_TS="${ALL_BACKUPS[$(( SEL - 1 ))]}"
    else
        for ts in "${ALL_BACKUPS[@]}"; do
            if [[ "$ts" == *"$SEL"* ]]; then CHOSEN_TS="$ts"; break; fi
        done
        [[ -z "$CHOSEN_TS" ]] && err "Invalid selection: $SEL"
    fi
fi

ok "Selected: $CHOSEN_TS  [${BACKUP_LOCATION[$CHOSEN_TS]}]"

# ── Ensure backup is local (download from GDrive if needed) ──────────────────
LOCAL_BACKUP_DIR="$BACKUP_ROOT/$CHOSEN_TS"
if [[ ! -d "$LOCAL_BACKUP_DIR" ]]; then
    echo ""
    echo "  Backup not local — downloading from Google Drive..."
    mkdir -p "$LOCAL_BACKUP_DIR"
    rclone copy "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/${CHOSEN_TS}" "$LOCAL_BACKUP_DIR"
    ok "Downloaded to $LOCAL_BACKUP_DIR"
fi

# Locate artifacts
DB_FILE=$(find "$LOCAL_BACKUP_DIR" -name "*.sql.gz.gpg" 2>/dev/null | head -1 || true)
ENV_BACKUP="$LOCAL_BACKUP_DIR/.env.gpg"
SCHEMA_BACKUP="$LOCAL_BACKUP_DIR/schema.prisma"

# ── Select restore action ─────────────────────────────────────────────────────
show_action_menu() {
    echo ""
    echo "  What would you like to restore?"
    echo ""
    echo "    1)  Database only"
    echo "    2)  .env only"
    echo "    3)  Schema only"
    echo "    4)  Database + schema  (recommended after a bad migration)"
    echo "    5)  Everything         (database + .env + schema)"
    echo ""
}

resolve_action() {
    case "$1" in
        1|db)         echo "db" ;;
        2|env)        echo "env" ;;
        3|schema)     echo "schema" ;;
        4|db+schema)  echo "db_schema" ;;
        5|all)        echo "all" ;;
        *)            echo "" ;;
    esac
}

if [[ -n "$CHOSEN_ACTION" ]]; then
    ACTION=$(resolve_action "$CHOSEN_ACTION")
    [[ -z "$ACTION" ]] && err "Unknown action: $CHOSEN_ACTION. Use: db | env | schema | all"
else
    show_action_menu
    read -rp "  Select restore option (1-5): " SEL
    ACTION=$(resolve_action "$SEL")
    [[ -z "$ACTION" ]] && err "Invalid selection: $SEL"
fi

# ── Determine what will be touched ───────────────────────────────────────────
DO_DB=false; DO_ENV=false; DO_SCHEMA=false
case "$ACTION" in
    db)        DO_DB=true ;;
    env)       DO_ENV=true ;;
    schema)    DO_SCHEMA=true ;;
    db_schema) DO_DB=true; DO_SCHEMA=true ;;
    all)       DO_DB=true; DO_ENV=true; DO_SCHEMA=true ;;
esac

# Validate required artifacts exist
$DO_DB && [[ -z "$DB_FILE" ]] && err "No .sql.gz.gpg file found in $LOCAL_BACKUP_DIR"
$DO_ENV && [[ ! -f "$ENV_BACKUP" ]] && err ".env.gpg not found in $LOCAL_BACKUP_DIR"
$DO_SCHEMA && [[ ! -f "$SCHEMA_BACKUP" ]] && err "schema.prisma not found in $LOCAL_BACKUP_DIR"

# ── Warning ───────────────────────────────────────────────────────────────────
DB_HOST=$(echo "$DB_URL" | sed 's|postgresql://[^@]*@||' | cut -d/ -f1 2>/dev/null || echo "Neon database")
echo ""
echo -e "\033[0;31m╔══════════════════════════════════════════════════════════╗"
echo -e "║  WARNING: DESTRUCTIVE ACTION                             ║"
echo -e "║                                                          ║"
$DO_DB     && echo -e "║  • DROP and recreate all tables in: $DB_HOST"
$DO_DB     && echo -e "║                                                          ║"
$DO_ENV    && echo -e "║  • Overwrite .env.local                                  ║"
$DO_SCHEMA && echo -e "║  • Overwrite prisma/schema.prisma                        ║"
echo -e "║                                                          ║"
echo -e "║  Backup: $CHOSEN_TS                     ║"
echo -e "╚══════════════════════════════════════════════════════════╝\033[0m"
echo ""
read -rp "  Type YES to proceed: " CONFIRM
[[ "$CONFIRM" != "YES" ]] && { warn "Aborted."; exit 0; }
echo ""

# ── Restore: Database ─────────────────────────────────────────────────────────
if $DO_DB; then
    echo "→ Restoring database..."
    echo "  (DROP errors on a fresh schema are expected and safe)"
    echo ""
    RESTORE_LOG="/tmp/boothgen_restore_$$.log"
    gpg --batch --decrypt "$DB_FILE" \
        | gunzip \
        | psql "$DB_URL" -v ON_ERROR_STOP=0 2>&1 \
        | tee "$RESTORE_LOG" || true
    ERR_COUNT=$(grep -c "^ERROR" "$RESTORE_LOG" 2>/dev/null || echo 0)
    rm -f "$RESTORE_LOG"
    echo ""
    if [[ "$ERR_COUNT" -gt 0 ]]; then
        warn "DB restore finished with $ERR_COUNT SQL error(s) — see output above"
    else
        ok "Database restored"
    fi

    echo "→ Running prisma generate..."
    cd "$PROJECT_DIR" && npx prisma generate --silent 2>/dev/null && ok "Prisma client regenerated" || \
        warn "prisma generate failed — run manually: npx prisma generate"
fi

# ── Restore: .env ─────────────────────────────────────────────────────────────
if $DO_ENV; then
    echo "→ Restoring .env.local..."
    gpg --batch --decrypt --output "$ENV_FILE" "$ENV_BACKUP"
    chmod 600 "$ENV_FILE"
    ok ".env.local restored (chmod 600)"
fi

# ── Restore: Schema ───────────────────────────────────────────────────────────
if $DO_SCHEMA; then
    echo "→ Restoring schema.prisma..."
    if [[ -f "$SCHEMA_FILE" ]]; then
        SCHEMA_TMP="/tmp/schema.prisma.bak.$(date +%s)"
        cp "$SCHEMA_FILE" "$SCHEMA_TMP"
        warn "  Current schema saved to $SCHEMA_TMP"
    fi
    cp "$SCHEMA_BACKUP" "$SCHEMA_FILE"
    ok "schema.prisma restored"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
ok "Restore complete — $CHOSEN_TS"
echo ""
echo "  Next steps:"
echo "   • Verify the app: open https://www.boothgen.com"
$DO_DB && echo "   • If schema changed: npm run db  (prisma db push)"
$DO_ENV && echo "   • Restart dev server to pick up new .env.local"
echo "══════════════════════════════════════════════════"
echo ""
