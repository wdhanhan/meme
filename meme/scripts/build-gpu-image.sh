#!/usr/bin/env bash
# build-gpu-image.sh — prep a GPU host into a "golden" state so a cloud image
# / snapshot of it can be cloned to spin up new workers.
#
# Modes:
#   in-place (default)  Uses the repo at its current path as the runtime root.
#                       Skips rsync, skips fish install if venv+model already
#                       exist. Use this when the machine itself IS becoming
#                       the image (Aliyun "create custom image" / AWS AMI
#                       from a running instance).
#   staged              Set MEMEC_INSTALL_PATH to a different path; repo is
#                       rsynced there. Use this when you want the runtime to
#                       live at a canonical path like /opt/meme.
#
# What the script does:
#   1. Installs Tailscale, curl, jq (idempotent).
#   2. [staged only] rsyncs the repo to MEMEC_INSTALL_PATH.
#   3. [if needed] runs fish-speech installer to bake venv + model.
#   4. Writes memec-node-bootstrap.service which, on first boot, runs
#      node-bootstrap.sh against /etc/memec-bootstrap.env.
#
# Intentionally does NOT clean machine-specific state. Before powering off
# for the snapshot, run `pre-snapshot-cleanup.sh` (printed at the end).

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[ERROR] must run as root" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEME_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${MEME_DIR}/.." && pwd)"

TARGET_ROOT="${MEMEC_INSTALL_PATH:-${REPO_ROOT}}"

echo "[build] repo at:       ${REPO_ROOT}"
echo "[build] runtime target: ${TARGET_ROOT}"

echo "[build] installing system dependencies (tailscale, curl, jq)"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl jq rsync ca-certificates git
fi
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable tailscaled >/dev/null 2>&1 || true

if [[ "${TARGET_ROOT}" != "${REPO_ROOT}" ]]; then
  echo "[build] syncing repo to ${TARGET_ROOT}"
  mkdir -p "${TARGET_ROOT}"
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'meme-c/data/postgres/' \
    --exclude 'meme-c/logs/' \
    --exclude '**/node_modules/' \
    --exclude '**/dist/' \
    --exclude '**/build/' \
    --exclude '**/__pycache__/' \
    "${REPO_ROOT}/" "${TARGET_ROOT}/"
else
  echo "[build] in-place mode: no rsync needed"
fi

FISH_VENV_PY="${TARGET_ROOT}/.venvs/fishspeech/bin/python"
MODEL_DIR="${TARGET_ROOT}/meme/fish-speech/checkpoints/s2-pro"
if [[ -x "${FISH_VENV_PY}" && -f "${MODEL_DIR}/codec.pth" ]]; then
  echo "[build] fish venv + model already present, skipping installer"
else
  echo "[build] baking fish-speech (this may take a while)"
  python3 "${TARGET_ROOT}/meme/start_fish_s2_server.py" --skip-install || true
  python3 "${TARGET_ROOT}/meme/start_fish_s2_server.py"
fi

BOOTSTRAP_PATH="${TARGET_ROOT}/meme/scripts/node-bootstrap.sh"
if [[ ! -x "${BOOTSTRAP_PATH}" ]]; then
  chmod +x "${BOOTSTRAP_PATH}"
fi

echo "[build] installing memec-node-bootstrap.service"
cat > /etc/systemd/system/memec-node-bootstrap.service <<EOF
[Unit]
Description=memec node first-boot bootstrap
After=network-online.target tailscaled.service
Wants=network-online.target
ConditionPathExists=/etc/memec-bootstrap.env
ConditionPathExists=!/var/lib/memec-bootstrap.done

[Service]
Type=oneshot
EnvironmentFile=/etc/memec-bootstrap.env
ExecStart=/bin/bash ${BOOTSTRAP_PATH}
ExecStartPost=/bin/touch /var/lib/memec-bootstrap.done
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable memec-node-bootstrap.service

echo
echo "[OK] bootstrap unit installed, pointing at:"
echo "     ${BOOTSTRAP_PATH}"
echo
echo "Before powering off to snapshot, run:"
echo "     sudo bash ${MEME_DIR}/scripts/pre-snapshot-cleanup.sh"
echo "     poweroff"
echo
echo "Then in Aliyun console: ECS 实例 → 更多 → 云盘和镜像 → 创建自定义镜像."
