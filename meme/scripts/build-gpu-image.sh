#!/usr/bin/env bash
# build-gpu-image.sh — prep a GPU host into a "golden" state so a cloud
# snapshot / AMI of the resulting disk can be cloned to spin up new workers.
#
# Run this once on a fresh Ubuntu 22.04+ GPU instance that has the NVIDIA
# driver installed. When it finishes, stop the instance and capture a
# snapshot / custom image from the cloud console. New workers launched from
# that snapshot will, at first boot, run /etc/memec-bootstrap.env +
# node-bootstrap.sh to join the cluster.
#
# What this script does:
#   1. Installs Tailscale, curl, jq.
#   2. Syncs the meme repo into /opt/meme (so node-bootstrap.sh is at a
#      stable path regardless of where this script was invoked from).
#   3. Runs the existing fish-speech installer so the venv + model are baked
#      into the image.
#   4. Writes a systemd oneshot unit `memec-node-bootstrap.service` that runs
#      on first boot against /etc/memec-bootstrap.env (which the operator
#      supplies via cloud-init userdata).
#   5. Clears machine-specific state so the snapshot is portable.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[ERROR] must run as root" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEME_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${MEME_DIR}/.." && pwd)"

TARGET_ROOT="/opt/meme"

echo "[build] installing system dependencies"
apt-get update
apt-get install -y curl jq rsync ca-certificates git

echo "[build] installing tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable tailscaled >/dev/null 2>&1 || true

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

echo "[build] baking fish-speech (venv + model) — this may take a while"
python3 "${TARGET_ROOT}/meme/start_fish_s2_server.py" --skip-install || true
# Second pass without skip-install to ensure deps are present too.
python3 "${TARGET_ROOT}/meme/start_fish_s2_server.py"

echo "[build] installing first-boot unit"
cat > /etc/systemd/system/memec-node-bootstrap.service <<'EOF'
[Unit]
Description=memec node first-boot bootstrap
After=network-online.target tailscaled.service
Wants=network-online.target
ConditionPathExists=/etc/memec-bootstrap.env
ConditionPathExists=!/var/lib/memec-bootstrap.done

[Service]
Type=oneshot
EnvironmentFile=/etc/memec-bootstrap.env
ExecStart=/bin/bash /opt/meme/meme/scripts/node-bootstrap.sh
ExecStartPost=/bin/touch /var/lib/memec-bootstrap.done
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable memec-node-bootstrap.service

echo "[build] clearing machine-specific state for portable snapshot"
tailscale logout >/dev/null 2>&1 || true
rm -f /var/lib/memec-bootstrap.done
truncate -s 0 /etc/machine-id || true
: > /var/log/lastlog || true
find /var/log -type f -name '*.log' -exec truncate -s 0 {} + || true
rm -rf /root/.bash_history /home/*/.bash_history /tmp/* /var/tmp/* || true

echo
echo "[OK] golden image prepared."
echo "Next steps:"
echo "  1. Power off this instance."
echo "  2. Capture a snapshot / create a custom image in your cloud console."
echo "  3. When launching a new GPU worker, attach cloud-init userdata that"
echo "     writes /etc/memec-bootstrap.env containing:"
echo "         TS_AUTHKEY=<tailscale-authkey>"
echo "         MEMEC_BACKEND_URL=<http(s)://backend-host:port>"
echo "         MEMEC_CLUSTER_TOKEN=<shared secret>"
echo "         MEMEC_REGION=<free-form tag, e.g. sa-riyadh>"
echo "     memec-node-bootstrap.service will run it exactly once at first boot."
