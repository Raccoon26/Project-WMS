"""Main-owned change classification and non-executable CI evidence contracts.

All paths may auto-merge after independent main-owned verification.
Control paths require stronger independent contracts, not human approval.
"""
import re
from pr_policy import validate

PROFILES = {
    'migration': (
        'real PostgreSQL migrations are atomic, repeatable and schema checked',
        'failed migration rolls back both schema and history',
        'edited migration history is rejected rather than silently replayed',
    ),
    'inventory': ('inventory: concurrency', 'inventory: invariants', 'inventory: idempotency', 'inventory: rollback', 'inventory: state and evidence'),
    'auth': ('auth: privilege escalation', 'auth: session', 'auth: CSRF'),
    'email': ('email: timeout', 'email: duplicate suppression', 'email: unknown delivery hold'),
    'approval': ('approval: identity and expiry', 'approval: duplicate and changed payload'),
    'money': ('money: exact arithmetic', 'money: duplicate payment prevention'),
    'recovery': ('recovery: actual restore', 'recovery: stale job quarantine'),
    'integration': ('integration: timeout and rate limit', 'integration: duplicate and stale data', 'integration: unknown outcome'),
}
# Main owns the required case catalog. Future DEV must implement these real
# cases; catalog membership does not imply any business test has run.
BUSINESS = {
    'inventory': r'inventory|ledger|stock|reservation|inbound|outbound|shipment|idempot|outbox|transfer',
    'auth': r'auth|session|csrf|permission|rbac',
    'email': r'email|mail|warehouse.?adapter',
    'approval': r'telegram|approval',
    'money': r'money|payment|procure|purchase|currency|replenish',
    'recovery': r'backup|restore|recovery',
    'integration': r'amazon|rakuten|integration',
}
CONTROL_ROOTS = ('scripts/', '.github/', 'infra/', '.husky/')
CONTROL_NAMES = {
    'AGENTS.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    '.npmrc', '.node-version', '.gitignore', '.env.example',
}
COMPLETE_KEYS = {'implementation', 'selfReview', 'regression', 'security', 'requirementsAudit', 'documentation'}


def classify(paths, added_tests=()):
    controls, profiles, unknown = [], set(), []
    for p in paths:
        name = p.rsplit('/', 1)[-1]
        if (p.startswith(CONTROL_ROOTS) or p in CONTROL_NAMES or name == 'package.json'
                or re.search(r'(?:config\.|tsconfig|Dockerfile|compose\.|deploy)', p, re.I)
                or (p.startswith('tests/') and p not in added_tests)):
            controls.append(p)
            continue
        if p.endswith('.md') or p.startswith('docs/'):
            continue
        if p.startswith('tests/') and p in added_tests:
            continue
        if not p.startswith(('apps/', 'packages/')):
            unknown.append(p)
            continue
        if p.startswith('packages/db/'):
            profiles.add('migration')
        for profile, pattern in BUSINESS.items():
            if re.search(pattern, p, re.I):
                profiles.add(profile)
    return {'tier': 'C' if controls or unknown else 'B' if profiles else 'A',
            'controls': controls, 'profiles': sorted(profiles), 'unknown': unknown}


def metadata_errors(pr, paths, repo):
    # Legacy native-protection helper retains its stricter API. Here we use only
    # its structural checks; waiting/draft decisions are explicitly separate.
    errors = validate(pr['head']['ref'], pr['title'], paths, set(),
                      (pr['head'].get('repo') or {}).get('full_name'), repo,
                      draft=False, approved=True)
    if pr['base']['ref'] != 'main' or pr['state'] != 'open':
        errors.append('Wrong base or closed PR')
    return errors


def waiting(pr, classification):
    reasons = []
    if pr.get('draft'):
        reasons.append('Draft: work completion not yet verified')
    missing = set(classification['profiles']) - PROFILES.keys()
    if missing:
        reasons.append('Safety suites not implemented: ' + ', '.join(sorted(missing)))
    if any(x.get('name') in {'hold', 'do-not-merge', 'manual-review', 'security-review'}
           for x in pr.get('labels', [])):
        reasons.append('Explicit manual hold')
    return reasons


def verify_evidence(e, head, base, number, profiles):
    errors = []
    if (e.get('version') != 1 or e.get('head') != head or e.get('base') != base
            or e.get('pr') != number):
        errors.append('Evidence identity/head/base mismatch')
    suites = e.get('suites', {})
    for name in (('policy',) if e.get('application') is False else ('unit', 'integration', 'fault', 'e2e')):
        suite = suites.get(name, {})
        count = suite.get('passed')
        if (type(count) is not int or count <= 0 or suite.get('failed') != 0
                or suite.get('skipped') != 0):
            errors.append('Missing/zero/failed/skipped required tests: ' + name)
    for profile in profiles:
        if profile not in PROFILES:
            errors.append('Required safety suite unavailable: ' + profile)
        elif not set(PROFILES[profile]).issubset(set(e.get('passedCases', []))):
            errors.append('Required safety cases missing: ' + profile)
    return errors


def complete(e, dev):
    c = e.get('completion', {})
    return (isinstance(c, dict) and c.get('dev') == dev
            and set(c) == COMPLETE_KEYS | {'dev'}
            and all(c.get(k) is True for k in COMPLETE_KEYS))
