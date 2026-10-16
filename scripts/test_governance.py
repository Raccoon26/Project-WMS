"""Policy decisions, data-proof integration and privileged controller negatives.

These are simulated GitHub API tests, NOT claims of live auto-merges.
"""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import auto_merge
from governance import classify, waiting, verify_evidence, complete, COMPLETE_KEYS
from ci_evidence import collect
from test_auto_merge import P, R, W, REPO, REPO_NAME, SHA, BASE, JOBS, FILES, EVIDENCE


def decision(path, evidence=None):
    return auto_merge.eligible(REPO_NAME, P, R, REPO, FILES + [path], W,
                               BASE, R, JOBS, evidence or EVIDENCE)


class GovernanceTests(unittest.TestCase):
    def test_ui_api_and_migration_with_actual_profile_proof_allowed(self):
        for path in ('apps/web/src/Overview.tsx', 'apps/api/src/products.ts',
                     'packages/db/migrations/0002.sql'):
            self.assertEqual(decision(path), [], path)

    def test_inventory_auth_and_other_unimplemented_profiles_fail_closed(self):
        for profile in ('inventory', 'auth', 'email', 'approval', 'money', 'recovery', 'integration'):
            self.assertTrue(decision(f'apps/api/src/{profile}/service.ts'), profile)

    def test_inventory_registered_profile_requires_all_cases(self):
        # Future registry installation is itself C; this simulates the eventual
        # trusted registry, not permission to enable missing DEV04 tests now.
        with patch.dict('governance.PROFILES', {'inventory': ('concurrency', 'invariant', 'idempotency', 'rollback')}):
            e = copy.deepcopy(EVIDENCE)
            e['passedCases'] += ['concurrency', 'invariant', 'idempotency', 'rollback']
            self.assertEqual(decision('apps/api/src/ledger.ts', e), [])
            e['passedCases'].remove('invariant')
            self.assertTrue(decision('apps/api/src/ledger.ts', e))

    def test_auth_security_failure_blocks(self):
        with patch.dict('governance.PROFILES', {'auth': ('privilege escalation', 'session', 'CSRF')}):
            e = copy.deepcopy(EVIDENCE)
            e['passedCases'] += ['privilege escalation', 'session']
            self.assertTrue(decision('apps/api/src/auth.ts', e))

    def test_disabled_integration_scaffold_is_exact_content_and_test_bound(self):
        from governance import DISABLED_SCAFFOLD_SHA256
        e = copy.deepcopy(EVIDENCE)
        e['disabledScaffoldHash'] = DISABLED_SCAFFOLD_SHA256
        e['passedCases'].append('external effects including AI are disabled')
        self.assertEqual(decision('packages/integrations/src/index.ts', e), [])
        self.assertEqual(auto_merge.eligible(REPO_NAME, P, R, REPO, FILES + ['packages/integrations/src/index.ts', 'packages/integrations/tsconfig.build.json'], W, BASE, R, JOBS, e), [])
        e['disabledScaffoldHash'] = 'changed'
        self.assertTrue(decision('packages/integrations/src/index.ts', e))
        e['disabledScaffoldHash'] = DISABLED_SCAFFOLD_SHA256
        self.assertTrue(decision('packages/integrations/src/client.ts', e))

    def test_zero_skipped_failed_missing_and_stale_evidence(self):
        for suite in ('unit', 'integration', 'fault', 'e2e'):
            for field, value in (('passed', 0), ('passed', True), ('failed', 1), ('skipped', 1)):
                e = copy.deepcopy(EVIDENCE)
                e['suites'][suite][field] = value
                self.assertTrue(verify_evidence(e, SHA, BASE, 2, []))
        for field, value in (('head', BASE), ('base', SHA), ('pr', 9), ('version', 2)):
            self.assertTrue(verify_evidence(dict(EVIDENCE, **{field:value}), SHA, BASE, 2, []))
        self.assertTrue(verify_evidence({}, SHA, BASE, 2, []))

    def test_waiting_is_not_permission(self):
        c = classify(FILES)
        self.assertTrue(waiting(dict(P, draft=True), c))
        self.assertTrue(auto_merge.eligible(REPO_NAME, dict(P, draft=True), R, REPO, FILES, W, BASE, R, JOBS, EVIDENCE))
        for p in ('.github/workflows/pr-ci.yml', 'scripts/auto_merge.py', 'package.json',
                  'vitest.config.ts', 'tests/fault/database.test.ts'):
            self.assertEqual(classify([p])['tier'], 'C')
            self.assertFalse(waiting(P, classify([p])))
        self.assertEqual(classify(['tests/unit/new.test.ts'], ['tests/unit/new.test.ts'])['tier'], 'A')

    def test_completion_is_explicit_and_dev_bound(self):
        e = {'completion':dict.fromkeys(COMPLETE_KEYS, True) | {'dev':'DEV-03'}}
        self.assertTrue(complete(e, 'DEV-03'))
        self.assertFalse(complete(e, 'DEV-04'))
        e['completion']['security'] = 'true'
        self.assertFalse(complete(e, 'DEV-03'))
        self.assertFalse(complete({}, 'DEV-03'))

    def test_conflict_stale_current_ci_fork_skipped_step(self):
        for pr, run, base in ((dict(P, mergeable=False), R, BASE),
                              (P, dict(R, head_sha=SHA), BASE),
                              (P, dict(R, conclusion='failure'), BASE),
                              (P, R, SHA)):
            self.assertTrue(auto_merge.eligible(REPO_NAME, pr, run, REPO, FILES, W, base, R, JOBS, EVIDENCE))
        jobs = copy.deepcopy(JOBS)
        jobs[0]['steps'][0]['conclusion'] = 'skipped'
        self.assertTrue(auto_merge.eligible(REPO_NAME, P, R, REPO, FILES, W, BASE, R, jobs, EVIDENCE))

    def test_final_snapshot_races_and_holds(self):
        self.assertTrue(auto_merge.snapshot_current(P, P, BASE, BASE))
        for current in (dict(P, head={'sha':BASE}), dict(P, draft=True),
                        dict(P, labels=[{'name':'hold'}])):
            self.assertFalse(auto_merge.snapshot_current(P, current, BASE, BASE))
        self.assertFalse(auto_merge.snapshot_current(P, P, BASE, SHA))

    def test_final_snapshot_rejects_title_base_branch_author_and_source_edits(self):
        candidates = [dict(P, title='[DEV-04] Edited'), dict(P, base={'ref':'another-branch'}),
                      dict(P, user={'login':'another-user'})]
        for key, value in (('ref','dev/dev-03-renamed'), ('repo',{'full_name':'fork/WMS'})):
            current = copy.deepcopy(P)
            current['head'][key] = value
            candidates.append(current)
        for current in candidates:
            self.assertFalse(auto_merge.snapshot_current(P, current, BASE, BASE))

    def test_real_report_collector_rejects_failure(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root/'test-results').mkdir()
            (root/'package.json').write_text('{}')
            for name in ('unit', 'integration', 'fault'):
                report = {'success':True,'numPassedTests':1,'numFailedTests':0,'numPendingTests':0,
                          'numTotalTests':1,'testResults':[{'assertionResults':[{'title':'actual case','status':'passed'}]}]}
                (root/f'test-results/{name}.json').write_text(json.dumps(report))
            (root/'test-results/e2e.json').write_text(json.dumps({'stats':{'expected':1,'unexpected':0,'flaky':0,'skipped':0}}))
            e = collect(root, SHA, BASE, 2)
            self.assertEqual(verify_evidence(e, SHA, BASE, 2, []), [])
            self.assertFalse(complete(e, 'DEV-03'))
            report['numPendingTests'] = 1
            (root/'test-results/fault.json').write_text(json.dumps(report))
            with self.assertRaises(ValueError):
                collect(root, SHA, BASE, 2)


class ControllerIntegrationTests(unittest.TestCase):
    def run_controller(self, draft=False, race=None, control=False):
        pr = copy.deepcopy(P)
        pr['draft'] = draft
        e = copy.deepcopy(EVIDENCE)
        e['completion'] = dict.fromkeys(COMPLETE_KEYS, True) | {'dev':'DEV-03'}
        calls = []
        pr_reads = 0
        def fake_api(repo, path, **kw):
            nonlocal pr_reads
            calls.append((path, kw))
            if path == '': return REPO
            if path == 'actions/workflows/independent-verification.yml': return W
            if path == 'actions/runs/123': return R
            if path.startswith('actions/workflows/independent-verification.yml/runs'): return {'workflow_runs':[R]}
            if path.startswith('pulls/2/files'):
                return [{'filename':'.github/workflows/pr-ci.yml' if control else FILES[0]}, {'filename':FILES[1]}]
            if path == 'actions/runs/123/jobs?per_page=100': return {'jobs':JOBS,'total_count':1}
            if path == 'branches/main': return {'commit':{'sha': SHA if race == 'base' and pr_reads >= 2 else BASE}}
            if path == 'pulls/2/merge': return {'merged':True,'sha':'merged'}
            if path == 'pulls/2':
                pr_reads += 1
                result = copy.deepcopy(pr)
                if pr_reads >= 3: result['draft'] = False
                if race == 'head' and pr_reads >= 2: result['head']['sha'] = BASE
                return result
            raise AssertionError(path)
        with patch('sys.argv', ['auto_merge.py','--repo',REPO_NAME,'--run-id','123']), \
             patch.object(auto_merge, 'api', fake_api), \
             patch.object(auto_merge, 'evidence_for', return_value=e), \
             patch.object(auto_merge, 'quality_errors', return_value=[]), \
             patch.object(auto_merge.subprocess, 'run') as command:
            try:
                result = auto_merge.main()
            except SystemExit:
                result = 1
        return result, calls, command

    def test_verified_ready_and_merge_sequence(self):
        result, calls, cmd = self.run_controller(draft=True)
        self.assertEqual(result, 0)
        cmd.assert_called_once_with(['gh','pr','ready','2','--repo',REPO_NAME], check=True)
        mutations = [x for x in calls if x[1].get('method') == 'PUT']
        self.assertEqual(len(mutations), 1)
        self.assertEqual(mutations[0][1]['fields']['sha'], SHA)

    def test_main_or_head_update_never_mutates(self):
        for race in ('head', 'base'):
            result, calls, cmd = self.run_controller(draft=True, race=race)
            self.assertEqual(result, 1)
            self.assertFalse(any(x[1].get('method') == 'PUT' for x in calls))
            cmd.assert_not_called()

    def test_control_ready_and_merge_after_independent_verification(self):
        result, calls, cmd = self.run_controller(draft=True, control=True)
        self.assertEqual(result, 0)
        self.assertTrue(any(x[1].get('method') == 'PUT' for x in calls))
        cmd.assert_called_once()

    def test_artifact_zip_is_data_only(self):
        def archive(name):
            buf = io.BytesIO()
            with zipfile.ZipFile(buf,'w') as z: z.writestr(name, json.dumps(EVIDENCE))
            return buf.getvalue()
        metadata = {'total_count':1,'artifacts':[{'id':1,'name':'wms-merge-evidence','size_in_bytes':300}]}
        with patch.object(auto_merge,'api', return_value=metadata), patch.object(auto_merge.subprocess,'run') as run:
            run.return_value.stdout = archive('../evil.py')
            with self.assertRaises(ValueError): auto_merge.evidence_for(REPO_NAME, 123)
            run.return_value.stdout = archive('merge-evidence.json')
            self.assertEqual(auto_merge.evidence_for(REPO_NAME, 123), EVIDENCE)
