import unittest
from pr_policy import validate, manual, forbidden, changed_paths, owner_approved

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

    def test_high_risk_requires_label_and_current_owner_approval(self):
        for p in ('.github/workflows/pr-ci.yml', 'AGENTS.md', 'scripts/pr_policy.py',
                  'packages/db/schema.ts', 'apps/api/src/orders.ts', 'apps/worker/src/index.ts',
                  'apps/web/src/components/Shipment.tsx', 'BACKUP_RECOVERY.md', 'unknown.txt'):
            with self.subTest(p=p):
                self.assertTrue(manual(p))
                self.assertTrue(check([p, REPORT], labels={'manual-risk-approved'}))
                self.assertTrue(check([p, REPORT], approved=True))
                self.assertEqual(check([p, REPORT], labels={'manual-risk-approved'}, approved=True), [])

    def test_draft_fork_empty(self):
        self.assertTrue(check([REPORT], draft=True))
        self.assertTrue(check([REPORT], repo='another/repo'))
        self.assertTrue(check([]))

    def test_rename_old_path_inspected(self):
        paths = changed_paths([[{'filename': 'README.md', 'status': 'renamed',
                                  'previous_filename': 'apps/api/src/auth/token.ts'}]], 1)
        self.assertTrue(any(manual(p) for p in paths))
        self.assertIn('apps/api/src/auth/token.ts', paths)

    def test_incomplete_or_oversized_file_lists_block(self):
        for pages, expected in [([], 1), ([[]], 0), ([[]], 3000),
                                ([[{'filename': 'a'}, {'filename': 'a'}]], 2)]:
            with self.assertRaises(ValueError):
                changed_paths(pages, expected)

    def test_owner_reviews_are_head_bound_and_latest(self):
        review = {'user': {'login': 'Raccoon26'}, 'state': 'APPROVED', 'commit_id': 'abc'}
        self.assertTrue(owner_approved([review], 'Raccoon26', 'abc'))
        self.assertFalse(owner_approved([review], 'Raccoon26', 'other'))
        self.assertFalse(owner_approved([review], 'other', 'abc'))
        self.assertFalse(owner_approved([review, dict(review, state='CHANGES_REQUESTED')], 'Raccoon26', 'abc'))
        self.assertFalse(owner_approved([review, dict(review, state='DISMISSED')], 'Raccoon26', 'abc'))


if __name__ == '__main__':
    unittest.main()

class OwnerAttestationTests(unittest.TestCase):
    def test_human_comment_is_owner_and_sha_bound(self):
        from pr_policy import owner_attested
        def comment(user, body):
            return {'user': {'login': user}, 'body': body}
        c = comment('Raccoon26', '/wms-owner-review abc')
        self.assertTrue(owner_attested([c], 'Raccoon26', 'abc'))
        self.assertFalse(owner_attested([c], 'Raccoon26', 'def'))
        self.assertFalse(owner_attested([comment('other', c['body'])], 'Raccoon26', 'abc'))
        self.assertFalse(owner_attested([c, comment('Raccoon26', '/wms-owner-revoke abc')], 'Raccoon26', 'abc'))

    def test_owner_revocation_overrides_review_approval(self):
        from pr_policy import review_authorized
        review = {'user': {'login': 'Raccoon26'}, 'state': 'APPROVED', 'commit_id': 'abc'}
        comment = {'user': {'login': 'Raccoon26'}, 'body': '/wms-owner-revoke abc'}
        self.assertFalse(review_authorized([review], [comment], 'Raccoon26', 'abc'))
        self.assertTrue(review_authorized([review], [], 'Raccoon26', 'abc'))

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
