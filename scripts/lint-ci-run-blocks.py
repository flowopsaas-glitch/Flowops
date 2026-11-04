#!/usr/bin/env python3
"""
Lint the shell inside .github/workflows/*.yml.

GitHub validates the YAML but not the bash inside a `run:` block. A broken
script there is invisible until a workflow burns a full run — and on a private
repo those runs cost Actions minutes.

This exists because a real edit shipped a doubled backslash at the end of a
line: `\\\\` is an escaped backslash, not a line continuation, so the following
line began with `||` and became its own command. `bash -n` catches that in
milliseconds.

Usage:
    python3 scripts/lint-ci-run-blocks.py            # all workflows
    python3 scripts/lint-ci-run-blocks.py file.yml … # specific files

Exit code 0 = every run block is valid shell.
"""
from __future__ import annotations

import glob
import os
import subprocess
import sys
import tempfile

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: python3 -m pip install pyyaml")


def blocks(doc: dict):
    """Yield (job_name, step_name, script) for every `run:` in a workflow."""
    for job_name, job in (doc.get("jobs") or {}).items():
        for step in job.get("steps") or []:
            script = step.get("run")
            if script:
                yield job_name, step.get("name") or step.get("uses") or "(unnamed)", script


def lint(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        try:
            doc = yaml.safe_load(fh)
        except yaml.YAMLError as err:
            print(f"{path}: YAML does not parse\n  {err}", file=sys.stderr)
            return 1

    if not isinstance(doc, dict):
        return 0

    failures = 0
    checked = 0

    for job_name, step_name, script in blocks(doc):
        checked += 1
        # `bash -n` parses without executing: the same check GitHub's runner
        # will do the moment it starts the step.
        with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8") as fh:
            fh.write(script)
            tmp = fh.name
        try:
            proc = subprocess.run(["bash", "-n", tmp], capture_output=True, text=True)
        finally:
            os.unlink(tmp)

        if proc.returncode != 0:
            failures += 1
            print(f"{path}: job '{job_name}' step '{step_name}'", file=sys.stderr)
            for line in proc.stderr.strip().splitlines():
                print(f"  {line}", file=sys.stderr)

    print(f"{path}: {checked} run block(s), {failures} invalid")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    targets = argv[1:] or sorted(glob.glob(os.path.join(".github", "workflows", "*.yml")))
    if not targets:
        sys.exit("No workflow files found — run from the repository root.")

    return max(lint(path) for path in targets)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
