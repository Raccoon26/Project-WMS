#!/usr/bin/env python3
"""Trusted-base metadata policy; never import code from the PR head."""
import argparse
import json
import re
from pathlib import Path, PurePosixPath

DEV = re.compile(r"^dev/dev-(0[0-9]|1[0-8])-[a-z0-9][a-z0-9-]*$")
TITLE = re.compile(r"^\[(DEV-(?:0[0-9]|1[0-8]))\] +\S")
LABEL = "manual-risk-approved"
SENSITIVE = re.compile(
    r"auth|security|payment|money|inventory|ledger|stock|reservation|outbound|"
    r"shipment|procure|approval|idempot|outbox|backup|recover|restore|migration|"
    r"deploy|policy|safety|github|release|scheduler|worker", re.I
)
CRITICAL_DOCS = {
    "AGENTS.md", "REQUIREMENTS.md", "ARCHITECTURE.md", "DATA_MODEL.md",
    "SECURITY.md", "BACKUP_RECOVERY.md", "DEPLOYMENT.md", "OPERATIONS.md",
    "INTEGRATIONS.md", "RELEASE_CHECKLIST.md", "TEST_PLAN.md",
    "docs/PROJECT_SCOPE.md", "docs/DECISIONS.md",
}
FORBIDDEN = {".env", "id_rsa", "id_ed25519", "credentials.json", "service-account.json"}
EXT = {".pem", ".p12", ".pfx", ".key", ".dump", ".backup", ".sqlite", ".db"}


def valid_path(path):
    return bool(path) and not path.startswith("/") and not any(
        p in ("", ".", "..") for p in path.split("/")
    ) and not any(ord(c) < 32 for c in path) and "\\" not in path


def manual(path):
    """Conservative allowlist; unknown code belongs in manual review."""
    if not valid_path(path) or path in CRITICAL_DOCS or SENSITIVE.search(path):
        return True
    if path.startswith("docs/") or path in {"README.md", "PROJECT_STATUS.md", "DEV_PROGRESS.md"}:
        return False
    # Presentation-only boundary. Auth/stock/shipping names still require review.
    return not path.startswith("apps/web/src/components/")


def forbidden(path):
    p = PurePosixPath(path.lower())
    n = p.name
    return (not valid_path(path) or n in FORBIDDEN
            or (n.startswith(".env.") and n != ".env.example")
            or p.suffix in EXT or "backups" in p.parts or "secrets" in p.parts)


def changed_paths(pages, expected):
    """Inspect both sides of renames, and fail on GitHub's 3,000-file limit."""
    if not isinstance(pages, list) or not all(isinstance(p, list) for p in pages):
        raise ValueError("Expected paginated file arrays")
    records = [f for page in pages for f in page]
    if not isinstance(expected, int) or not 0 < expected < 3000 or len(records) != expected:
        raise ValueError("Empty, truncated or oversized file list")
    if len({f['filename'] for f in records}) != expected:
        raise ValueError("Duplicate file records")
    paths = []
    for f in records:
        paths.append(f['filename'])
        if f.get('status') == 'renamed':
            paths.append(f['previous_filename'])
    if not all(valid_path(p) for p in paths):
        raise ValueError("Uninspectable file path")
    return paths


def owner_approved(reviews, owner, sha):
    """Latest substantive review per user, bound to this exact head SHA."""
    latest = {}
    for review in reviews:
        if review['state'] in {'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'}:
            latest[review['user']['login'].casefold()] = review
    r = latest.get(owner.casefold(), {})
    return r.get('state') == 'APPROVED' and r.get('commit_id') == sha


def owner_attested(comments, owner, sha):
    # Explicit human fallback for a sole owner who cannot approve their own PR.
    # Automation must never create this statement on the owner's behalf.
    decisions = [c['body'].strip() for c in comments
                 if c['user']['login'].casefold() == owner.casefold()
                 and c['body'].strip().startswith('/wms-owner-')]
    return bool(decisions) and decisions[-1] == '/wms-owner-review ' + sha


def review_authorized(reviews, comments, owner, sha):
    decisions = [c for c in comments
                 if c['user']['login'].casefold() == owner.casefold()
                 and c['body'].strip().startswith('/wms-owner-')]
    if decisions:
        return owner_attested(decisions, owner, sha)
    return owner_approved(reviews, owner, sha)


def validate(head, title, paths, labels, head_repo, base_repo, draft=False,
             approved=False):
    errors = []
    m = DEV.fullmatch(head)
    t = TITLE.match(title)
    if not m:
        errors.append("Invalid DEV branch")
    if not t or (m and t.group(1) != "DEV-" + m.group(1)):
        errors.append("Invalid/mismatched DEV title")
    if head_repo != base_repo:
        errors.append("Fork PR not eligible")
    if not paths:
        errors.append("Empty or uninspectable diff")
    if any(forbidden(p) for p in paths):
        errors.append("Potential credential/backup file or invalid path")
    if m and f"docs/dev-reports/DEV-{m.group(1)}.md" not in paths:
        errors.append("DEV report required")
    if any(manual(p) for p in paths) and (LABEL not in labels or not approved):
        errors.append("High-risk changes need owner label AND current-SHA owner approval; manual merge only")
    if draft:
        errors.append("Draft PR blocked")
    return errors


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--metadata', required=True)
    p.add_argument('--files', required=True)
    p.add_argument('--reviews', required=True)
    p.add_argument('--comments', required=True)
    p.add_argument('--repo', required=True)
    a = p.parse_args()
    meta = json.loads(Path(a.metadata).read_text())
    paths = changed_paths(json.loads(Path(a.files).read_text()), meta['changed_files'])
    reviews = [r for page in json.loads(Path(a.reviews).read_text()) for r in page]
    comments = [c for page in json.loads(Path(a.comments).read_text()) for c in page]
    errors = validate(meta['head']['ref'], meta['title'], paths,
                      {x['name'] for x in meta['labels']},
                      meta['head']['repo']['full_name'], a.repo, meta['draft'],
                      review_authorized(reviews, comments, a.repo.split('/')[0], meta['head']['sha']))
    if meta['base']['ref'] != 'main' or meta['state'] != 'open':
        errors.append('Wrong base or closed PR')
    print('\n'.join('BLOCK: ' + e for e in errors) or 'PASS: PR metadata policy')
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
