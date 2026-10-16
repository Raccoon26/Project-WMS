import copy
import json
import unittest
from merge_gate import evaluate, check_errors, protection_errors

SHA = 'a' * 40
REPO = {'full_name': 'Raccoon26/Project-WMS', 'allow_auto_merge': True}
PATHS = ['README.md', 'docs/dev-reports/DEV-03.md']
PR = {'state': 'open', 'base': {'ref': 'main'}, 'head': {'ref': 'dev/dev-03-catalog',
      'sha': SHA, 'repo': {'full_name': REPO['full_name']}}, 'title': '[DEV-03] Catalog',
      'draft': False, 'mergeable': True, 'mergeable_state': 'clean'}
PROTECTION = {'required_status_checks': {'strict': True, 'checks': [
    {'context': n, 'app_id': 15368} for n in ('WMS Quality Gate', 'WMS Policy Gate')]},
    'required_pull_request_reviews': {'required_approving_review_count': 0},
    'enforce_admins': {'enabled': True}, 'allow_force_pushes': {'enabled': False},
    'allow_deletions': {'enabled': False}}
RUNS = [{'name': n, 'head_sha': SHA, 'status': 'completed', 'conclusion': 'success',
         'app': {'id': 15368}} for n in ('WMS Quality Gate', 'WMS Policy Gate')]


class MergeTests(unittest.TestCase):
    def test_only_verified_safe_pr_passes(self):
        self.assertEqual(evaluate(REPO, PR, PROTECTION, PATHS, RUNS), [])

    def test_disabled_auto_merge(self):
        self.assertTrue(evaluate(dict(REPO, allow_auto_merge=False), PR, PROTECTION, PATHS, RUNS))

    def test_missing_and_duplicate_checks_block(self):
        for runs in ([], RUNS[:1], RUNS + RUNS[:1]):
            self.assertTrue(check_errors(runs, SHA))

    def test_bad_checks_block(self):
        for field, value in [('conclusion', 'skipped'), ('conclusion', 'neutral'),
                             ('conclusion', 'failure'), ('conclusion', 'cancelled'),
                             ('status', 'queued'), ('status', 'in_progress'),
                             ('head_sha', 'b' * 40), ('app', {'id': 99})]:
            runs = copy.deepcopy(RUNS)
            runs[0][field] = value
            with self.subTest(field=field, value=value):
                self.assertTrue(check_errors(runs, SHA))

    def test_extra_pending_check_blocks(self):
        self.assertTrue(check_errors(RUNS + [{'name': 'extra', 'status': 'queued'}], SHA))

    def test_missing_protection_and_bypasses_block(self):
        self.assertTrue(protection_errors({}))
        for field in ('allow_force_pushes', 'allow_deletions'):
            p = copy.deepcopy(PROTECTION)
            p[field]['enabled'] = True
            self.assertTrue(protection_errors(p))
        p = copy.deepcopy(PROTECTION)
        p['enforce_admins']['enabled'] = False
        self.assertTrue(protection_errors(p))
        p = copy.deepcopy(PROTECTION)
        p['required_status_checks']['strict'] = False
        self.assertTrue(protection_errors(p))
        p = copy.deepcopy(PROTECTION)
        p['required_status_checks']['checks'][0]['app_id'] = None
        self.assertTrue(protection_errors(p))
        p = copy.deepcopy(PROTECTION)
        p['required_pull_request_reviews']['bypass_pull_request_allowances'] = {'users': ['admin']}
        self.assertTrue(protection_errors(p))

    def test_ineligible_metadata_blocks(self):
        for key, value in [('draft', True), ('mergeable', None), ('mergeable', False),
                           ('mergeable_state', 'behind'), ('state', 'closed')]:
            self.assertTrue(evaluate(REPO, dict(PR, **{key: value}), PROTECTION, PATHS, RUNS))
        p = copy.deepcopy(PR)
        p['head']['repo']['full_name'] = 'fork/WMS'
        self.assertTrue(evaluate(REPO, p, PROTECTION, PATHS, RUNS))

    def test_high_risk_never_auto_merges(self):
        self.assertTrue(evaluate(REPO, PR, PROTECTION, PATHS + ['DATA_MODEL.md'], RUNS))
