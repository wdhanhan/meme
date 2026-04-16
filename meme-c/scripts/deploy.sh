#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_SRC_DIR="${ROOT_DIR}/frontend"
FRONTEND_MAIN_DIR="${ROOT_DIR}/frontend-main"
FRONTEND_ADMIN_DIR="${ROOT_DIR}/frontend-admin"
FRONTEND_DIR="/var/www/meme-c/frontend"
LOG_DIR="${ROOT_DIR}/logs"
BIN_PATH="${BACKEND_DIR}/meme-c-backend"
SERVICE_NAME="meme-c-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_SITE="/etc/nginx/sites-available/meme-c.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/meme-c.conf"
FISH_BASE_PORT="${FISH_BASE_PORT:-8080}"
GPU_COUNT="${FISH_GPU_COUNT:-}"
POSTGRES_DSN="${MEMEC_POSTGRES_DSN:-postgres://memec:memec@127.0.0.1:5432/memec?sslmode=disable}"

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

FISH_API_BASES=""
for ((GPU_ID=0; GPU_ID<GPU_COUNT; GPU_ID++)); do
  PORT=$((FISH_BASE_PORT + GPU_ID))
  if [[ -z "${FISH_API_BASES}" ]]; then
    FISH_API_BASES="http://127.0.0.1:${PORT}"
  else
    FISH_API_BASES="${FISH_API_BASES},http://127.0.0.1:${PORT}"
  fi
done

mkdir -p "${LOG_DIR}"
mkdir -p "${ROOT_DIR}/data"
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
Environment=FISH_API_BASES=${FISH_API_BASES}
Environment=MEMEC_POSTGRES_DSN=${POSTGRES_DSN}
Environment=TTS_QUEUE_SIZE=64
Environment=HTTP_TIMEOUT_SEC=300
Environment=DEFAULT_MAX_NEW_TOKENS=1024
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
echo "Logs:"
echo "  ${LOG_DIR}/backend.log"
echo "  ${LOG_DIR}/backend.err.log"
echo "  ${LOG_DIR}/nginx.access.log"
echo "  ${LOG_DIR}/nginx.error.log"
