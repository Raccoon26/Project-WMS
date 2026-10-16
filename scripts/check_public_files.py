#!/usr/bin/env python3
"""Local safety net, not a guarantee of absence of arbitrary PII or secrets."""
import re
import subprocess
from pathlib import Path
from pr_policy import forbidden

PATTERNS = (
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b'),
    re.compile(rb'\bAKIA[0-9A-Z]{16}\b'),
    re.compile(rb'\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b'),
    re.compile(rb'(?i)(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[=:]\s*[\'\"][A-Za-z0-9_+/=-]{24,}[\'\"]'),
)


def suspicious(data):
    return any(p.search(data) for p in PATTERNS)


def scan(root, paths):
    errors = []
    for name in paths:
        p = root / name
        if forbidden(name):
            errors.append(name + ': prohibited file')
        if p.is_symlink():
            errors.append(name + ': symlink requires manual inspection')
        elif p.is_file():
            if p.stat().st_size > 2 * 1024 * 1024:
                errors.append(name + ': oversized file requires manual inspection')
            elif suspicious(p.read_bytes()):
                errors.append(name + ': possible secret (value redacted)')
    return errors


def main():
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
    errors = scan(root, sorted(set(filter(None, paths))))
    if errors:
        raise SystemExit('\n'.join(errors))
    print('PASS: prohibited paths and known secret patterns; PII/contracts still need human review')


if __name__ == '__main__':
    main()
