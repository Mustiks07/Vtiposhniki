"""Generate all artifacts from canonical Python contracts; --check never writes."""

import argparse
import difflib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from cqa_contracts import hash_inputs, http_models, models
from cqa_contracts.operations import create_contract_app
from cqa_contracts.submission import SUBMISSION_MODELS, OfficialResults
from pydantic.json_schema import models_json_schema

ROOT = Path(__file__).resolve().parents[1]


def model_registry():
    registry = {}
    for module in (models, http_models, hash_inputs):
        for value in vars(module).values():
            if isinstance(value, type) and issubclass(value, models.DTO):
                registry[value.__name__] = value
    registry.update({model.__name__: model for model in SUBMISSION_MODELS})
    return dict(sorted(registry.items()))


def generate(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    registry = model_registry()
    refs, schema = models_json_schema([(value, "validation") for value in registry.values()])
    schema.update(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "CQAContracts",
            "type": "object",
            "additionalProperties": False,
            "properties": {name: refs[(value, "validation")] for name, value in registry.items()},
            "required": list(registry),
        }
    )
    for name, value in {
        "json-schema.json": schema,
        "openapi.json": create_contract_app().openapi(),
        "organizer-results.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            **OfficialResults.model_json_schema(),
        },
    }.items():
        (output / name).write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    node = shutil.which("node")
    if node is None:
        raise SystemExit("Node is required; install the version in .node-version")
    subprocess.run(
        [node, str(ROOT / "scripts/generate_types.mjs"), str(output)], check=True, cwd=ROOT
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        generate(ROOT / "contracts")
        return
    with tempfile.TemporaryDirectory(prefix="cqa-contracts-") as temporary:
        target = Path(temporary)
        generate(target)
        drift = []
        for generated in target.rglob("*"):
            if not generated.is_file():
                continue
            relative = generated.relative_to(target)
            existing = ROOT / "contracts" / relative
            if not existing.exists() or existing.read_bytes() != generated.read_bytes():
                drift.append(str(relative))
                if existing.exists():
                    print(
                        "".join(
                            list(
                                difflib.unified_diff(
                                    existing.read_text(encoding="utf-8").splitlines(True),
                                    generated.read_text(encoding="utf-8").splitlines(True),
                                )
                            )[:30]
                        )
                    )
        if drift:
            raise SystemExit("Generated contract drift: " + ", ".join(drift))
    print("Contract generation is reproducible; no drift")


if __name__ == "__main__":
    main()
