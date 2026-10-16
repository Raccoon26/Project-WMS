#!/usr/bin/env python3
"""Trusted-base, GitHub Actions-driven auto-merge. Never executes PR code.

Only CI-verified DEV PRs with a current successful official CI run can be merged.
All privileged operations happen in an Actions workflow loaded from main.
No branch-protection/Admin API or GitHub 'Allow auto-merge' feature required.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import io
import zipfile
import copy
from typing import Any

from pr_policy import changed_paths
from governance import classify, metadata_errors, waiting, verify_evidence, complete, DISABLED_SCAFFOLD_SHA256

CI_PATH = ".github/workflows/independent-verification.yml"
CI_NAME = "WMS Independent Verification"
GATE_NAME = "WMS Independent Gate"
REQUIRED_STEPS = {'Independent main-owned validation', 'Preserve merge evidence (data only)'}
BLOCK_LABELS = {"do-not-merge", "manual-review", "hold", "security-review"}


def api(repo: str, suffix: str, *, method: str = "GET", fields: dict[str, str] | None = None) -> Any:
    endpoint = f"repos/{repo}" + (f"/{suffix}" if suffix else "")
    cmd = ["gh", "api", "--method", method, endpoint]
    for key, value in (fields or {}).items():
        cmd.extend(["-f", f"{key}={value}"])
    p = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if p.returncode:
        raise RuntimeError(f"GitHub API {method} {suffix}: {p.stderr.strip()}")
    return json.loads(p.stdout)


def eligible(repo_name: str, pr: dict, run: dict, repo: dict,
             paths: list[str], workflow: dict, main_sha: str,
             latest_run: dict, jobs: list[dict], evidence: dict | None = None,
             added_tests: tuple = ()) -> list[str]:
    errors = []
    number = pr.get("number")
    head = pr.get("head") or {}
    base = pr.get("base") or {}
    sha = head.get("sha")
    title = pr.get("title", "")
    pr_entries = run.get("pull_requests") or []
    if pr.get("state") != "open" or pr.get("draft") is not False:
        errors.append("PR closed or draft")
    if base.get("ref") != "main" or repo.get("default_branch") != "main":
        errors.append("Wrong base/default branch")
    if head.get("repo", {}).get("full_name") != repo_name:
        errors.append("Fork PR prohibited")
    if (pr.get("user") or {}).get("login", "").casefold() != repo_name.split("/")[0].casefold():
        errors.append("Only repo owner's DEV PR can auto-merge")
    if (pr.get("mergeable") is not True or pr.get("mergeable_state") != "clean"):
        errors.append("Mergeability is not clean")
    if run.get("event") != "workflow_run" or run.get("status") != "completed" or run.get("conclusion") != "success":
        errors.append("CI must be completed/successful pull_request workflow")
    if run.get("name") != CI_NAME or run.get("path") != CI_PATH or run.get("workflow_id") != workflow.get("id"):
        errors.append("CI workflow identity mismatch")
    if run.get("head_sha") != main_sha or latest_run.get("id") != run.get("id"):
        errors.append("CI is not latest/current exact PR head")
    if run.get('head_repository', {}).get('id') != repo.get('id'):
        errors.append('Independent verifier repository mismatch')
    if not jobs or not any(j.get("name") == GATE_NAME and j.get("conclusion") == "success" and j.get("status") == "completed" for j in jobs):
        errors.append("Required WMS Quality Gate job missing/failing")
    if any(j.get("conclusion") != "success" or j.get("status") != "completed" for j in jobs):
        errors.append("Some CI jobs did not succeed")
    gates = [j for j in jobs if j.get('name') == GATE_NAME]
    if len(gates) != 1:
        errors.append('Ambiguous quality gate')
    else:
        passed_steps = {s.get('name') for s in gates[0].get('steps', [])
                        if s.get('status') == 'completed' and s.get('conclusion') == 'success'}
        if not REQUIRED_STEPS.issubset(passed_steps):
            errors.append('Required quality steps absent/skipped/failed')
    classification = classify(paths, added_tests)
    external = [p for p in paths if p.startswith('packages/integrations/') and not p.endswith('package.json')]
    if (external == ['packages/integrations/src/index.ts']
            and (evidence or {}).get('disabledScaffoldHash') == DISABLED_SCAFFOLD_SHA256
            and 'external effects including AI are disabled' in (evidence or {}).get('passedCases', [])):
        classification['profiles'] = [p for p in classification['profiles'] if p != 'integration']
    errors += metadata_errors(pr, paths, repo_name)
    errors += waiting(pr, classification)
    errors += verify_evidence(evidence or {}, sha, main_sha, number, classification['profiles'])
    if any(p.startswith(('apps/', 'packages/')) or p == 'package.json' for p in paths) and (evidence or {}).get('application') is not True:
        errors.append('Application changes require actual application suites')
    if (not evidence or evidence.get('independentRunId') != run.get('id')
            or evidence.get('independentRunAttempt') != run.get('run_attempt', 1)):
        errors.append('Independent verifier run/attempt evidence mismatch')
    return errors


def evidence_for(repo, run_id):
    # Parse bounded JSON DATA only. Never extract archives, import artifacts or
    # execute PR code in this privileged process.
    listing = api(repo, f"actions/runs/{run_id}/artifacts?per_page=100")
    records = listing.get('artifacts', [])
    matches = [x for x in records if x.get('name') == 'wms-merge-evidence' and not x.get('expired')]
    if listing.get('total_count') != len(records) or len(matches) != 1:
        raise ValueError('Missing/ambiguous/truncated evidence artifacts')
    artifact = matches[0]
    if not 0 < artifact.get('size_in_bytes', 0) <= 2_000_000:
        raise ValueError('Evidence archive size invalid')
    r = subprocess.run(['gh', 'api', f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"],
                       capture_output=True, check=True, timeout=60)
    if len(r.stdout) > 2_000_000:
        raise ValueError('Oversized evidence archive')
    with zipfile.ZipFile(io.BytesIO(r.stdout)) as archive:
        if archive.namelist() != ['merge-evidence.json']:
            raise ValueError('Unexpected evidence archive members')
        info = archive.getinfo('merge-evidence.json')
        if info.file_size > 1_000_000:
            raise ValueError('Oversized evidence JSON')
        result = json.loads(archive.read(info))
        if not isinstance(result, dict):
            raise ValueError('Evidence must be an object')
        return result


def quality_errors(repo, pr, base, evidence):
    workflow = api(repo, 'actions/workflows/pr-ci.yml')
    listing = api(repo, 'actions/workflows/pr-ci.yml/runs?event=pull_request&per_page=100')
    matches = [r for r in listing.get('workflow_runs', [])
               if r.get('head_sha') == pr['head']['sha'] and
               any(p.get('number') == pr['number'] for p in r.get('pull_requests', []))]
    if not matches:
        return ['Current application quality CI missing']
    run = max(matches, key=lambda r: (r.get('created_at', ''), r.get('id', 0)))
    if (run.get('id') != evidence.get('sourceRunId') or run.get('run_attempt', 1) != evidence.get('sourceRunAttempt')
            or run.get('workflow_id') != workflow.get('id') or run.get('name') != 'WMS PR CI'
            or run.get('path') != '.github/workflows/pr-ci.yml'
            or run.get('event') != 'pull_request' or run.get('status') != 'completed'
            or run.get('conclusion') != 'success'
            or not any(p.get('base', {}).get('sha') == base for p in run.get('pull_requests', []))):
        return ['Current application quality CI failed/incomplete/untrusted/stale']
    result = api(repo, f"actions/runs/{run['id']}/jobs?per_page=100")
    jobs = result.get('jobs', [])
    if (not jobs or result.get('total_count') != len(jobs)
            or not any(j.get('name') == 'WMS Quality Gate' for j in jobs)
            or any(j.get('status') != 'completed' or j.get('conclusion') != 'success' for j in jobs)):
        return ['Application quality jobs missing/failed/skipped']
    return []


def snapshot_current(pr, current, base, current_base):
    return (current['head']['sha'] == pr['head']['sha'] and base == current_base
            and current.get('state') == 'open'
            and not current.get('draft') and current.get('mergeable') is True
            and current.get('mergeable_state') == 'clean'
            and not waiting(current, {'controls': [], 'unknown': [], 'profiles': []}))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--run-id", type=int, default=0)
    p.add_argument("--pr-number", type=int, default=0)
    a = p.parse_args()
    repo_name = a.repo
    if repo_name != "Raccoon26/Project-WMS":
        raise SystemExit("SAFE STOP: this script is only for Project-WMS")
    repo = api(repo_name, "")
    workflow = api(repo_name, "actions/workflows/independent-verification.yml")
    run = api(repo_name, f"actions/runs/{a.run_id}") if a.run_id else None
    if not run:
        raise SystemExit('FAIL: independent workflow run ID is required; no speculative retries')
    evidence = evidence_for(repo_name, run['id'])
    number = evidence.get('pr')
    if type(number) is not int or number <= 0 or (a.pr_number and a.pr_number != number):
        raise SystemExit('FAIL: evidence PR identity invalid')
    pr = api(repo_name, f"pulls/{number}")
    latest = run  # source run/attempt freshness independently checked against current Quality run
    pages = []
    for page in range(1, 31):
        page_data = api(repo_name, f"pulls/{number}/files?per_page=100&page={page}")
        pages.append(page_data)
        if len(page_data) < 100:
            break
    try:
        paths = changed_paths(pages, pr["changed_files"])
    except (KeyError, ValueError) as e:
        raise SystemExit(f"SAFE STOP: changed file list incomplete: {e}")
    added = tuple(f['filename'] for page in pages for f in page if f.get('status') == 'added')
    classification = classify(paths, added)
    structural = metadata_errors(pr, paths, repo_name)
    if structural:
        raise SystemExit('FAIL: ' + '; '.join(structural))
    pending = [x for x in waiting(pr, classification) if not x.startswith(('Draft:', 'Safety suites not implemented:'))]
    if pending:
        print('WAITING (mergeAllowed=false): ' + '; '.join(pending))
        return 0
    jobs_response = api(repo_name, f"actions/runs/{run['id']}/jobs?per_page=100")
    jobs = jobs_response.get('jobs', [])
    if jobs_response.get('total_count') != len(jobs):
        raise SystemExit('FAIL: incomplete job list')
    main_sha = api(repo_name, "branches/main")["commit"]["sha"]
    candidate = copy.deepcopy(pr)
    candidate['draft'] = False
    errors = eligible(repo_name, candidate, run, repo, paths, workflow, main_sha, latest, jobs, evidence, added)
    errors += quality_errors(repo_name, pr, main_sha, evidence)
    if errors:
        raise SystemExit("FAIL: " + "; ".join(errors))
    dev = 'DEV-' + pr['head']['ref'].split('/')[1].split('-')[1]
    if not complete(evidence, dev):
        print('WAITING (mergeAllowed=false): explicit DEV completion declaration missing')
        return 0
    # Before Ready mutation, recheck head/base/holds. Readiness is not approval.
    current = api(repo_name, f"pulls/{number}")
    current_candidate = dict(current, draft=False)
    if not snapshot_current(pr, current_candidate, main_sha, api(repo_name, "branches/main")["commit"]["sha"]):
        raise SystemExit('FAIL: snapshot changed before Ready transition')
    if current.get('draft'):
        subprocess.run(['gh', 'pr', 'ready', str(number), '--repo', repo_name], check=True)
        print('READY: verified completion/current CI; merge will recheck snapshot')
    current_pr = api(repo_name, f"pulls/{number}")
    current_main_sha = api(repo_name, "branches/main")["commit"]["sha"]
    if not snapshot_current(pr, current_pr, main_sha, current_main_sha):
        raise SystemExit("FAIL: PR/head/main/review/mergeability changed during evaluation")
    result = api(repo_name, f"pulls/{number}/merge", method="PUT",
                 fields={"merge_method": "squash", "sha": pr["head"]["sha"],
                         "commit_title": f"{pr['title']} (#{number})"})
    if not result.get("merged"):
        raise SystemExit("SAFE STOP: GitHub did not report merged")
    print(f"MERGED: PR #{number} at {result.get('sha')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, KeyError, TypeError, ValueError, subprocess.SubprocessError, zipfile.BadZipFile) as e:
        raise SystemExit(f"SAFE STOP: {e}")
