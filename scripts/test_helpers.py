"""Integration tests execute actual shell helpers in an isolated repo with fake gh.
No real PR/merge/push side effects. Fake API and failure cases assert gh merge calls.
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from test_merge_gate import REPO, PR, PROTECTION, PATHS, RUNS

ROOT = Path(__file__).resolve().parents[1]


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'scripts').mkdir()
        for name in ('enable-safe-auto-merge.sh', 'merge_gate.py', 'pr_policy.py', 'slurp_json.py', 'new-dev-branch.sh'):
            shutil.copy(ROOT / 'scripts' / name, self.root / 'scripts' / name)
        subprocess.run(['git', 'init', '-q'], cwd=self.root, check=True)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        stub = self.bin / 'gh'
        stub.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
root=Path(os.environ['FAKE_ROOT']);a=sys.argv[1:]
with (root/'calls.jsonl').open('a') as f:f.write(json.dumps(a)+'\\n')
if a[:2]==['repo','view']:print('Raccoon26/Project-WMS');sys.exit(0)
if a[:2]==['pr','merge']:sys.exit(0)
if a[0]!='api':sys.exit(91)
u=a[1]
if u.endswith('/protection'):
 if (root/'deny').exists():sys.exit(1)
 name='protection'
elif u.endswith('/files?per_page=100'):name='files'
elif '/check-runs?' in u:name='checks'
elif '/pulls/' in u:
 marker=root/'pr_read'
 name='pr_after' if marker.exists() else 'pr'
 marker.touch()
else:name='repo'
data=json.loads((root/(name+'.json')).read_text())
if name in {'files','checks'}:
 for page in data:print(json.dumps(page))
else:print(json.dumps(data))
''')
        stub.chmod(0o755)
        self.env = dict(os.environ, FAKE_ROOT=str(self.root), PATH=str(self.bin) + os.pathsep + os.environ['PATH'])
        self.pr = dict(PR, changed_files=len(PATHS))
        for name, data in [('repo', REPO), ('pr', self.pr), ('pr_after', self.pr),
                           ('protection', PROTECTION),
                           ('files', [[{'filename': p, 'status': 'modified'} for p in PATHS]]),
                           ('checks', [{'check_runs': RUNS}])]:
            self.write(name, data)

    def write(self, name, data):
        (self.root / (name + '.json')).write_text(json.dumps(data))

    def run_helper(self, number='3'):
        return subprocess.run(['bash', 'scripts/enable-safe-auto-merge.sh', number],
                              cwd=self.root, env=self.env, capture_output=True, text=True)

    def calls(self):
        p = self.root / 'calls.jsonl'
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def test_verified_snapshot_requests_head_bound_merge(self):
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        merge = [x for x in self.calls() if x[:2] == ['pr', 'merge']]
        self.assertEqual(len(merge), 1)
        self.assertIn('--match-head-commit', merge[0])
        self.assertIn(PR['head']['sha'], merge[0])
        self.assertNotIn('--admin', merge[0])

    def test_permission_denial_never_merges(self):
        (self.root / 'deny').touch()
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertFalse(any(x[:2] == ['pr', 'merge'] for x in self.calls()))

    def test_head_race_never_merges(self):
        import copy
        changed = copy.deepcopy(self.pr)
        changed['head']['sha'] = 'b' * 40
        self.write('pr_after', changed)
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertFalse(any(x[:2] == ['pr', 'merge'] for x in self.calls()))

    def test_incomplete_file_response_never_merges(self):
        self.write('files', [[]])
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertFalse(any(x[:2] == ['pr', 'merge'] for x in self.calls()))

    def test_bad_pr_number_has_no_api_calls(self):
        self.assertNotEqual(self.run_helper('3;false').returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_existing_local_dev_branch_is_reused(self):
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                        'commit', '--allow-empty', '-qm', 'seed'], cwd=self.root, check=True)
        # Keep checkout clean without including helper files in commit.
        (self.root / '.git' / 'info' / 'exclude').write_text('*\n')
        branch = 'dev/dev-03-existing'
        subprocess.run(['git', 'branch', branch], cwd=self.root, check=True)
        result = subprocess.run(['bash', 'scripts/new-dev-branch.sh', branch], cwd=self.root,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(subprocess.check_output(['git', 'branch', '--show-current'], cwd=self.root, text=True).strip(), branch)

class CreatePRTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'docs/dev-reports').mkdir(parents=True)
        (self.root / 'docs/dev-reports/DEV-03.md').write_text('synthetic report')
        shutil.copy(ROOT / 'scripts/create-dev-pr.sh', self.root / 'scripts/create-dev-pr.sh')
        # Isolate PR control flow from validation; validation is exercised independently.
        (self.root / 'scripts/check_public_files.py').write_text('')
        (self.root / 'scripts/test_control_fixture.py').write_text(
            'import unittest\nfrom pathlib import Path\n'
            'class Fixture(unittest.TestCase):\n'
            ' def test_report_available(self):\n'
            '  self.assertTrue(Path("docs/dev-reports/DEV-03.md").is_file())\n')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        git = self.bin / 'git'
        git.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['FAKE_ROOT']);a=sys.argv[1:]
with (r/'git-calls').open('a') as f:f.write(json.dumps(a)+'\\n')
if a==['rev-parse','--show-toplevel']:print(r)
elif a==['branch','--show-current']:print('dev/dev-03-catalog')
elif a==['status','--porcelain']:pass
elif a[:1] in (['fetch'],['push']):pass
else:sys.exit(90)
''')
        gh = self.bin / 'gh'
        gh.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['FAKE_ROOT']);a=sys.argv[1:]
with (r/'gh-calls').open('a') as f:f.write(json.dumps(a)+'\\n')
if a[:2]==['repo','view']:print('Raccoon26/Project-WMS')
elif a[:2]==['pr','list']:
 if os.environ['PR_STATE']=='denied':sys.exit(1)
 print(json.dumps([] if os.environ['PR_STATE']=='absent' else [{'state':os.environ['PR_STATE']}]))
elif a[:2] in (['pr','create'],['pr','view']):pass
else:sys.exit(90)
''')
        git.chmod(0o755)
        gh.chmod(0o755)
        self.env = dict(os.environ, FAKE_ROOT=str(self.root), PATH=str(self.bin) + os.pathsep + os.environ['PATH'])

    def run_create(self, state):
        self.env['PR_STATE'] = state
        return subprocess.run(['bash', 'scripts/create-dev-pr.sh', 'DEV-03', 'Synthetic'],
                              cwd=self.root, env=self.env, capture_output=True, text=True)

    def calls(self, name):
        p = self.root / (name + '-calls')
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def test_open_pr_reused_without_creation(self):
        r = self.run_create('OPEN')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(any(x[:2] == ['pr', 'create'] for x in self.calls('gh')))
        self.assertEqual(sum(x[:1] == ['push'] for x in self.calls('git')), 1)

    def test_absent_pr_created_once_as_draft(self):
        r = self.run_create('absent')
        self.assertEqual(r.returncode, 0, r.stderr)
        creates = [x for x in self.calls('gh') if x[:2] == ['pr', 'create']]
        self.assertEqual(len(creates), 1)
        self.assertIn('--draft', creates[0])
        self.assertFalse(any(x[:2] == ['pr', 'merge'] for x in self.calls('gh')))

    def test_denied_or_closed_queries_never_push_or_create(self):
        for state in ('denied', 'CLOSED', 'MERGED'):
            with self.subTest(state=state):
                for name in ('gh-calls', 'git-calls'):
                    (self.root / name).unlink(missing_ok=True)
                self.assertNotEqual(self.run_create(state).returncode, 0)
                self.assertFalse(any(x[:2] == ['pr', 'create'] for x in self.calls('gh')))
                self.assertFalse(any(x[:1] == ['push'] for x in self.calls('git')))
