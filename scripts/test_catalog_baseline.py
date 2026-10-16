"""Reject deleted catalog assertions, path traversal and implementation overlays."""
import json
from pathlib import Path
import tempfile
import unittest
from independent_verify import catalog_preflight

class CatalogBaselineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'root'
        self.base=Path(self.tmp.name)/'base'
        for p in (self.root,self.base):
            (p/'scripts').mkdir(parents=True)
            (p/'tests').mkdir()
            (p/'tests/catalog.test.ts').write_text('trusted assertions')
            (p/'scripts/verification-catalog.json').write_text(json.dumps({'tests/catalog.test.ts':'trusted assertions'}))

    def candidate(self,data):
        (self.root/'scripts/verification-catalog.json').write_text(json.dumps(data))

    def test_preserved_tests_and_additional_assertions_are_allowed(self):
        self.assertEqual(catalog_preflight(self.root,self.base),[])
        self.candidate({'tests/catalog.test.ts':'trusted assertions\nadditional tests'})
        self.assertEqual(catalog_preflight(self.root,self.base),[])

    def test_deleted_or_weakened_existing_catalog_assertions_fail(self):
        self.candidate({'tests/catalog.test.ts':'weakened'})
        self.assertTrue(catalog_preflight(self.root,self.base))
        self.candidate({})
        self.assertTrue(catalog_preflight(self.root,self.base))
        (self.root/'tests/catalog.test.ts').unlink()
        self.assertTrue(catalog_preflight(self.root,self.base))

    def test_registry_may_not_overlay_app_or_escape_test_paths(self):
        for path in ('apps/api/src/catalog/service.ts','scripts/auto_merge.py','tests/../apps/api.ts','/tmp/outside.ts'):
            self.candidate({path:'untrusted implementation'})
            self.assertTrue(catalog_preflight(self.root,self.base),path)

    def test_synthetic_seed_is_explicitly_allowed_and_size_is_bounded(self):
        self.candidate({'tests/catalog.test.ts':'trusted assertions','scripts/catalog-fixture.ts':'test-only importer'})
        self.assertEqual(catalog_preflight(self.root,self.base),[])
        (self.root/'scripts/verification-catalog.json').write_text(' '*(2*1024*1024+1))
        self.assertTrue(catalog_preflight(self.root,self.base))
