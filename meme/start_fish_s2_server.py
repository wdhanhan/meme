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
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print(f"[RUN] {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


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
        help="Server listen address",
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


def main() -> int:
    args = parse_args()

    repo_dir = ensure_repo(args.workspace)
    py, pip = ensure_venv(args.venv)

    if not args.skip_install:
        run([str(pip), "install", "-U", "pip", "setuptools", "wheel"])
        run([str(pip), "install", "-e", "."], cwd=repo_dir)

    ckpt_dir = ensure_checkpoints_link(repo_dir, args.model_dir)

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")

    cmd = [
        str(py),
        "tools/api_server.py",
        "--llama-checkpoint-path",
        str(ckpt_dir),
        "--decoder-checkpoint-path",
        str(ckpt_dir / "codec.pth"),
        "--listen",
        args.listen,
    ]

    print(f"[INFO] repo: {repo_dir}")
    print(f"[INFO] model: {ckpt_dir}")
    print(f"[INFO] starting server at: {args.listen}")
    run(cmd, cwd=repo_dir, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
