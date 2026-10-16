#!/usr/bin/env python3
"""Validate required entrypoints. Test runners must enforce nonzero test counts."""
import json
import subprocess
import sys
from pathlib import Path

REQUIRED = ('lint', 'typecheck', 'build', 'test:unit', 'test:integration', 'test:failures')


def inspect(root, paths):
    needs = any('inventory' in p.lower() or 'ledger' in p.lower() for p in paths) or (root / 'docs/dev-reports/DEV-04.md').exists()
    # Docs alone do not constitute an application.
    source = any(Path(p).suffix in {'.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'} for p in paths)
    package = root / 'package.json'
    if not package.exists():
        if source:
            raise ValueError('Application source exists without root package.json')
        return False
    if not (root / 'pnpm-lock.yaml').exists():
        raise ValueError('Missing pnpm-lock.yaml')
    scripts = json.loads(package.read_text()).get('scripts', {})
    for name in REQUIRED + (('test:invariants',) if needs else ()):
        if not isinstance(scripts.get(name), str) or not scripts[name].strip():
            raise ValueError('Missing required script: ' + name)
    return needs


if __name__ == '__main__':
    root = Path.cwd()
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).decode().split('\0')
    needs = inspect(root, paths)
    if '--needs-invariants' in sys.argv:
        raise SystemExit(0 if needs else 1)
    print('PASS: application entrypoint policy (no app at DEV00; app tests are not executed)'
          if not (root / 'package.json').exists() else 'PASS: application entrypoints exist')
