"""One foundation acceptance command, with each failed step stopping the run."""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if npm is None:
        raise SystemExit("npm is not installed")
    commands = [
        [sys.executable, "-c", "import cqa_contracts, cqa_domain, cqa_ai, cqa_api"],
        [sys.executable, "scripts/generate_contracts.py", "--check"],
        [sys.executable, "-m", "ruff", "check", "."],
        [sys.executable, "-m", "mypy"],
        [sys.executable, "-m", "pytest"],
        [npm, "run", "typecheck"],
        [npm, "test"],
        [npm, "run", "build"],
        [npm, "run", "e2e"],
    ]
    for command in commands:
        print("RUN", " ".join(command), flush=True)
        subprocess.run(command, cwd=ROOT, check=True)
    print("Foundation checks passed. Business application acceptance has NOT run.")


if __name__ == "__main__":
    main()
