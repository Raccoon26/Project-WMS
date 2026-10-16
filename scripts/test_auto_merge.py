import copy
import unittest
from auto_merge import eligible, REQUIRED_STEPS
from governance import PROFILES

REPO_NAME = 'Raccoon26/Project-WMS'
SHA = 'a'*40
BASE = 'b'*40
P = {'number':2, 'state':'open','draft':False, 'title':'[DEV-03] Catalog',
     'head':{'sha':SHA,'ref':'dev/dev-03-catalog','repo':{'full_name':REPO_NAME}},
     'base':{'ref':'main'},'user':{'login':'Raccoon26'}, 'mergeable':True,
     'mergeable_state':'clean','changed_files':2,'labels':[],
     'requested_reviewers':[], 'requested_teams':[]}
W = {'id':56}
R = {'id':123,'workflow_id':56,'event':'workflow_run','status':'completed',
     'conclusion':'success','name':'WMS Independent Verification','path':'.github/workflows/independent-verification.yml',
     'head_sha':BASE,'head_repository':{'id':100},'pull_requests':[{'number':2,'head':{'sha':SHA,'repo':{'id':100}},'base':{'ref':'main','sha':BASE}}]}
REPO = {'id':100,'default_branch':'main'}
JOBS = [{'name':'WMS Independent Gate','status':'completed','conclusion':'success',
         'steps':[{'name':s,'status':'completed','conclusion':'success'} for s in REQUIRED_STEPS]}]
EVIDENCE = {'version':1,'application':True,'independentRunId':123,'independentRunAttempt':1,'head':SHA,'base':BASE,'pr':2,
            'suites':{s:{'passed':1,'failed':0,'skipped':0} for s in ('unit','integration','fault','e2e')},
            'passedCases':list(PROFILES['migration'])}
FILES = ['apps/web/src/components/Badge.tsx', 'docs/dev-reports/DEV-03.md']

def check(pr=P, run=R, paths=FILES, latest=R, jobs=JOBS, main=BASE, repo=REPO):
    return eligible(REPO_NAME,pr,run,repo,paths,W,main,latest,jobs,EVIDENCE)

class AutoMergeTests(unittest.TestCase):
    def test_safe_dev_can_merge(self):
        self.assertEqual(check(), [])
    def test_control_paths_eligible_after_independent_ci(self):
        for path in ('.github/workflows/pr-ci.yml', 'scripts/pr_policy.py', 'AGENTS.md'):
            self.assertEqual(check(paths=FILES+[path]), [])

    def test_draft_and_stale(self):
        self.assertTrue(check(pr=dict(P,draft=True)))
        self.assertTrue(check(run=dict(R,head_sha='c'*40)))
        self.assertTrue(check(latest=dict(R,id=999)))
        self.assertTrue(check(main='c'*40))
    def test_untrusted_cis(self):
        for k,v in [('event','workflow_dispatch'),('status','queued'),('conclusion','failure'),
                    ('path','malicious.yml'),('workflow_id',2),('name','Wrong')]:
            with self.subTest(k=k):
                self.assertTrue(check(run=dict(R,**{k:v})))
    def test_job_skips_fail(self):
        self.assertTrue(check(jobs=[]))
        self.assertTrue(check(jobs=[dict(JOBS[0],conclusion='skipped')]))
        self.assertTrue(check(jobs=JOBS+[{'name':'Other','status':'completed','conclusion':'failure'}]))
    def test_head_and_base_identity(self):
        x=copy.deepcopy(R)
        x['head_repository']['id']=999
        self.assertTrue(check(run=x))
        x=copy.deepcopy(P)
        x['head']['repo']['full_name']='evil/repo'
        self.assertTrue(check(pr=x))
    def test_hold_and_review(self):
        self.assertTrue(check(pr=dict(P,labels=[{'name':'hold'}])))
        self.assertEqual(check(pr=dict(P,requested_reviewers=[{'login':'someone'}])), [])
        self.assertTrue(check(pr=dict(P,user={'login':'stranger'})))
    def test_title_and_policy(self):
        self.assertTrue(check(pr=dict(P,title='[DEV-04] Wrong')))
        self.assertTrue(check(paths=['README.md']))
        self.assertTrue(check(paths=FILES+['.env']))

if __name__ == '__main__':
    unittest.main()
