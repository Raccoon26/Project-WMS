#!/usr/bin/env python3
"""Trusted-base, GitHub Actions-driven auto-merge. Never executes PR code.

Only low-risk DEV PRs with a current successful official CI run can be merged.
All privileged operations happen in an Actions workflow loaded from main.
No branch-protection/Admin API or GitHub 'Allow auto-merge' feature required.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import Any

from pr_policy import changed_paths, forbidden, manual, validate

CI_PATH = ".github/workflows/pr-ci.yml"
CI_NAME = "WMS PR CI"
GATE_NAME = "WMS Quality Gate"
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
             latest_run: dict, jobs: list[dict]) -> list[str]:
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
    if pr.get("requested_reviewers") or pr.get("requested_teams"):
        errors.append("Human reviewers requested")
    if (pr.get("mergeable") is not True or pr.get("mergeable_state") != "clean"):
        errors.append("Mergeability is not clean")
    if run.get("event") != "pull_request" or run.get("status") != "completed" or run.get("conclusion") != "success":
        errors.append("CI must be completed/successful pull_request workflow")
    if run.get("name") != CI_NAME or run.get("path") != CI_PATH or run.get("workflow_id") != workflow.get("id"):
        errors.append("CI workflow identity mismatch")
    if run.get("head_sha") != sha or latest_run.get("id") != run.get("id"):
        errors.append("CI is not latest/current exact PR head")
    matches = [p for p in pr_entries
               if p.get("number") == number and
               p.get("head", {}).get("sha") == sha and
               p.get("base", {}).get("ref") == "main" and
               p.get("base", {}).get("sha") == main_sha and
               p.get("head", {}).get("repo", {}).get("id") == repo.get("id")]
    if len(matches) != 1 or len(pr_entries) != 1:
        errors.append("CI PR identity/base commit mismatch or main advanced")
    if not jobs or not any(j.get("name") == GATE_NAME and j.get("conclusion") == "success" and j.get("status") == "completed" for j in jobs):
        errors.append("Required WMS Quality Gate job missing/failing")
    if any(j.get("conclusion") != "success" or j.get("status") != "completed" for j in jobs):
        errors.append("Some CI jobs did not succeed")
    if not paths or any(forbidden(p) or manual(p) for p in paths):
        errors.append("Sensitive/unknown path: manual merge only")
    labels = {x.get("name", "") for x in pr.get("labels", [])}
    if labels.intersection(BLOCK_LABELS):
        errors.append("PR is explicitly held")
    errors += validate(head.get("ref", ""), title, paths, labels,
                       head.get("repo", {}).get("full_name", ""), repo_name, bool(pr.get("draft")))
    return errors


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
    workflow = api(repo_name, "actions/workflows/pr-ci.yml")
    run = api(repo_name, f"actions/runs/{a.run_id}") if a.run_id else None
    if run:
        prs = run.get("pull_requests") or []
        if len(prs) != 1 or (a.pr_number and prs[0].get("number") != a.pr_number):
            raise SystemExit("SAFE STOP: CI run not tied to exactly one PR")
        number = prs[0]["number"]
    else:
        if not a.pr_number:
            raise SystemExit("SAFE STOP: must supply CI run ID or PR number")
        number = a.pr_number
    pr = api(repo_name, f"pulls/{number}")
    if not run:
        sha = pr["head"]["sha"]
        all_runs = api(repo_name, "actions/workflows/pr-ci.yml/runs?event=pull_request&per_page=100")
        related = [x for x in all_runs.get("workflow_runs", [])
                   if x.get("head_sha") == sha and
                   len(x.get("pull_requests") or []) == 1 and
                   x["pull_requests"][0].get("number") == number]
        if not related:
            raise SystemExit("SAFE STOP: no current CI for PR")
        run = max(related, key=lambda x: (x.get("created_at", ""), x.get("id", 0)))
    if run.get("head_sha") != pr["head"]["sha"]:
        raise SystemExit("SAFE STOP: stale CI")
    all_runs = api(repo_name, "actions/workflows/pr-ci.yml/runs?event=pull_request&per_page=100")
    related = [x for x in all_runs.get("workflow_runs", [])
               if x.get("head_sha") == pr["head"]["sha"] and
               len(x.get("pull_requests") or []) == 1 and
               x["pull_requests"][0].get("number") == number]
    if not related:
        raise SystemExit("SAFE STOP: CI absent from run history")
    latest = max(related, key=lambda x: (x.get("created_at", ""), x.get("id", 0)))
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
    jobs = api(repo_name, f"actions/runs/{run['id']}/jobs?per_page=100").get("jobs", [])
    branch = api(repo_name, "branches/main")
    main_sha = branch["commit"]["sha"]
    errors = eligible(repo_name, pr, run, repo, paths, workflow, main_sha, latest, jobs)
    if errors:
        raise SystemExit("SAFE STOP: " + "; ".join(errors))
    # Final re-read. GitHub's merge endpoint also rejects changed head SHA.
    current_pr = api(repo_name, f"pulls/{number}")
    current_main_sha = api(repo_name, "branches/main")["commit"]["sha"]
    if (current_pr["head"]["sha"] != pr["head"]["sha"] or
            current_main_sha != main_sha or current_pr.get("draft") or
            current_pr.get("mergeable") is not True or current_pr.get("mergeable_state") != "clean"):
        raise SystemExit("SAFE STOP: PR/head/main/mergeability changed during evaluation")
    # Protect against human review changes after initial snapshot.
    if any(x.get("name") in BLOCK_LABELS for x in current_pr.get("labels", [])):
        raise SystemExit("SAFE STOP: PR manually held")
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
    except (RuntimeError, KeyError, TypeError, ValueError) as e:
        raise SystemExit(f"SAFE STOP: {e}")
