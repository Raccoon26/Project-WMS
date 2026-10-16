#!/usr/bin/env python3
"""Trusted-base metadata policy; never import code from the PR head."""
import argparse
import json
import re
from pathlib import Path, PurePosixPath

DEV = re.compile(r"^dev/dev-(0[0-9]|1[0-8])-[a-z0-9][a-z0-9-]*$")
TITLE = re.compile(r"^\[(DEV-(?:0[0-9]|1[0-8]))\] +\S")
FORBIDDEN = {".env", "id_rsa", "id_ed25519", "credentials.json", "service-account.json"}
EXT = {".pem", ".p12", ".pfx", ".key", ".dump", ".backup", ".sqlite", ".db"}


def valid_path(path):
    return bool(path) and not path.startswith("/") and not any(
        p in ("", ".", "..") for p in path.split("/")
    ) and not any(ord(c) < 32 for c in path) and "\\" not in path


def manual(path):
    """Compatibility API: no path requires human approval under current policy."""
    return False


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
    from governance import metadata_errors, classify, waiting
    errors = metadata_errors(meta, paths, a.repo)
    records = [f for page in json.loads(Path(a.files).read_text()) for f in page]
    added = [f['filename'] for f in records if f.get('status') == 'added']
    classification = classify(paths, added)
    pending = waiting(meta, classification)
    status = 'FAIL' if errors else 'WAITING' if pending else 'ELIGIBLE_FOR_CI_VERIFICATION'
    # A successful metadata check is explicitly NOT permission to merge.
    result = {'status': status, 'mergeAllowed': False,
              'classification': classification, 'errors': errors, 'waiting': pending}
    print(json.dumps(result, indent=2))
    import os
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('## PR metadata policy: ' + status + '\n\nMerge authorization: **false**. '
                          + 'The independent guarded controller verifies current CI.\n\n'
                          + '\n'.join('- ' + x for x in errors + pending) + '\n')
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
