#!/usr/bin/env bash
# BoothGen — install or remove the launchd daily backup schedule
#
# Usage:
#   bash scripts/setup-backup-schedule.sh            — install (3 AM daily)
#   bash scripts/setup-backup-schedule.sh uninstall  — remove schedule

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="boothgen"
BACKUP_ROOT="$HOME/${PROJECT_NAME}-backups"
LAUNCHD_LABEL="com.${PROJECT_NAME}.backup"
PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup.sh"
LOG_DIR="$BACKUP_ROOT/logs"

# ── Colors ────────────────────────────────────────────────────────────────────
ok()   { echo -e "\033[0;32m✓  $*\033[0m"; }
warn() { echo -e "\033[0;33m⚠  $*\033[0m"; }
err()  { echo -e "\033[0;31m✗  $*\033[0m" >&2; exit 1; }

# ── Uninstall ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "uninstall" ]]; then
    if launchctl list "$LAUNCHD_LABEL" &>/dev/null; then
        launchctl unload "$PLIST"
        ok "Unloaded $LAUNCHD_LABEL"
    else
        warn "$LAUNCHD_LABEL was not loaded"
    fi
    if [[ -f "$PLIST" ]]; then
        rm "$PLIST"
        ok "Removed $PLIST"
    else
        warn "Plist not found at $PLIST"
    fi
    echo ""
    ok "Backup schedule removed."
    echo ""
    exit 0
fi

# ── Install ───────────────────────────────────────────────────────────────────
[[ -f "$BACKUP_SCRIPT" ]] || err "backup.sh not found at $BACKUP_SCRIPT"
[[ -x "$BACKUP_SCRIPT" ]] || chmod +x "$BACKUP_SCRIPT"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# Write plist
cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${BACKUP_SCRIPT}</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/backup.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/backup.error.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

ok "Plist written → $PLIST"

# Unload existing job if present (avoid duplicate)
if launchctl list "$LAUNCHD_LABEL" &>/dev/null; then
    launchctl unload "$PLIST"
    warn "Previous schedule unloaded"
fi

launchctl load "$PLIST"
ok "Schedule loaded — backup runs daily at 3 AM"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
ok "Backup schedule installed"
echo ""
echo "  Schedule  : daily at 3:00 AM"
echo "  Script    : $BACKUP_SCRIPT"
echo "  Log       : $LOG_DIR/backup.log"
echo "  Error log : $LOG_DIR/backup.error.log"
echo ""
echo "  Useful commands:"
echo ""
echo "  Verify schedule is loaded:"
echo "    launchctl list $LAUNCHD_LABEL"
echo ""
echo "  Run a backup right now:"
echo "    bash $BACKUP_SCRIPT"
echo ""
echo "  Watch the log:"
echo "    tail -f $LOG_DIR/backup.log"
echo ""
echo "  Remove schedule:"
echo "    bash $PROJECT_DIR/scripts/setup-backup-schedule.sh uninstall"
echo "══════════════════════════════════════════════════"
echo ""
