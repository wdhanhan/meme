# meme 工作区（中文说明）

这是一个统一工作区，包含三个项目：

- `meme`
- `meme-c`
- `meme-front-c-v2`

## 当前已接入能力

- C 端前端（`meme-front-c-v2`）已接入真实接口（不再是纯静态页）
- 手机短信验证码登录/注册
- JWT 鉴权（Bearer Token）
- PostgreSQL 用户表自动 migration
- 音色样本上传与多段 TTS 合成

## JWT 配置

`meme-c` 后端会在登录/注册成功后签发 JWT（HS256）。

关键环境变量：

- `MEMEC_JWT_SECRET`：JWT 签名密钥（必填）
- `MEMEC_JWT_EXPIRE_HOURS`：过期小时数（默认 `336`，即 14 天）

受保护接口（需要 `Authorization: Bearer <token>`）：

- `/api/tts`
- `/api/tts/stream`
- `/api/tts/multi-segment-stream`
- `/api/references/list`
- `/api/references/add`
- `/api/auth/me`

## 短信验证码配置（阿里云）

沿用 ninelevel 同款环境变量：

- `ALIYUN_SMS_ACCESS_KEY_ID`
- `ALIYUN_SMS_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE`
- `ALIYUN_SMS_REGION_ID`（默认可用 `cn-hangzhou`）

可选：

- `MEMEC_SMS_HTTP_TIMEOUT_SEC`（默认 `8` 秒）

## PostgreSQL

项目内已提供 Compose 文件：

- `meme-c/docker-compose.pg.yml`

启动：

```bash
cd /root/meme/meme-c
docker compose -f docker-compose.pg.yml up -d
```

后端启动后会自动执行 migration，创建：

- `users`
- `user_sms_codes`

## 常用启动示例

### 1) 启动 Postgres

```bash
cd /root/meme/meme-c
docker compose -f docker-compose.pg.yml up -d
```

### 2) 启动/重启 meme-c 后端（示例）

```bash
MEMEC_JWT_SECRET="your-secret" \
MEMEC_JWT_EXPIRE_HOURS="336" \
MEMEC_POSTGRES_DSN="postgres://memec:memec@127.0.0.1:5432/memec?sslmode=disable" \
ALIYUN_SMS_ACCESS_KEY_ID="xxx" \
ALIYUN_SMS_ACCESS_KEY_SECRET="xxx" \
ALIYUN_SMS_SIGN_NAME="南京千雄科技" \
ALIYUN_SMS_TEMPLATE_CODE="SMS_332240891" \
ALIYUN_SMS_REGION_ID="cn-hangzhou" \
bash /root/meme/meme-c/start
```

### 3) 启动前端

```bash
cd /root/meme/meme-front-c-v2
npm run dev
```

