#!/usr/bin/env python3
"""
Minimal launcher for Fish Audio S2 Pro from a local model directory.

Usage:
  python run_fish_s2_pro.py \
    --model-dir /root/fishaudio-s2-pro \
    --prompt "你好，今天过得怎么样？"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Fish Audio S2 Pro locally")
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path("/root/fishaudio-s2-pro"),
        help="Local path of fishaudio/s2-pro model files",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default="你好，请简单介绍一下你自己。",
        help="Input prompt for a minimal generation test",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=64,
        help="Maximum generated tokens for test output",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if not args.model_dir.exists():
        print(f"[ERROR] model dir not found: {args.model_dir}", file=sys.stderr)
        return 1

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except Exception as exc:
        print("[ERROR] missing dependencies.", file=sys.stderr)
        print("Please install with:", file=sys.stderr)
        print("  pip install torch transformers accelerate sentencepiece", file=sys.stderr)
        print(f"Detail: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32

    print(f"[INFO] loading tokenizer from: {args.model_dir}")
    tokenizer = AutoTokenizer.from_pretrained(
        str(args.model_dir),
        trust_remote_code=True,
    )

    print(f"[INFO] loading model on {device} (dtype={dtype})")
    model = AutoModelForCausalLM.from_pretrained(
        str(args.model_dir),
        trust_remote_code=True,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    ).to(device)
    model.eval()

    print("[INFO] model loaded successfully")

    # Minimal text generation smoke test to verify the model can run.
    inputs = tokenizer(args.prompt, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=args.max_new_tokens,
            do_sample=True,
            temperature=0.8,
            top_p=0.95,
        )

    text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    print("\n===== Generation Result =====")
    print(text)
    print("===== End =====")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
