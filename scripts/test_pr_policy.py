import unittest
from pr_policy import validate,manual,forbidden
REPO="Raccoon26/Project-WMS"
def check(paths,labels=(),branch="dev/dev-03-inventory",title="[DEV-03] Inventory",draft=False,repo=REPO):
    return validate(branch,title,paths,set(labels),repo,REPO,draft)
class Tests(unittest.TestCase):
    def test_safe(self):
        self.assertEqual(check(["apps/ui/src/page.tsx","docs/dev-reports/DEV-03.md"]),[])
    def test_missing_report(self):
        self.assertTrue(check(["apps/ui/src/page.tsx"]))
    def test_branch_title(self):
        self.assertTrue(check(["docs/dev-reports/DEV-03.md"],branch="fix/x"))
        self.assertTrue(check(["docs/dev-reports/DEV-03.md"],title="[DEV-04] Wrong"))
    def test_secret(self):
        for p in (".env","api/.env.prod","id_rsa","secrets/key.pem"):
            self.assertTrue(forbidden(p));self.assertTrue(check([p,"docs/dev-reports/DEV-03.md"]))
    def test_manual(self):
        for p in (".github/workflows/pr-ci.yml","AGENTS.md","scripts/pr_policy.py","migrations/002.sql","apps/api/src/payments/a.ts"):
            self.assertTrue(manual(p));self.assertTrue(check([p,"docs/dev-reports/DEV-03.md"]))
            self.assertEqual(check([p,"docs/dev-reports/DEV-03.md"],labels={"manual-risk-approved"}),[])
    def test_draft_fork_empty(self):
        self.assertTrue(check(["docs/dev-reports/DEV-03.md"],draft=True))
        self.assertTrue(check(["docs/dev-reports/DEV-03.md"],repo="another/repo"))
        self.assertTrue(check([]))
if __name__=="__main__":unittest.main()
