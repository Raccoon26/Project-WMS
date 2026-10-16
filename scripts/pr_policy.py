#!/usr/bin/env python3
"""Fail-closed PR metadata policy. Trusted main check must never run PR code."""
import argparse
import re
from pathlib import PurePosixPath
DEV = re.compile(r"^dev/dev-(0[0-9]|1[0-8])-[a-z0-9][a-z0-9-]*$")
TITLE = re.compile(r"^\[(DEV-(?:0[0-9]|1[0-8]))\] +[^ ]")
CONTROL = (".github/", "AGENTS.md", "scripts/", "infra/", "deploy/",
           "migrations/", "db/migrations/", "Dockerfile", "docker-compose",
           "apps/api/src/auth/", "apps/api/src/payments/", "apps/api/src/release/",
           "apps/api/src/security/", "packages/auth/", "packages/payments/")
FORBIDDEN = {".env", "id_rsa", "id_ed25519", "credentials.json", "service-account.json"}
EXT = {".pem",".p12",".pfx",".key"}
LABEL = "manual-risk-approved"
def manual(path):
    return any(path == p or path.startswith(p) for p in CONTROL)
def forbidden(path):
    n=PurePosixPath(path).name
    return n in FORBIDDEN or (n.startswith(".env.") and n != ".env.example") or PurePosixPath(n).suffix.lower() in EXT
def validate(head,title,paths,labels,head_repo,base_repo,draft=False):
    errors=[]
    m=DEV.fullmatch(head)
    if not m: errors.append("Invalid DEV branch")
    t=TITLE.match(title)
    if not t or (m and t.group(1)!="DEV-"+m.group(1)): errors.append("Invalid/mismatched DEV title")
    if head_repo!=base_repo: errors.append("Fork PR not eligible")
    if not paths: errors.append("Empty or uninspectable diff")
    if any(forbidden(p) for p in paths): errors.append("Potential credential file")
    if m and f"docs/dev-reports/DEV-{m.group(1)}.md" not in paths: errors.append("DEV report required")
    if any(manual(p) for p in paths) and LABEL not in labels: errors.append("Control-plane changes require owner label")
    if draft: errors.append("Draft PR blocked")
    return errors
def main():
    p=argparse.ArgumentParser()
    for n in ("head","title","changed-files","labels","head-repo","base-repo"):
        p.add_argument("--"+n,required=True)
    p.add_argument("--draft",action="store_true")
    a=p.parse_args()
    with open(a.changed_files,encoding="utf8") as f:paths=[x.strip() for x in f if x.strip()]
    with open(a.labels,encoding="utf8") as f:labels={x.strip() for x in f if x.strip()}
    errors=validate(a.head,a.title,paths,labels,a.head_repo,a.base_repo,a.draft)
    for e in errors: print("BLOCK:",e)
    if not errors:print("PASS: PR metadata policy")
    return int(bool(errors))
if __name__=="__main__":raise SystemExit(main())
