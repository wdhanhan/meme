#!/usr/bin/env bash
# node-bootstrap.sh — one-shot bring-up for a GPU worker node.
#
# Responsibilities:
#   1. Install / join Tailscale (so backend can reach us on a private IP).
#   2. Pin fish TTS services to the tailscale interface.
#   3. (Re)generate systemd units via setup_fish_s2_service.sh and start them.
#   4. Register this node with the backend (shared-secret auth).
#   5. Install a systemd timer that heartbeats every 30s.
#
# Required env:
#   TS_AUTHKEY             Tailscale auth key (ephemeral or reusable).
#   MEMEC_BACKEND_URL      e.g. http://backend.tail1234.ts.net:8090
#   MEMEC_CLUSTER_TOKEN    Shared secret (matches backend MEMEC_CLUSTER_TOKEN).
#
# Optional env:
#   MEMEC_NODE_ID          Stable ID (default: hostname).
#   MEMEC_REGION           Free-form tag, e.g. "sa-riyadh".
#   FISH_BASE_PORT         First TCP port (default: 8080).

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[ERROR] must run as root" >&2
  exit 1
fi

: "${TS_AUTHKEY:?TS_AUTHKEY env is required}"
: "${MEMEC_BACKEND_URL:?MEMEC_BACKEND_URL env is required}"
: "${MEMEC_CLUSTER_TOKEN:?MEMEC_CLUSTER_TOKEN env is required}"

NODE_ID="${MEMEC_NODE_ID:-$(hostname -s)}"
REGION="${MEMEC_REGION:-}"
FISH_BASE_PORT="${FISH_BASE_PORT:-8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEME_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[bootstrap] node_id=${NODE_ID} region=${REGION:-unset}"

# --- 1. Tailscale ------------------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  echo "[bootstrap] installing tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled >/dev/null 2>&1 || true

tailscale up \
  --authkey="${TS_AUTHKEY}" \
  --hostname="${NODE_ID}" \
  --accept-routes \
  --ssh

TS_IP="$(tailscale ip -4 | head -n1 | tr -d '[:space:]')"
if [[ -z "${TS_IP}" ]]; then
  echo "[ERROR] failed to obtain tailscale IPv4" >&2
  exit 1
fi
echo "[bootstrap] tailscale_ip=${TS_IP}"

# --- 2 & 3. Bind fish to tailscale IP and (re)install units ------------------
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "[ERROR] nvidia-smi not found; cannot detect GPU count" >&2
  exit 1
fi
GPU_COUNT="$(nvidia-smi -L | wc -l | tr -d ' ')"
if [[ -z "${GPU_COUNT}" || "${GPU_COUNT}" -lt 1 ]]; then
  echo "[ERROR] no NVIDIA GPUs detected" >&2
  exit 1
fi

FISH_LISTEN_HOST="${TS_IP}" FISH_BASE_PORT="${FISH_BASE_PORT}" \
  bash "${MEME_DIR}/setup_fish_s2_service.sh"

for ((i=0; i<GPU_COUNT; i++)); do
  systemctl restart "fish-s2-pro-gpu${i}"
done

# --- 4. Register with backend -----------------------------------------------
REGISTER_PAYLOAD=$(cat <<JSON
{
  "node_id": "${NODE_ID}",
  "tailscale_ip": "${TS_IP}",
  "fish_port_base": ${FISH_BASE_PORT},
  "gpu_count": ${GPU_COUNT},
  "region": "${REGION}"
}
JSON
)

echo "[bootstrap] registering with ${MEMEC_BACKEND_URL}"
curl -fsS --retry 5 --retry-delay 2 --retry-connrefused \
  -H "Content-Type: application/json" \
  -H "X-Cluster-Token: ${MEMEC_CLUSTER_TOKEN}" \
  -d "${REGISTER_PAYLOAD}" \
  "${MEMEC_BACKEND_URL}/api/internal/nodes/register"
echo

# --- 5. Heartbeat timer ------------------------------------------------------
ENV_FILE="/etc/memec-node.env"
umask 077
cat > "${ENV_FILE}" <<EOF
MEMEC_BACKEND_URL=${MEMEC_BACKEND_URL}
MEMEC_CLUSTER_TOKEN=${MEMEC_CLUSTER_TOKEN}
MEMEC_NODE_ID=${NODE_ID}
EOF
chmod 600 "${ENV_FILE}"

HEARTBEAT_SCRIPT="/usr/local/bin/memec-heartbeat.sh"
cat > "${HEARTBEAT_SCRIPT}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source /etc/memec-node.env
curl -fsS --max-time 10 \
  -H "Content-Type: application/json" \
  -H "X-Cluster-Token: ${MEMEC_CLUSTER_TOKEN}" \
  -d "{\"node_id\":\"${MEMEC_NODE_ID}\"}" \
  "${MEMEC_BACKEND_URL}/api/internal/nodes/heartbeat" >/dev/null
EOF
chmod 755 "${HEARTBEAT_SCRIPT}"

cat > /etc/systemd/system/memec-heartbeat.service <<EOF
[Unit]
Description=memec cluster heartbeat
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${HEARTBEAT_SCRIPT}
EOF

cat > /etc/systemd/system/memec-heartbeat.timer <<'EOF'
[Unit]
Description=memec cluster heartbeat (every 30s)

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=memec-heartbeat.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now memec-heartbeat.timer

echo "[bootstrap] done. heartbeat timer active; fish services on ${TS_IP}:${FISH_BASE_PORT}+"
