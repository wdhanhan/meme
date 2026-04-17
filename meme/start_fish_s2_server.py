#!/usr/bin/env python3
"""
Start Fish Audio S2 Pro local API server.

This script will:
1) Clone fish-speech repository if missing.
2) Create a Python venv if missing.
3) Install fish-speech dependencies.
4) Link local model directory into fish-speech checkpoints.
5) Start API server.

Default model source:
  /root/fishaudio-s2-pro
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print(f"[RUN] {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


def detect_gpu_count() -> int:
    """Match bash: nvidia-smi -L | wc -l"""
    try:
        r = subprocess.run(
            ["nvidia-smi", "-L"],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        return 0
    if r.returncode != 0:
        return 0
    return len([ln for ln in r.stdout.splitlines() if ln.strip()])


def parse_listen_host_port(listen: str) -> tuple[str, int]:
    """Parse host:port (IPv4 / simple hostnames)."""
    if ":" not in listen:
        raise ValueError(f"invalid --listen (need host:port): {listen!r}")
    host, port_s = listen.rsplit(":", 1)
    return host, int(port_s)


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    parser = argparse.ArgumentParser(description="Start Fish Audio S2 Pro API server")
    parser.add_argument(
        "--workspace",
        type=Path,
        default=script_dir,
        help="Workspace directory used for fish-speech repo",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=root_dir / "fishaudio-s2-pro",
        help="Local model directory (downloaded S2 Pro files)",
    )
    parser.add_argument(
        "--venv",
        type=Path,
        default=root_dir / ".venvs" / "fishspeech",
        help="Python virtual environment path",
    )
    parser.add_argument(
        "--listen",
        type=str,
        default="0.0.0.0:8080",
        help="Server listen address (multi-GPU: base port, e.g. 8080 -> 8080,8081,...)",
    )
    parser.add_argument(
        "--multi-gpu",
        action="store_true",
        help="Start one model process per GPU (CUDA_VISIBLE_DEVICES + port per card)",
    )
    parser.add_argument(
        "--max-gpus",
        type=int,
        default=0,
        metavar="N",
        help="With --multi-gpu: use at most N GPUs (0 = all detected)",
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip dependency installation step",
    )
    return parser.parse_args()


def ensure_repo(workspace: Path) -> Path:
    repo_dir = workspace / "fish-speech"
    if repo_dir.exists():
        print(f"[INFO] repo exists: {repo_dir}")
        return repo_dir

    workspace.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "https://github.com/fishaudio/fish-speech.git", str(repo_dir)])
    return repo_dir


def ensure_venv(venv_path: Path) -> tuple[Path, Path]:
    if not venv_path.exists():
        run([sys.executable, "-m", "venv", str(venv_path)])

    py = venv_path / "bin" / "python"
    pip = venv_path / "bin" / "pip"
    if not py.exists() or not pip.exists():
        raise RuntimeError(f"venv broken: {venv_path}")
    return py, pip


def ensure_checkpoints_link(repo_dir: Path, model_dir: Path) -> Path:
    if not model_dir.exists():
        raise FileNotFoundError(f"model directory not found: {model_dir}")

    checkpoints = repo_dir / "checkpoints"
    checkpoints.mkdir(parents=True, exist_ok=True)
    target = checkpoints / "s2-pro"

    if target.is_symlink() or target.exists():
        # Keep existing path if it already points to the right directory.
        if target.resolve() == model_dir.resolve():
            return target
        # Replace mismatched path.
        if target.is_dir() and not target.is_symlink():
            raise RuntimeError(
                f"{target} exists and is a real directory; remove/move it manually first."
            )
        target.unlink()

    target.symlink_to(model_dir)
    return target


def build_server_cmd(py: Path, ckpt_dir: Path, listen: str, *, production_flags: bool) -> list[str]:
    cmd = [
        str(py),
        "tools/api_server.py",
        "--llama-checkpoint-path",
        str(ckpt_dir),
        "--decoder-checkpoint-path",
        str(ckpt_dir / "codec.pth"),
        "--listen",
        listen,
    ]
    if production_flags:
        cmd.extend(["--device", "cuda", "--compile", "--workers", "1"])
    return cmd


def run_multi_gpu(
    py: Path,
    repo_dir: Path,
    ckpt_dir: Path,
    base_listen: str,
    gpu_count: int,
) -> int:
    host, base_port = parse_listen_host_port(base_listen)
    procs: list[subprocess.Popen[bytes]] = []

    def terminate_all() -> None:
        for p in procs:
            if p.poll() is None:
                p.terminate()

    def handle_signal(signum: int, frame: object | None) -> None:  # noqa: ARG001
        terminate_all()
        sys.exit(128 + signum if signum > 0 else 0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    for i in range(gpu_count):
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        env["CUDA_VISIBLE_DEVICES"] = str(i)
        listen = f"{host}:{base_port + i}"
        cmd = build_server_cmd(py, ckpt_dir, listen, production_flags=True)
        print(f"[INFO] GPU {i}: CUDA_VISIBLE_DEVICES={i} -> {listen}")
        print(f"[RUN] {' '.join(cmd)}")
        procs.append(
            subprocess.Popen(
                cmd,
                cwd=str(repo_dir),
                env=env,
            )
        )

    while True:
        try:
            pid, status = os.waitpid(-1, 0)
        except ChildProcessError:
            break
        if os.WIFEXITED(status):
            rc = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            rc = 128 + os.WTERMSIG(status)
        else:
            rc = 1
        if rc != 0:
            print(f"[ERROR] child pid={pid} exited with {rc}", file=sys.stderr)
            terminate_all()
            return rc if rc < 256 else 1
    return 0


def main() -> int:
    args = parse_args()

    repo_dir = ensure_repo(args.workspace)
    py, pip = ensure_venv(args.venv)

    if not args.skip_install:
        run([str(pip), "install", "-U", "pip", "setuptools", "wheel"])
        run([str(pip), "install", "-e", "."], cwd=repo_dir)

    ckpt_dir = ensure_checkpoints_link(repo_dir, args.model_dir)

    print(f"[INFO] repo: {repo_dir}")
    print(f"[INFO] model: {ckpt_dir}")

    if args.multi_gpu:
        n = detect_gpu_count()
        if n < 1:
            print("[ERROR] No NVIDIA GPU detected (nvidia-smi -L).", file=sys.stderr)
            return 1
        if args.max_gpus and args.max_gpus > 0:
            n = min(n, args.max_gpus)
        print(f"[INFO] starting {n} server process(es) (one model per GPU)")
        return run_multi_gpu(py, repo_dir, ckpt_dir, args.listen, n)

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")

    cmd = build_server_cmd(py, ckpt_dir, args.listen, production_flags=False)

    print(f"[INFO] starting server at: {args.listen}")
    run(cmd, cwd=repo_dir, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
