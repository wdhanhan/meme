#!/usr/bin/env bash
set -euo pipefail

SERVICE_PREFIX="fish-s2-pro-gpu"
# Description tag written into every unit this script manages. Cleanup uses it
# to find and sweep stale units (renamed prefixes / leftover from earlier runs)
# without risking third-party systemd units.
MANAGED_MARKER="X-Memec-Managed=1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKDIR="${SCRIPT_DIR}/fish-speech"
VENV_PY="${ROOT_DIR}/.venvs/fishspeech/bin/python"
MODEL_DIR="${SCRIPT_DIR}/fish-speech/checkpoints/s2-pro"
LOCAL_LOG_DIR="${SCRIPT_DIR}/logs"
BASE_PORT="${FISH_BASE_PORT:-8080}"
# Interface to bind fish API on. Default 0.0.0.0 so both the tailscale IP and
# 127.0.0.1 reach the service — frees us from baking a specific IP into the
# unit (which breaks on IP change) and lets the local backend + heartbeat
# probes reuse the loopback path on single-box installs.
LISTEN_HOST="${FISH_LISTEN_HOST:-0.0.0.0}"
# Minimum free VRAM per GPU (MiB) required before we will install a unit. Fish
# S2 Pro loads ~6GB after --compile warm-up, so anything under ~8GB is a
# restart loop waiting to happen. Override via FISH_MIN_FREE_VRAM_MB=0 to skip.
MIN_FREE_VRAM_MB="${FISH_MIN_FREE_VRAM_MB:-8000}"
# Persistent torch.compile + triton kernel caches. Default path lives under the
# repo so the snapshot cleanup (which wipes /tmp/*) keeps it intact — clones
# boot with the compiled kernels already on disk and skip the ~30s cold compile
# on first TTS request. Override via FISH_TORCH_CACHE_DIR= to relocate.
TORCH_CACHE_DIR="${FISH_TORCH_CACHE_DIR:-${ROOT_DIR}/.cache/torchinductor}"
TRITON_CACHE_DIR_VAL="${FISH_TRITON_CACHE_DIR:-${ROOT_DIR}/.cache/triton}"
mkdir -p "${TORCH_CACHE_DIR}" "${TRITON_CACHE_DIR_VAL}"

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

# Preflight: each GPU must have enough free VRAM for Fish to load + compile.
if [[ "${MIN_FREE_VRAM_MB}" -gt 0 ]]; then
  mapfile -t FREE_MB < <(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits)
  for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
    FREE="${FREE_MB[${GPU_ID}]:-0}"
    FREE="${FREE//[^0-9]/}"
    if [[ -z "${FREE}" || "${FREE}" -lt "${MIN_FREE_VRAM_MB}" ]]; then
      echo "[ERROR] GPU ${GPU_ID} free VRAM ${FREE:-0} MiB < required ${MIN_FREE_VRAM_MB} MiB."
      echo "        Close other processes on this card, or rerun with FISH_MIN_FREE_VRAM_MB=0 to skip."
      exit 1
    fi
  done
fi

mkdir -p "${LOCAL_LOG_DIR}"

# Cleanup pass: any systemd unit this script previously installed carries the
# managed marker in its Description. Sweep units whose GPU index is outside the
# current count — covers renamed prefixes and leftover cards from a downsized
# machine.
shopt -s nullglob
for SERVICE_PATH in /etc/systemd/system/*.service; do
  if ! grep -qF "${MANAGED_MARKER}" "${SERVICE_PATH}" 2>/dev/null; then
    continue
  fi
  SERVICE_BASENAME="$(basename "${SERVICE_PATH}" .service)"
  GPU_ID_OLD="$(grep -oE 'GPU [0-9]+' "${SERVICE_PATH}" | head -n1 | awk '{print $2}')"
  if [[ -z "${GPU_ID_OLD}" ]]; then
    continue
  fi
  if (( GPU_ID_OLD >= GPU_COUNT )) || [[ "${SERVICE_BASENAME}" != "${SERVICE_PREFIX}${GPU_ID_OLD}" ]]; then
    systemctl disable --now "${SERVICE_BASENAME}" >/dev/null 2>&1 || true
    rm -f "${SERVICE_PATH}"
    echo "[cleanup] removed stale managed unit: ${SERVICE_BASENAME}"
  fi
done
shopt -u nullglob

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
Description=Fish Audio S2 Pro API Service (GPU ${GPU_ID}) [${MANAGED_MARKER}]
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${WORKDIR}
Environment=PYTHONUNBUFFERED=1
Environment=CUDA_VISIBLE_DEVICES=${GPU_ID}
Environment=TORCHINDUCTOR_CACHE_DIR=${TORCH_CACHE_DIR}
Environment=TRITON_CACHE_DIR=${TRITON_CACHE_DIR_VAL}
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

echo "[OK] Services installed and enabled for ${GPU_COUNT} GPU(s). Listen host: ${LISTEN_HOST}"
for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
  PORT=$((BASE_PORT + GPU_ID))
  echo "  - ${SERVICE_PREFIX}${GPU_ID} => ${LISTEN_HOST}:${PORT} (GPU ${GPU_ID})"
done
echo "  status: systemctl status ${SERVICE_PREFIX}* --no-pager"
