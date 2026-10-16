#!/usr/bin/env python3
"""Actual unittest results, including fail/skip/zero rejection."""
import json
from pathlib import Path
import unittest

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover('scripts', pattern='test_*.py')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    output = Path('test-results/policy.json')
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({'passed':result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),
                                  'failed':len(result.failures)+len(result.errors), 'skipped':len(result.skipped)}))
    raise SystemExit(0 if result.testsRun > 0 and result.wasSuccessful() and not result.skipped else 1)
