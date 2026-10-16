import unittest
from pr_policy import validate, manual, forbidden, changed_paths

REPO = 'Raccoon26/Project-WMS'
REPORT = 'docs/dev-reports/DEV-03.md'


def check(paths, labels=(), branch='dev/dev-03-catalog', title='[DEV-03] Catalog',
          draft=False, repo=REPO, approved=False):
    return validate(branch, title, paths, set(labels), repo, REPO, draft, approved)


class PolicyTests(unittest.TestCase):
    def test_safe(self):
        self.assertEqual(check(['apps/web/src/components/Badge.tsx', REPORT]), [])

    def test_missing_report(self):
        self.assertTrue(check(['README.md']))

    def test_branch_title(self):
        for branch, title in [('main', '[DEV-03] Bad'), ('dev/dev-19-x', '[DEV-19] Bad'),
                              ('dev/dev-03-x', '[DEV-04] Bad')]:
            self.assertTrue(check([REPORT], branch=branch, title=title))

    def test_forbidden(self):
        for p in ('.env', 'api/.env.prod', 'id_rsa', 'keys/key.PEM', 'backups/a.sql',
                  'a.dump', 'credentials.json', '../x', '/x', 'a\nb'):
            with self.subTest(p=p):
                self.assertTrue(forbidden(p))
                self.assertTrue(check([p, REPORT]))
        self.assertFalse(forbidden('.env.example'))

    def test_all_paths_eligible_without_human_approval(self):
        for p in ('.github/workflows/pr-ci.yml', 'AGENTS.md', 'scripts/pr_policy.py',
                  'packages/db/schema.ts', 'apps/api/src/orders.ts', 'apps/worker/src/index.ts',
                  'apps/web/src/components/Shipment.tsx', 'BACKUP_RECOVERY.md', 'unknown.txt'):
            self.assertFalse(manual(p))
            self.assertEqual(check([p, REPORT]), [])

    def test_draft_fork_empty(self):
        self.assertEqual(check([REPORT], draft=True), [])
        self.assertTrue(check([REPORT], repo='another/repo'))
        self.assertTrue(check([]))

    def test_rename_old_path_inspected(self):
        paths = changed_paths([[{'filename': 'README.md', 'status': 'renamed',
                                  'previous_filename': 'apps/api/src/auth/token.ts'}]], 1)
        self.assertFalse(any(manual(p) for p in paths))
        self.assertIn('apps/api/src/auth/token.ts', paths)

    def test_incomplete_or_oversized_file_lists_block(self):
        for pages, expected in [([], 1), ([[]], 0), ([[]], 3000),
                                ([[{'filename': 'a'}, {'filename': 'a'}]], 2)]:
            with self.assertRaises(ValueError):
                changed_paths(pages, expected)

class PaginationCompatibilityTests(unittest.TestCase):
    def test_concatenated_arrays_and_objects(self):
        from slurp_json import pages
        self.assertEqual(pages(' [1] \n [2,3]\n'), [[1], [2, 3]])
        self.assertEqual(pages('{"check_runs":[]}\n{"check_runs":[]}'), [{'check_runs': []}, {'check_runs': []}])

    def test_empty_junk_scalar_responses_rejected(self):
        from slurp_json import pages
        for text in ('', ' ', '[]junk', '1', 'null'):
            with self.assertRaises(ValueError):
                pages(text)

class PolicyCliTests(unittest.TestCase):
    def run_cli(self, legacy):
        import json
        import subprocess
        import sys
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            metadata = {'head':{'ref':'dev/dev-03-catalog','sha':'a'*40,'repo':{'full_name':REPO}},
                        'base':{'ref':'main'},'title':'[DEV-03] Catalog','state':'open','draft':True,
                        'labels':[],'changed_files':2}
            payloads = {'meta':metadata,'files':[[{'filename':REPORT},{'filename':'README.md'}]],
                        'reviews':[],'comments':[]}
            for name, value in payloads.items(): (root/f'{name}.json').write_text(json.dumps(value))
            args=[sys.executable,str(Path(__file__).parent/'pr_policy.py'), '--metadata',str(root/'meta.json'),
                  '--files',str(root/'files.json'),'--repo',REPO]
            if legacy: args += ['--reviews',str(root/'reviews.json'),'--comments',str(root/'comments.json')]
            result=subprocess.run(args,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            parsed=json.loads(result.stdout)
            self.assertEqual(parsed['status'],'NOT_READY')
            self.assertIs(parsed['mergeAllowed'],False)

    def test_legacy_empty_review_arguments_need_no_owner_approval(self):
        self.run_cli(True)

    def test_current_cli_draft_is_not_a_failure_or_merge_authorization(self):
        self.run_cli(False)
