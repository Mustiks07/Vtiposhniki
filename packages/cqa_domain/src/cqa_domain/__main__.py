"""CLI: `python -m cqa_domain rubric PATH [--check]` writes/checks the rubric snapshot."""

import argparse
from pathlib import Path

from .rubric import original_checklist_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m cqa_domain")
    sub = parser.add_subparsers(dest="command", required=True)
    rubric = sub.add_parser("rubric", help="write or check the original checklist JSON")
    rubric.add_argument("path", type=Path)
    rubric.add_argument("--check", action="store_true", help="fail if the file differs")
    args = parser.parse_args(argv)
    expected = original_checklist_json()
    if args.check:
        actual = args.path.read_text(encoding="utf-8") if args.path.exists() else ""
        if actual != expected:
            print(f"{args.path} is out of date; regenerate without --check")
            return 1
        print(f"{args.path} is up to date")
        return 0
    args.path.parent.mkdir(parents=True, exist_ok=True)
    args.path.write_text(expected, encoding="utf-8", newline="\n")
    print(f"wrote {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
