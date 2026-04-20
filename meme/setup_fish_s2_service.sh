#!/usr/bin/env bash
set -euo pipefail

SERVICE_PREFIX="fish-s2-pro-gpu"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKDIR="${SCRIPT_DIR}/fish-speech"
VENV_PY="${ROOT_DIR}/.venvs/fishspeech/bin/python"
MODEL_DIR="${SCRIPT_DIR}/fish-speech/checkpoints/s2-pro"
LOCAL_LOG_DIR="${SCRIPT_DIR}/logs"
BASE_PORT="${FISH_BASE_PORT:-8080}"
# Interface to bind fish API on. Default 127.0.0.1 (single-box). For cluster
# nodes, bootstrap.sh exports FISH_LISTEN_HOST to the tailscale IP so only the
# tailnet can reach the service.
LISTEN_HOST="${FISH_LISTEN_HOST:-127.0.0.1}"

if [[ ! -x "${VENV_PY}" ]]; then
  echo "[ERROR] Python venv not found: ${VENV_PY}"
  echo "Please run: python3 ${SCRIPT_DIR}/start_fish_s2_server.py"
  exit 1
fi

if [[ ! -d "${WORKDIR}" ]]; then
  echo "[ERROR] fish-speech repo not found: ${WORKDIR}"
  echo "Please run: python3 ${SCRIPT_DIR}/start_fish_s2_server.py"
  exit 1
fi

if [[ ! -d "${MODEL_DIR}" ]]; then
  echo "[ERROR] model link/dir not found: ${MODEL_DIR}"
  echo "Please run: python3 ${SCRIPT_DIR}/start_fish_s2_server.py --skip-install"
  exit 1
fi

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "[ERROR] nvidia-smi not found, cannot detect GPU count."
  exit 1
fi

GPU_COUNT="$(nvidia-smi -L | wc -l | tr -d ' ')"
if [[ -z "${GPU_COUNT}" || "${GPU_COUNT}" -lt 1 ]]; then
  echo "[ERROR] No NVIDIA GPU detected."
  exit 1
fi

mkdir -p "${LOCAL_LOG_DIR}"

for SERVICE_PATH in /etc/systemd/system/${SERVICE_PREFIX}*.service; do
  [[ -e "${SERVICE_PATH}" ]] || continue
  SERVICE_BASENAME="$(basename "${SERVICE_PATH}" .service)"
  GPU_ID_OLD="${SERVICE_BASENAME#${SERVICE_PREFIX}}"
  if [[ "${GPU_ID_OLD}" =~ ^[0-9]+$ ]] && (( GPU_ID_OLD >= GPU_COUNT )); then
    systemctl disable --now "${SERVICE_BASENAME}" >/dev/null 2>&1 || true
    rm -f "${SERVICE_PATH}"
  fi
done

for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
  SERVICE_NAME="${SERVICE_PREFIX}${GPU_ID}"
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  PORT=$((BASE_PORT + GPU_ID))
  LOG_FILE="/var/log/${SERVICE_NAME}.log"
  ERR_FILE="/var/log/${SERVICE_NAME}.err.log"
  LOCAL_LOG_FILE="${LOCAL_LOG_DIR}/${SERVICE_NAME}.log"
  LOCAL_ERR_FILE="${LOCAL_LOG_DIR}/${SERVICE_NAME}.err.log"

  touch "${LOG_FILE}" "${ERR_FILE}"
  chmod 0644 "${LOG_FILE}" "${ERR_FILE}"
  ln -sfn "${LOG_FILE}" "${LOCAL_LOG_FILE}"
  ln -sfn "${ERR_FILE}" "${LOCAL_ERR_FILE}"

  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Fish Audio S2 Pro API Service (GPU ${GPU_ID})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${WORKDIR}
Environment=PYTHONUNBUFFERED=1
Environment=CUDA_VISIBLE_DEVICES=${GPU_ID}
# 每个实例绑定单卡并独立监听端口。
ExecStart=${VENV_PY} tools/api_server.py --llama-checkpoint-path ${MODEL_DIR} --decoder-checkpoint-path ${MODEL_DIR}/codec.pth --listen ${LISTEN_HOST}:${PORT} --device cuda --compile --workers 1
Restart=always
RestartSec=5
StartLimitIntervalSec=0
TimeoutStopSec=30
KillSignal=SIGTERM
StandardOutput=append:${LOG_FILE}
StandardError=append:${ERR_FILE}

[Install]
WantedBy=multi-user.target
EOF

done

systemctl daemon-reload
for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
  systemctl enable "${SERVICE_PREFIX}${GPU_ID}"
done

echo "[OK] Services installed and enabled for ${GPU_COUNT} GPU(s)."
for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
  PORT=$((BASE_PORT + GPU_ID))
  echo "  - ${SERVICE_PREFIX}${GPU_ID} => 127.0.0.1:${PORT} (GPU ${GPU_ID})"
done
echo "  status: systemctl status ${SERVICE_PREFIX}* --no-pager"
