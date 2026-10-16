import json
import tempfile
import unittest
from pathlib import Path
from generate_sku_fixture import generate, CATEGORIES
from check_public_files import scan, suspicious
from validate_docs import validate, ROOT


class SpecificationTests(unittest.TestCase):
    def test_fixture_reproducible_and_over_minimum(self):
        saved = json.loads((ROOT / 'docs/fixtures/sku-scenarios.json').read_text())
        self.assertEqual(saved, generate(60))
        self.assertGreaterEqual(sum(x['status'] == 'active' for x in saved['skus']), 50)
        self.assertEqual({x['status'] for x in saved['skus']}, {'active', 'inactive', 'discontinued'})
        for count in (50, 60, 120):
            rows = generate(count)['skus']
            self.assertEqual(len({x['id'] for x in rows}), count)
            self.assertEqual(len({x['sku'] for x in rows}), count)
            self.assertEqual({x['category'] for x in rows}, set(CATEGORIES))
            for x in rows:
                self.assertNotIn(x['sku'], x['mappings'].values())
                for warehouse, qty in x['good'].items():
                    self.assertGreaterEqual(qty, x['reserved'][warehouse])
                    self.assertEqual(x['expected_available'][warehouse], qty - x['reserved'][warehouse])
        with self.assertRaises(ValueError):
            generate(0)

    def test_document_links_and_trace_structure(self):
        self.assertEqual(validate(), [])

    def test_broken_link_and_missing_documents_fail(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / 'README.md').write_text('[broken](absent.md)')
            errors = validate(root)
            self.assertTrue(any('broken local link' in x for x in errors))
            self.assertTrue(any('Missing DATA_MODEL.md' == x for x in errors))

    def test_secret_detection_does_not_print_values(self):
        examples = [(b'gh' + b'p_' + b'x' * 36), (b'AK' + b'IA' + b'X' * 16),
                    (b'-----BEGIN ' + b'PRIVATE KEY-----'),
                    (b'123456789:' + b'a' * 35)]
        self.assertFalse(suspicious(b'no credentials; only placeholders'))
        for value in examples:
            self.assertTrue(suspicious(value))
            with tempfile.TemporaryDirectory() as t:
                root = Path(t)
                (root / 'example.txt').write_bytes(value)
                errors = scan(root, ['example.txt'])
                self.assertTrue(errors)
                self.assertNotIn(value.decode(), str(errors))

    def test_public_files_reject_symlink_and_dump(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / 'file.txt').write_text('synthetic')
            (root / 'link').symlink_to(root / 'file.txt')
            (root / 'x.dump').write_text('synthetic')
            self.assertEqual(len(scan(root, ['link', 'x.dump'])), 2)

class ApplicationGateTests(unittest.TestCase):
    def test_source_without_manifest_rejected(self):
        from check_application import inspect
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            self.assertFalse(inspect(root, ['README.md']))
            with self.assertRaises(ValueError):
                inspect(root, ['apps/api/main.ts'])

    def test_app_requires_actual_distinct_test_entrypoints(self):
        from check_application import inspect, REQUIRED
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            scripts = {n: 'runner' for n in REQUIRED}
            (root / 'package.json').write_text(json.dumps({'scripts': scripts}))
            with self.assertRaises(ValueError):
                inspect(root, ['app.ts'])
            (root / 'pnpm-lock.yaml').touch()
            self.assertFalse(inspect(root, ['app.ts']))
            with self.assertRaises(ValueError):
                inspect(root, ['packages/domain/src/inventory/post.ts'])
            scripts['test:invariants'] = 'runner'
            (root / 'package.json').write_text(json.dumps({'scripts': scripts}))
            self.assertTrue(inspect(root, ['packages/domain/src/inventory/post.ts']))
