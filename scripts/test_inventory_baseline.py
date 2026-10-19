import json
from pathlib import Path
import tempfile
import unittest
from independent_verify import inventory_preflight

class InventoryBaselineTests(unittest.TestCase):
    def fixture(self, root, data):
        (root/'scripts').mkdir(exist_ok=True)
        (root/'scripts/verification-inventory.json').write_text(json.dumps(data))
    def test_new_registry_is_test_only(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            root, base = Path(a), Path(b)
            self.fixture(root, {'apps/api/src/inventory/service.ts':'unsafe overlay'})
            self.assertTrue(inventory_preflight(root,base))
    def test_old_assertions_cannot_disappear(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            root, base = Path(a), Path(b)
            self.fixture(base, {'tests/inventory.test.ts':'assert invariant'})
            self.fixture(root, {})
            self.assertTrue(inventory_preflight(root,base))
    def test_additive_assertions_and_test_seed_allowed(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            root, base = Path(a), Path(b)
            self.fixture(base, {'tests/inventory.test.ts':'assert invariant'})
            self.fixture(root, {'tests/inventory.test.ts':'assert invariant\nmore assertions','scripts/inventory-fixture.ts':'test seed'})
            (root/'tests').mkdir()
            (root/'tests/inventory.test.ts').write_text('assert invariant\nmore assertions')
            (root/'scripts/inventory-fixture.ts').write_text('test seed')
            self.assertEqual(inventory_preflight(root,base),[])
    def test_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            root, base = Path(a), Path(b)
            self.fixture(root, {'tests/../apps/api.ts':'unsafe'})
            self.assertTrue(inventory_preflight(root,base))
