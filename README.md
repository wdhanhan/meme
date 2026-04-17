# meme-git-workspace

Unified workspace that contains three projects:

- `meme`
- `meme-c`
- `meme-front-c-v2`

This folder is prepared for monorepo-style Git management.

## Path Sensitivity (Important)

Most scripts in this workspace are path-relative and can be moved.
However, **two parts are intentionally kept unchanged and still path-sensitive**:

1. `meme` fish systemd services (`fish-s2-pro-gpu*.service`) with absolute checkpoint/workdir paths.
2. `meme-c` deploy-generated systemd/nginx config with absolute paths (`WorkingDirectory`, `MEMEC_DATA_DIR`, etc.).

So after moving this folder to a new location:

- `front` can usually start directly.
- `meme` and `meme-c` may require service re-generation/re-deploy in the new path.
- The root `start` script will print a warning for this case.

## Startup Script

Use the root `start` script to start all services or selected targets.

```bash
cd /mnt/data/root/meme-git-workspace
./start
```

By default, it starts:

1. `meme` (via `meme/start`)
2. `meme-c` (via `meme-c/start`)
3. `meme-front-c-v2` dev server (default `0.0.0.0:3001`)

## Options

```bash
./start --help
```

Supported options:

- `--only meme,meme-c,front`
- `--skip meme,meme-c,front`
- `--front-port <port>` (default: `3001`)
- `--front-host <host>` (default: `0.0.0.0`)
- `--no-front-install` (skip `npm install`)
- `--restart-front` (restart frontend if already running)
- `--assume-moved` (skip path-sensitivity warning for `meme`/`meme-c`)

## Examples

Start all:

```bash
./start
```

Start only backend services:

```bash
./start --only meme,meme-c
```

Start only frontend on custom port:

```bash
./start --only front --front-port 3100
```

Skip frontend:

```bash
./start --skip front
```

## Frontend Runtime Files

Frontend PID/logs are stored in:

- PID: `.runtime/meme-front-c-v2.pid`
- Log: `.runtime/logs/meme-front-c-v2.log`

## Git Notes

A root `.gitignore` is included to avoid committing dependencies/build/runtime artifacts.
You can initialize and commit from this root directory.


JWT secret 已加载，refs 索引也已自动同步。之前的问题是手动     
  nohup 启动时没有加载 .runtime/memec-jwt.env，以后用 systemctl restart 
  meme-c-backend 重启即可。    