import copy
import unittest
from auto_merge import eligible

REPO_NAME = 'Raccoon26/Project-WMS'
SHA = 'a'*40
BASE = 'b'*40
P = {'number':2, 'state':'open','draft':False, 'title':'[DEV-03] Catalog',
     'head':{'sha':SHA,'ref':'dev/dev-03-catalog','repo':{'full_name':REPO_NAME}},
     'base':{'ref':'main'},'user':{'login':'Raccoon26'}, 'mergeable':True,
     'mergeable_state':'clean','changed_files':2,'labels':[],
     'requested_reviewers':[], 'requested_teams':[]}
W = {'id':56}
R = {'id':123,'workflow_id':56,'event':'pull_request','status':'completed',
     'conclusion':'success','name':'WMS PR CI','path':'.github/workflows/pr-ci.yml',
     'head_sha':SHA,'pull_requests':[{'number':2,'head':{'sha':SHA,'repo':{'id':100}},'base':{'ref':'main','sha':BASE}}]}
REPO = {'id':100,'default_branch':'main'}
JOBS = [{'name':'WMS Quality Gate','status':'completed','conclusion':'success'}]
FILES = ['apps/web/src/components/Badge.tsx', 'docs/dev-reports/DEV-03.md']

def check(pr=P, run=R, paths=FILES, latest=R, jobs=JOBS, main=BASE, repo=REPO):
    return eligible(REPO_NAME,pr,run,repo,paths,W,main,latest,jobs)

class AutoMergeTests(unittest.TestCase):
    def test_safe_dev_can_merge(self):
        self.assertEqual(check(), [])
    def test_control_paths_never_merge(self):
        for path in ('.github/workflows/pr-ci.yml','scripts/pr_policy.py','DATA_MODEL.md',
                     'apps/api/src/inventory/engine.ts','apps/web/src/components/authPanel.tsx',
                     'packages/db/migrations/0001.sql'):
            with self.subTest(path=path):
                self.assertTrue(check(paths=FILES+[path]))
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
        x['pull_requests'][0]['head']['repo']['id']=999
        self.assertTrue(check(run=x))
        x=copy.deepcopy(P)
        x['head']['repo']['full_name']='evil/repo'
        self.assertTrue(check(pr=x))
    def test_hold_and_review(self):
        self.assertTrue(check(pr=dict(P,labels=[{'name':'hold'}])))
        self.assertTrue(check(pr=dict(P,requested_reviewers=[{'login':'someone'}])))
        self.assertTrue(check(pr=dict(P,user={'login':'stranger'})))
    def test_title_and_policy(self):
        self.assertTrue(check(pr=dict(P,title='[DEV-04] Wrong')))
        self.assertTrue(check(paths=['README.md']))
        self.assertTrue(check(paths=FILES+['.env']))

if __name__ == '__main__':
    unittest.main()
