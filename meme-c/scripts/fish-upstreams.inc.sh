#!/usr/bin/env bash
# shellcheck shell=bash
# 由 deploy.sh / sync-fish-upstreams.sh source。
# 根据 GPU 数量（或显式 FISH_API_BASES）生成逗号分隔的 Fish 根地址，并写入 .runtime/fish-upstreams.env 供 systemd 加载。

fish_compute_fish_api_bases() {
  FISH_BASE_PORT="${FISH_BASE_PORT:-8080}"
  local GPU_COUNT="${FISH_GPU_COUNT:-}"
  if [[ -z "${GPU_COUNT}" ]]; then
    if command -v nvidia-smi >/dev/null 2>&1; then
      GPU_COUNT="$(nvidia-smi -L | wc -l | tr -d ' ')"
    else
      GPU_COUNT=1
    fi
  fi
  if [[ -z "${GPU_COUNT}" || "${GPU_COUNT}" -lt 1 ]]; then
    GPU_COUNT=1
  fi

  if [[ -n "${FISH_API_BASES:-}" ]]; then
    return 0
  fi

  FISH_API_BASES=""
  if [[ -n "${FISH_REMOTE_HOST:-}" ]]; then
    local GPU_ID PORT
    for ((GPU_ID = 0; GPU_ID < GPU_COUNT; GPU_ID++)); do
      PORT=$((FISH_BASE_PORT + GPU_ID))
      if [[ -z "${FISH_API_BASES}" ]]; then
        FISH_API_BASES="http://${FISH_REMOTE_HOST}:${PORT}"
      else
        FISH_API_BASES="${FISH_API_BASES},http://${FISH_REMOTE_HOST}:${PORT}"
      fi
    done
  else
    local GPU_ID PORT
    for ((GPU_ID = 0; GPU_ID < GPU_COUNT; GPU_ID++)); do
      PORT=$((FISH_BASE_PORT + GPU_ID))
      if [[ -z "${FISH_API_BASES}" ]]; then
        FISH_API_BASES="http://127.0.0.1:${PORT}"
      else
        FISH_API_BASES="${FISH_API_BASES},http://127.0.0.1:${PORT}"
      fi
    done
  fi
}

fish_write_upstreams_env() {
  local ROOT_DIR="$1"
  mkdir -p "${ROOT_DIR}/.runtime"
  umask 077
  {
    printf '%s\n' "FISH_API_BASES=${FISH_API_BASES}"
  } > "${ROOT_DIR}/.runtime/fish-upstreams.env.new"
  mv -f "${ROOT_DIR}/.runtime/fish-upstreams.env.new" "${ROOT_DIR}/.runtime/fish-upstreams.env"
  chmod 600 "${ROOT_DIR}/.runtime/fish-upstreams.env"
}
