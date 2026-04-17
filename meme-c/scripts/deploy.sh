#!/usr/bin/env bash
set -euo pipefail

export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_SRC_DIR="${ROOT_DIR}/frontend"
FRONTEND_MAIN_DIR="${ROOT_DIR}/frontend-main"
FRONTEND_ADMIN_DIR="${ROOT_DIR}/frontend-admin"
FRONTEND_DIR="/var/www/meme-c/frontend"
SKIP_FRONTEND_DEPLOY="${MEMEC_SKIP_FRONTEND_DEPLOY:-1}"
LOG_DIR="${ROOT_DIR}/logs"
BIN_PATH="${BACKEND_DIR}/meme-c-backend"
SERVICE_NAME="meme-c-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_SITE="/etc/nginx/sites-available/meme-c.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/meme-c.conf"
FISH_BASE_PORT="${FISH_BASE_PORT:-8080}"
# 逗号分隔的 Fish 根地址，例如 http://8.215.100.152:8080,http://8.215.100.152:8081
# 若已设置则优先生效，不再按本机 GPU 或远程主机推导。
FISH_API_BASES="${FISH_API_BASES:-}"
# 仅填主机名或 IP：按 FISH_GPU_COUNT（或本机 nvidia 卡数）在 FISH_BASE_PORT 起递增端口生成地址。
FISH_REMOTE_HOST="${FISH_REMOTE_HOST:-${MEMEC_FISH_REMOTE_HOST:-}}"
POSTGRES_DSN="${MEMEC_POSTGRES_DSN:-postgres://memec:memec@127.0.0.1:5432/memec?sslmode=disable}"

# Fish 多地址：与 scripts/fish-upstreams.inc.sh / sync-fish-upstreams.sh 共用逻辑
# shellcheck source=fish-upstreams.inc.sh
source "${SCRIPT_DIR}/fish-upstreams.inc.sh"
fish_compute_fish_api_bases
fish_write_upstreams_env "${ROOT_DIR}"

# JWT：按要求与后端服务同处部署脚本，直接写死在 systemd Environment 中
MEMEC_JWT_SECRET="${MEMEC_JWT_SECRET:-memec-fixed-jwt-secret-2026}"

# 阿里云短信：AK/SK 不入库；从本机 ninelevel/.env 等写入 .runtime，供 systemd EnvironmentFile 读取
NINELEVEL_ROOT="${NINELEVEL_ROOT:-/root/ninelevel}"
NINELEVEL_ENV_FILE="${NINELEVEL_ENV_FILE:-${NINELEVEL_ROOT}/.env}"
ALIYUN_SMS_SIGN_NAME="${ALIYUN_SMS_SIGN_NAME:-南京千雄科技}"
ALIYUN_SMS_TEMPLATE_CODE="${ALIYUN_SMS_TEMPLATE_CODE:-SMS_332240891}"
ALIYUN_SMS_REGION_ID="${ALIYUN_SMS_REGION_ID:-cn-hangzhou}"

read_kv_from_file() {
  local f="$1" key="$2" line
  [[ -f "$f" ]] || return 1
  line="$(grep -m1 "^${key}=" "$f" 2>/dev/null | tr -d '\r' || true)"
  [[ -n "$line" ]] || return 1
  printf '%s' "${line#"${key}="}"
}

ALIYUN_SMS_ACCESS_KEY_ID=""
ALIYUN_SMS_ACCESS_KEY_SECRET=""
if [[ -f "${NINELEVEL_ENV_FILE}" ]]; then
  ALIYUN_SMS_ACCESS_KEY_ID="$(read_kv_from_file "${NINELEVEL_ENV_FILE}" ALIYUN_SMS_ACCESS_KEY_ID 2>/dev/null || true)"
  ALIYUN_SMS_ACCESS_KEY_SECRET="$(read_kv_from_file "${NINELEVEL_ENV_FILE}" ALIYUN_SMS_ACCESS_KEY_SECRET 2>/dev/null || true)"
fi

SMS_RUNTIME_ENV="${ROOT_DIR}/.runtime/aliyun-sms-from-ninelevel.env"
mkdir -p "${ROOT_DIR}/.runtime"
umask 077
{
  printf '%s\n' "ALIYUN_SMS_SIGN_NAME=${ALIYUN_SMS_SIGN_NAME}"
  printf '%s\n' "ALIYUN_SMS_TEMPLATE_CODE=${ALIYUN_SMS_TEMPLATE_CODE}"
  printf '%s\n' "ALIYUN_SMS_REGION_ID=${ALIYUN_SMS_REGION_ID}"
  [[ -n "${ALIYUN_SMS_ACCESS_KEY_ID}" ]] && printf '%s\n' "ALIYUN_SMS_ACCESS_KEY_ID=${ALIYUN_SMS_ACCESS_KEY_ID}"
  [[ -n "${ALIYUN_SMS_ACCESS_KEY_SECRET}" ]] && printf '%s\n' "ALIYUN_SMS_ACCESS_KEY_SECRET=${ALIYUN_SMS_ACCESS_KEY_SECRET}"
} > "${SMS_RUNTIME_ENV}.new"
mv -f "${SMS_RUNTIME_ENV}.new" "${SMS_RUNTIME_ENV}"
chmod 600 "${SMS_RUNTIME_ENV}"
if [[ -z "${ALIYUN_SMS_ACCESS_KEY_ID}" || -z "${ALIYUN_SMS_ACCESS_KEY_SECRET}" ]]; then
  echo "[WARN] 未从 ${NINELEVEL_ENV_FILE} 读到短信 AK/SK，请配置该文件或部署后维护 ${SMS_RUNTIME_ENV}"
else
  echo "[INFO] 已生成 ${SMS_RUNTIME_ENV}（密钥不入库）"
fi

mkdir -p "${LOG_DIR}"
mkdir -p "${ROOT_DIR}/data"
if [[ "${SKIP_FRONTEND_DEPLOY}" != "1" ]]; then
  mkdir -p "${FRONTEND_DIR}"

  # 构建并部署 React 主前端（frontend-main），若不存在则回退到纯 HTML
  if [[ -f "${FRONTEND_MAIN_DIR}/package.json" ]]; then
    cd "${FRONTEND_MAIN_DIR}"
    npm install
    npm run build
    # 清理旧文件（保留 admin/ 子目录），再复制新构建产物
    find "${FRONTEND_DIR}" -maxdepth 1 -mindepth 1 ! -name 'admin' -exec rm -rf {} +
    cp -rf "${FRONTEND_MAIN_DIR}/dist/"* "${FRONTEND_DIR}/"
  else
    cp -f "${FRONTEND_SRC_DIR}/index.html" "${FRONTEND_DIR}/index.html"
    if [[ -f "${FRONTEND_SRC_DIR}/admin.html" ]]; then
      cp -f "${FRONTEND_SRC_DIR}/admin.html" "${FRONTEND_DIR}/admin.html"
    fi
  fi

  # 构建并部署 React 管理后台（frontend-admin → /admin/）
  if [[ -f "${FRONTEND_ADMIN_DIR}/package.json" ]]; then
    cd "${FRONTEND_ADMIN_DIR}"
    npm install
    npm run build
    rm -rf "${FRONTEND_DIR}/admin"
    mkdir -p "${FRONTEND_DIR}/admin"
    cp -rf "${FRONTEND_ADMIN_DIR}/dist/"* "${FRONTEND_DIR}/admin/"
  fi
  chmod -R a+rX /var/www/meme-c
else
  echo "[INFO] MEMEC_SKIP_FRONTEND_DEPLOY=1, skip meme-c v1 frontend/admin deploy."
fi

cd "${BACKEND_DIR}"
go mod tidy
go build -o "${BIN_PATH}" .

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Meme C Gin Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${BACKEND_DIR}
Environment=MEMEC_BACKEND_LISTEN=127.0.0.1:8090
Environment=MEMEC_DATA_DIR=${ROOT_DIR}/data
EnvironmentFile=-${ROOT_DIR}/.runtime/fish-upstreams.env
Environment=MEMEC_POSTGRES_DSN=${POSTGRES_DSN}
Environment=MEMEC_JWT_SECRET=${MEMEC_JWT_SECRET}
Environment=TTS_QUEUE_SIZE=64
Environment=HTTP_TIMEOUT_SEC=300
Environment=DEFAULT_MAX_NEW_TOKENS=1024
EnvironmentFile=-${ROOT_DIR}/.runtime/aliyun-sms-from-ninelevel.env
EnvironmentFile=-${ROOT_DIR}/.env.sms.local
ExecStart=${BIN_PATH}
Restart=always
RestartSec=3
StandardOutput=append:${LOG_DIR}/backend.log
StandardError=append:${LOG_DIR}/backend.err.log

[Install]
WantedBy=multi-user.target
EOF

cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    server_name _;

    root ${FRONTEND_DIR};
    index index.html;

    access_log ${LOG_DIR}/nginx.access.log;
    error_log ${LOG_DIR}/nginx.error.log;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
    }
}
EOF

ln -sfn "${NGINX_SITE}" "${NGINX_SITE_ENABLED}"
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[OK] Meme C deployed."
echo "Frontend: http://127.0.0.1/"
echo "Backend health: http://127.0.0.1/api/health"
echo "Fish upstreams: ${FISH_API_BASES}"
echo "JWT secret source: systemd Environment (deploy.sh)"
echo "SMS runtime env: ${SMS_RUNTIME_ENV}"
echo "Logs:"
echo "  ${LOG_DIR}/backend.log"
echo "  ${LOG_DIR}/backend.err.log"
echo "  ${LOG_DIR}/nginx.access.log"
echo "  ${LOG_DIR}/nginx.error.log"
