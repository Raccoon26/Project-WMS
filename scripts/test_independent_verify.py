"""Main-owned independent-verifier regressions; no live GitHub mutations."""
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from independent_verify import preflight
from auto_merge import api, quality_errors
from test_auto_merge import P, BASE, SHA, REPO_NAME

ROOT = Path(__file__).resolve().parents[1]


class IndependentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT/'.github', self.root/'.github')
        (self.root/'scripts').mkdir()
        shutil.copy(ROOT/'scripts/verification-baseline.json', self.root/'scripts')

    def test_current_workflows_pass_independent_static_contract(self):
        self.assertEqual(preflight(self.root, self.root), [])

    def test_privileged_pr_checkout_permission_and_command_escalations_block(self):
        path = self.root/'.github/workflows/auto-merge.yml'
        original = path.read_text()
        for before, after in (
            ('actions: read', 'actions: write'),
            ('ref: ${{ github.event.repository.default_branch }}', 'ref: ${{ github.event.pull_request.head.sha }}'),
            ('persist-credentials: false', 'persist-credentials: true'),
            ('python3 scripts/auto_merge.py', 'bash scripts/from-pr.sh'),
            ('GH_TOKEN: ${{ github.token }}', 'GH_TOKEN: ${{ secrets.PRODUCTION }}'),
        ):
            path.write_text(original.replace(before, after))
            self.assertTrue(preflight(self.root, self.root), after)
        path.write_text(original)

    def test_test_removal_and_unpinned_action_block(self):
        path = self.root/'.github/workflows/pr-ci.yml'
        original = path.read_text()
        for before, after in (('pnpm test:integration', 'echo skipped'),
                              ('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@main')):
            path.write_text(original.replace(before, after))
            self.assertTrue(preflight(self.root, self.root))
        path.write_text(original)

    def test_baseline_weakened_or_deleted_blocks(self):
        path = self.root/'scripts/verification-baseline.json'
        data = json.loads(path.read_text())
        key = next(k for k in data if k != 'package-scripts')
        del data[key]
        path.write_text(json.dumps(data))
        self.assertTrue(preflight(self.root, ROOT))

    def test_api_permission_error_never_reports_success(self):
        with patch('auto_merge.subprocess.run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'HTTP 403 permission denied'
            with self.assertRaises(RuntimeError): api(REPO_NAME, 'pulls/4/merge', method='PUT')

    def test_quality_current_attempt_fail_skip_and_missing(self):
        run = {'id':44,'run_attempt':2,'workflow_id':3,'head_sha':SHA,'name':'WMS PR CI',
               'path':'.github/workflows/pr-ci.yml','event':'pull_request','status':'completed',
               'conclusion':'success','pull_requests':[{'number':2,'base':{'sha':BASE}}]}
        proof = {'sourceRunId':44,'sourceRunAttempt':2}
        jobs = {'total_count':1,'jobs':[{'name':'WMS Quality Gate','status':'completed','conclusion':'success'}]}
        def response(repo, path):
            if path == 'actions/workflows/pr-ci.yml': return {'id':3}
            if '/runs?' in path: return {'workflow_runs':[run]}
            return jobs
        with patch('auto_merge.api', side_effect=response):
            self.assertEqual(quality_errors(REPO_NAME, P, BASE, proof), [])
            for conclusion in ('failure','cancelled','skipped',None):
                run['conclusion'] = conclusion
                self.assertTrue(quality_errors(REPO_NAME, P, BASE, proof))
            run['conclusion'] = 'success'
            self.assertTrue(quality_errors(REPO_NAME, P, BASE, dict(proof,sourceRunAttempt=1)))
            jobs['jobs'][0]['conclusion'] = 'skipped'
            self.assertTrue(quality_errors(REPO_NAME, P, BASE, proof))
