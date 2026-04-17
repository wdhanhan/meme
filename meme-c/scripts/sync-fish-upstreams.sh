#!/usr/bin/env bash
# 按当前机器 GPU 数量重新生成 FISH_API_BASES，写入 .runtime/fish-upstreams.env 并重启 meme-c-backend。
# 增/减 Fish 实例或换卡后执行一次即可（需 root）。
# 若需固定地址列表：先 export FISH_API_BASES='http://...' 再执行本脚本，将保留该值不写回 nvidia 推导。
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[ERROR] 请用 root 执行: sudo $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_FILE="/etc/systemd/system/meme-c-backend.service"

# shellcheck source=fish-upstreams.inc.sh
source "${SCRIPT_DIR}/fish-upstreams.inc.sh"

fish_compute_fish_api_bases
fish_write_upstreams_env "${ROOT_DIR}"

migrate_systemd_unit() {
  [[ -f "${SERVICE_FILE}" ]] || {
    echo "[WARN] 未找到 ${SERVICE_FILE}，请先执行 scripts/deploy.sh"
    return 0
  }
  local changed=0
  if grep -q '^Environment=FISH_API_BASES=' "${SERVICE_FILE}"; then
    sed -i '/^Environment=FISH_API_BASES=/d' "${SERVICE_FILE}"
    changed=1
    echo "[INFO] 已从 unit 中移除内联 Environment=FISH_API_BASES（改由 EnvironmentFile 提供）"
  fi
  if ! grep -qE 'fish-upstreams\.env' "${SERVICE_FILE}"; then
    sed -i '/^\[Service\]/a EnvironmentFile=-'"${ROOT_DIR}"'/.runtime/fish-upstreams.env' "${SERVICE_FILE}"
    changed=1
    echo "[INFO] 已添加 EnvironmentFile=${ROOT_DIR}/.runtime/fish-upstreams.env"
  fi
  if [[ "${changed}" -eq 1 ]]; then
    systemctl daemon-reload
  fi
}

migrate_systemd_unit

echo "[INFO] FISH_API_BASES=${FISH_API_BASES}"
systemctl restart meme-c-backend
echo "[OK] meme-c-backend 已重启，Fish 上游已更新。"
