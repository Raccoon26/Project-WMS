#!/usr/bin/env python3
"""Produce data-only proof from real runner reports; no skipped/zero tests."""
import json
import os
from pathlib import Path
from governance import verify_evidence


def collect(root, head, base, number):
    suites, cases = {}, []
    application = (root/'package.json').exists()
    if not application:
        policy = json.loads((root/'test-results/policy.json').read_text())
        e = {'version':1, 'head':head, 'base':base, 'pr':number, 'application':False,
             'suites':{'policy':policy}, 'passedCases':[],
             'completion':json.loads((root/'docs/automation-completion.json').read_text()) if (root/'docs/automation-completion.json').exists() else {}}
        if verify_evidence(e, head, base, number, []):
            raise ValueError('Policy tests missing/zero/failed/skipped')
        return e
    for name in ('unit', 'integration', 'fault'):
        r = json.loads((root / f'test-results/{name}.json').read_text())
        if not r.get('success') or r.get('numTodoTests'):
            raise ValueError('Runner did not succeed: ' + name)
        suites[name] = {'passed': r['numPassedTests'], 'failed': r['numFailedTests'],
                        'skipped': r['numPendingTests']}
        if r['numTotalTests'] != r['numPassedTests']:
            raise ValueError('Not every test passed: ' + name)
        for file in r['testResults']:
            for case in file['assertionResults']:
                if case['status'] != 'passed':
                    raise ValueError('Non-passing case')
                cases.append(case['title'])
    r = json.loads((root / 'test-results/e2e.json').read_text())['stats']
    suites['e2e'] = {'passed': r['expected'], 'failed': r['unexpected'] + r['flaky'],
                     'skipped': r['skipped']}
    completion_path = root / 'docs/automation-completion.json'
    evidence = {'version': 1, 'head': head, 'base': base, 'pr': number,
                'application':True, 'suites': suites, 'passedCases': cases,
                'completion': json.loads(completion_path.read_text()) if completion_path.exists() else {}}
    errors = verify_evidence(evidence, head, base, number, [])
    if errors:
        raise ValueError('; '.join(errors))
    return evidence


if __name__ == '__main__':
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    source = payload.get('workflow_run')
    event = source['pull_requests'][0] if source else payload['pull_request']
    result = collect(Path.cwd(), event['head']['sha'], event['base']['sha'], event['number'])
    if source:
        result.update(sourceRunId=source['id'], sourceRunAttempt=source.get('run_attempt', 1),
                      independentRunId=int(os.environ['GITHUB_RUN_ID']),
                      independentRunAttempt=int(os.environ['GITHUB_RUN_ATTEMPT']))
    Path('test-results/merge-evidence.json').write_text(json.dumps(result))
