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
