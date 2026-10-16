"""Actual catalog evidence contract negatives, not live business-engine tests."""
import copy
import unittest
from governance import classify, PROFILES, verify_evidence
from test_auto_merge import EVIDENCE, SHA, BASE

class CatalogGovernanceTests(unittest.TestCase):
    def test_catalog_module_is_separate_from_unimplemented_inventory(self):
        for path in ('apps/api/src/catalog/service.ts','apps/web/src/catalog.tsx','packages/db/src/catalog-schema.ts','packages/domain/src/catalog.ts'):
            c=classify([path])
            self.assertIn('catalog',c['profiles'])
            self.assertNotIn('inventory',c['profiles'])
        for path in ('apps/api/src/inventory/ledger.ts','apps/api/src/outbound/commands.ts'):
            self.assertIn('inventory',classify([path])['profiles'])

    def test_missing_catalog_case_fails_and_complete_real_runner_cases_pass(self):
        e=copy.deepcopy(EVIDENCE)
        self.assertTrue(verify_evidence(e,SHA,BASE,2,['catalog']))
        e['passedCases']+=list(PROFILES['catalog'])
        self.assertEqual(verify_evidence(e,SHA,BASE,2,['catalog']),[])
        for case in PROFILES['catalog']:
            changed=copy.deepcopy(e)
            changed['passedCases'].remove(case)
            self.assertTrue(verify_evidence(changed,SHA,BASE,2,['catalog']))

    def test_catalog_does_not_satisfy_inventory_contract(self):
        e=copy.deepcopy(EVIDENCE)
        e['passedCases']+=list(PROFILES['catalog'])
        self.assertTrue(verify_evidence(e,SHA,BASE,2,['inventory']))
