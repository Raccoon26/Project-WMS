#!/usr/bin/env python3
"""Check local documentation references and structural trace coverage."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ('PROJECT_STATUS.md REQUIREMENTS.md ARCHITECTURE.md DATA_MODEL.md DEV_PROGRESS.md '
            'TEST_PLAN.md SECURITY.md BACKUP_RECOVERY.md DEPLOYMENT.md OPERATIONS.md INTEGRATIONS.md '
            'RELEASE_CHECKLIST.md docs/PROJECT_SCOPE.md docs/SAFETY_GATES.md docs/GITHUB_WORKFLOW.md '
            'docs/DECISIONS.md docs/RISK_REGISTER.md docs/REQUIREMENTS_TRACEABILITY.md docs/dev-reports/DEV-00.md').split()


def validate(root=ROOT):
    errors = []
    for name in REQUIRED:
        if not (root / name).is_file():
            errors.append('Missing ' + name)
    for p in root.rglob('*.md'):
        if '.git' in p.parts or 'node_modules' in p.parts:
            continue
        for link in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', p.read_text()):
            if '://' in link or link.startswith('#') or link.startswith('mailto:'):
                continue
            target = (p.parent / link.split('#')[0]).resolve()
            if not target.is_relative_to(root.resolve()) or not target.exists():
                errors.append(f'{p.relative_to(root)}: broken local link {link}')
    trace = root / 'docs/REQUIREMENTS_TRACEABILITY.md'
    if trace.exists():
        data = trace.read_text()
        for i in range(1, 26):
            if not re.search(rf'\| R{i:02} \|', data):
                errors.append(f'Missing trace R{i:02}')
        for i in range(30):
            if not re.search(rf'\| U{i:02} \|', data):
                errors.append(f'Missing instruction section U{i:02}')
    plan = root / 'TEST_PLAN.md'
    if plan.exists():
        data = plan.read_text()
        for i in range(1, 31):
            if len(re.findall(rf'\| F{i:02} \|', data)) != 1:
                errors.append(f'Missing or duplicated failure scenario F{i:02}')
    roadmap = root / 'DEV_PROGRESS.md'
    if roadmap.exists():
        for i in range(19):
            if f'| DEV-{i:02} |' not in roadmap.read_text():
                errors.append(f'Missing roadmap DEV-{i:02}')
    return errors


if __name__ == '__main__':
    errors = validate()
    if errors:
        raise SystemExit('\n'.join(errors))
    print('PASS: local links, required documents, 25 requirement groups, 30 instruction sections/failures, DEV00–18')
