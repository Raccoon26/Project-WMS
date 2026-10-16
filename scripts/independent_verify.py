#!/usr/bin/env python3
"""Read-only main-owned verifier. Run only on isolated CI, never production.

Candidate code runs without write-token/secrets. Main's checks/tests/runners
are overlaid AFTER candidate tests, so removing assertions cannot authorize a PR.
Privileged merge code consumes reports only and never invokes this runner.
"""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import yaml

REQUIRED_COMMANDS = ('pnpm install --frozen-lockfile', 'pnpm audit', 'pnpm lint',
                     'pnpm typecheck', 'pnpm test:unit', 'pnpm test:integration',
                     'pnpm test:failures', 'pnpm build', 'pnpm test:e2e')
ALLOWED_WRITES = {'auto-merge.yml': {'contents', 'pull-requests'}}


def preflight(root, baseline):
    errors = []
    workflows = root / '.github/workflows'
    for file in sorted(workflows.glob('*.y*ml')):
        raw = file.read_text()
        w = yaml.safe_load(raw)
        if not isinstance(w, dict):
            errors.append(file.name + ': malformed workflow')
            continue
        contexts = [(w.get('permissions'), w)]
        contexts += [(j.get('permissions', w.get('permissions')), j) for j in w.get('jobs', {}).values()]
        for permissions, job in contexts:
            if not isinstance(permissions, dict):
                errors.append(file.name + ': explicit least-privilege permissions required')
                continue
            writes = {k for k, v in permissions.items() if v == 'write'}
            if writes - ALLOWED_WRITES.get(file.name, set()):
                errors.append(file.name + ': unauthorized permission escalation')
            if writes:
                for step in job.get('steps', []):
                    if 'uses' in step and not step['uses'].startswith('actions/checkout@'):
                        errors.append(file.name + ': unverified privileged action')
                    if step.get('uses', '').startswith('actions/checkout@'):
                        options = step.get('with', {})
                        if options.get('ref') not in ('main', '${{ github.event.repository.default_branch }}') or options.get('persist-credentials') is not False:
                            errors.append(file.name + ': privileged PR checkout/credential persistence prohibited')
                    if 'run' in step:
                        permitted = 'set -euo pipefail\npython3 scripts/auto_merge.py --repo "$WMS_REPO" --run-id "$RUN_ID" --pr-number "$PR_NUMBER"'
                        if step['run'].strip() != permitted:
                            errors.append(file.name + ': privileged command contract changed')
        for action in re.findall(r'uses:\s*([^\s#]+)', raw):
            if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[a-f0-9]{40}', action):
                errors.append(file.name + ': action must use a full immutable commit SHA')
        if 'secrets.' in raw or 'permissions: write-all' in raw:
            errors.append(file.name + ': secret/write-all access prohibited')
    ci = workflows / 'pr-ci.yml'
    if not ci.exists() or any(c not in ci.read_text() for c in REQUIRED_COMMANDS):
        errors.append('Required candidate CI commands removed')
    for name in ('independent-verification.yml', 'auto-merge.yml', 'pr-policy.yml'):
        if not (workflows/name).exists():
            errors.append('Required workflow removed: ' + name)
    # A candidate may add/strengthen orchestration, but cannot silently delete
    # test categories. Main's runner below is independent of these scripts.
    for manifest in baseline.glob('**/package.json'):
        if any(part in {'node_modules', '.git', '.trusted-base'} for part in manifest.relative_to(baseline).parts):
            continue
        relative = manifest.relative_to(baseline)
        target = root/relative
        if not target.exists():
            errors.append('Required package removed: ' + str(relative))
            continue
        scripts = json.loads(target.read_text()).get('scripts', {})
        expected = json.loads(manifest.read_text()).get('scripts', {})
        for key in ('lint', 'typecheck', 'build', 'test:unit', 'test:integration', 'test:failures', 'test:e2e'):
            if key in expected and (not isinstance(scripts.get(key), str) or not scripts[key].strip()):
                errors.append('Required script removed: ' + str(relative) + ':' + key)
    registry = baseline/'scripts/verification-baseline.json'
    candidate = root/'scripts/verification-baseline.json'
    if registry.exists():
        old = json.loads(registry.read_text())
        new = json.loads(candidate.read_text()) if candidate.exists() else {}
        for name, value in old.items():
            if name == 'package-scripts': continue
            if name not in new or value not in new[name]:
                errors.append('Established verification baseline removed/weakened: ' + name)
    return errors


def execute(root, baseline):
    def run(*args):
        subprocess.run(args, cwd=root, check=True)
    errors = preflight(root, baseline)
    if errors:
        raise ValueError('; '.join(errors))
    run('python3', str(baseline/'scripts/run_policy_tests.py'))
    # Main owns baseline tests and invocation; candidate cannot delete its proof.
    for source in (baseline/'scripts').glob('test_*.py'):
        shutil.copyfile(source, root/'scripts'/source.name)
    run('python3', str(baseline/'scripts/run_policy_tests.py'))
    run('python3', str(baseline/'scripts/check_public_files.py'))
    run('python3', '-c', "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from validate_docs import validate; errors=validate(Path.cwd()); print('\\n'.join(errors) or 'PASS: trusted validator checked candidate docs'); raise SystemExit(bool(errors))", str(baseline/'scripts'))
    if (root/'package.json').exists():
        data = json.loads((baseline/'scripts/verification-baseline.json').read_text())
        for name, text in data.items():
            if name == 'package-scripts': continue
            target = root/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
        run('pnpm', 'install', '--frozen-lockfile')
        for name, scripts in data['package-scripts'].items():
            target = root/name
            manifest = json.loads(target.read_text())
            manifest['scripts'] = manifest.get('scripts', {}) | scripts
            target.write_text(json.dumps(manifest, indent=2))
        run('pnpm', 'audit', '--audit-level=high')
        for command in ('check:boundaries', 'lint', 'typecheck', 'db:migrate:test',
                        'test:unit', 'test:integration', 'test:failures', 'build', 'test:e2e'):
            run('pnpm', command)
    run('python3', str(baseline/'scripts/ci_evidence.py'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    if args.preflight_only:
        errors = preflight(args.root.resolve(), args.base.resolve())
        if errors: raise SystemExit('\n'.join(errors))
    else:
        execute(args.root.resolve(), args.base.resolve())
