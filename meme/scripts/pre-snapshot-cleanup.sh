#!/usr/bin/env bash
# pre-snapshot-cleanup.sh — scrub machine-specific state from a GPU host
# right before powering off to create a cloud image. Run AFTER
# build-gpu-image.sh, as the last thing before `poweroff`.
#
# Removes:
#   - tailscale login state (so the clone registers as a new device)
#   - first-boot done marker (so the clone actually runs bootstrap)
#   - /etc/memec-node.env written by a previous bootstrap run
#   - machine-id (regenerated on first boot of the clone)
#   - SSH host keys (so every clone gets its own identity)
#   - bash history, journal logs, apt caches
#
# INTENTIONALLY KEPT (so clones auto-bootstrap without cloud-init):
#   - /etc/memec-bootstrap.env  -> must be written once on the golden image
#                                  before running this script.
#                                  Requires TS_AUTHKEY to be Reusable.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[ERROR] must run as root" >&2
  exit 1
fi

echo "[cleanup] tailscale logout"
if command -v tailscale >/dev/null 2>&1; then
  tailscale logout || true
  systemctl stop tailscaled || true
  rm -rf /var/lib/tailscale/tailscaled.state || true
fi

echo "[cleanup] removing first-boot markers and per-instance env"
rm -f /var/lib/memec-bootstrap.done
rm -f /etc/memec-node.env
if [[ ! -s /etc/memec-bootstrap.env ]]; then
  echo "[WARN] /etc/memec-bootstrap.env is missing or empty — clones will NOT auto-bootstrap." >&2
  echo "[WARN] Write it before running this script, or provide it via userdata at deploy time." >&2
else
  echo "[cleanup] KEEPING /etc/memec-bootstrap.env (baked into image for auto-bootstrap)"
fi
systemctl disable memec-heartbeat.timer >/dev/null 2>&1 || true
rm -f /etc/systemd/system/memec-heartbeat.service
rm -f /etc/systemd/system/memec-heartbeat.timer

echo "[cleanup] resetting machine-id"
: > /etc/machine-id
rm -f /var/lib/dbus/machine-id
ln -s /etc/machine-id /var/lib/dbus/machine-id 2>/dev/null || true

echo "[cleanup] removing SSH host keys (regenerated on next boot)"
rm -f /etc/ssh/ssh_host_*

echo "[cleanup] removing per-host user SSH state (authorized_keys, known_hosts, keypairs)"
rm -f /root/.ssh/authorized_keys /root/.ssh/known_hosts /root/.ssh/known_hosts.old
rm -f /root/.ssh/id_* /root/.ssh/id_*.pub
rm -f /root/.lesshst

echo "[cleanup] removing baked secrets from repo (.env.*.local must come from userdata)"
find /root/meme -maxdepth 6 -name '.env.*.local' -not -path '*/.venvs/*' -not -path '*/node_modules/*' -print -delete 2>/dev/null || true

echo "[cleanup] clearing tmp + user caches"
rm -rf /tmp/* /tmp/.[!.]* /var/tmp/* 2>/dev/null || true
rm -rf /root/.cache/pip /root/.cache/huggingface /root/.cache/modelscope /root/.cache/torch 2>/dev/null || true

echo "[cleanup] removing developer/IDE state (cursor, vscode)"
rm -rf /root/.cursor /root/.cursor-server /root/.vscode-server 2>/dev/null || true
rm -rf /root/.config/configstore 2>/dev/null || true
# Intentionally keep /root/.claude and /root/.claude.json so clones boot with
# Claude Code ready to use. NOTE: these dirs may contain auth tokens / API
# keys — every clone of this image will inherit them.

echo "[cleanup] truncating logs"
journalctl --rotate >/dev/null 2>&1 || true
journalctl --vacuum-time=1s >/dev/null 2>&1 || true
find /var/log -type f \( -name '*.log' -o -name '*.gz' -o -name '*.1' \) -exec truncate -s 0 {} \; 2>/dev/null || true

echo "[cleanup] clearing apt caches"
apt-get clean >/dev/null 2>&1 || true

echo "[cleanup] clearing shell histories"
rm -f /root/.bash_history
find /home -maxdepth 2 -name '.bash_history' -delete 2>/dev/null || true
history -c 2>/dev/null || true

echo
echo "[OK] machine state scrubbed. Safe to 'poweroff' and snapshot now."
