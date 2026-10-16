#!/usr/bin/env python3
"""Fail closed before requesting native auto-merge. Pure functions are unit tested."""
import argparse
import json
from pathlib import Path
from pr_policy import changed_paths, manual, validate

REQUIRED = {'WMS Quality Gate', 'WMS Policy Gate'}
ACTIONS_APP_ID = 15368


def protection_errors(p):
    errors = []
    sc = p.get('required_status_checks') or {}
    checks = {c['context']: c.get('app_id') for c in sc.get('checks', [])}
    if not REQUIRED.issubset(checks) or any(checks.get(k) != ACTIONS_APP_ID for k in REQUIRED):
        errors.append('Required checks must be bound to the GitHub Actions app')
    if not sc.get('strict'):
        errors.append('Branches must be up-to-date')
    reviews = p.get('required_pull_request_reviews') or {}
    if not reviews or reviews.get('bypass_pull_request_allowances'):
        # Empty allowance objects are harmless; populated lists are not.
        allowances = reviews.get('bypass_pull_request_allowances') or {}
        if not reviews or any(allowances.values()):
            errors.append('PR requirement missing or review bypass allowed')
    if not (p.get('enforce_admins') or {}).get('enabled'):
        errors.append('Admin bypass not restricted')
    for key in ('allow_force_pushes', 'allow_deletions'):
        if (p.get(key) or {}).get('enabled'):
            errors.append(key + ' allowed')
    return errors


def check_errors(runs, sha):
    errors = []
    for name in REQUIRED:
        # Caller requests filter=latest. More than one workflow using a gate name is ambiguous.
        matching = [r for r in runs if r.get('name') == name]
        if len(matching) != 1:
            errors.append('Missing or ambiguous check: ' + name)
            continue
        r = matching[0]
        if (r.get('head_sha') != sha or r.get('status') != 'completed'
                or r.get('conclusion') != 'success'
                or r.get('app', {}).get('id') != ACTIONS_APP_ID):
            errors.append('Non-success/current/trusted check: ' + name)
    # Unfinished or failed extra checks also block, rather than guessing they are optional.
    if any(r.get('status') != 'completed' or r.get('conclusion') != 'success' for r in runs):
        errors.append('Other checks not successful')
    return errors


def evaluate(repo, pr, protection, paths, runs):
    errors = protection_errors(protection)
    if not repo.get('allow_auto_merge'):
        errors.append('Repo auto-merge disabled')
    if pr.get('state') != 'open' or pr.get('base', {}).get('ref') != 'main':
        errors.append('PR not open against main')
    if pr.get('mergeable') is not True or pr.get('mergeable_state') != 'clean':
        errors.append('Mergeability not clean/known')
    if pr.get('draft'):
        errors.append('Draft is not ready for merge')
    errors += validate(pr['head']['ref'], pr['title'], paths, set(),
                       pr['head']['repo']['full_name'], repo['full_name'], pr['draft'])
    errors += check_errors(runs, pr['head']['sha'])
    return errors


def main():
    p = argparse.ArgumentParser()
    p.add_argument('directory')
    a = p.parse_args()
    d = Path(a.directory)
    def read(name):
        return json.loads((d / (name + '.json')).read_text())
    pr = read('pr')
    paths = changed_paths(read('files'), pr['changed_files'])
    checks = [r for page in read('checks') for r in page['check_runs']]
    errors = evaluate(read('repo'), pr, read('protection'), paths, checks)
    if errors:
        raise SystemExit('SAFE STOP: ' + '; '.join(errors))
    # Re-read metadata immediately before invoking gh with --match-head-commit.
    if read('pr_after')['head']['sha'] != pr['head']['sha']:
        raise SystemExit('SAFE STOP: Head changed during verification')
    print(pr['head']['sha'])


if __name__ == '__main__':
    main()
