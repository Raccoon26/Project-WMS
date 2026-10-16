#!/usr/bin/env python3
"""Synthetic specification fixtures. Not real inventory-engine test results."""
import argparse
import json
import uuid

CATEGORIES = ('normal', 'out_of_stock', 'high_sales', 'low_stock', 'external_only',
              'fba', 'rsl', 'distributed', 'reserved', 'in_transit', 'inactive', 'different_mapping')
NAMESPACE = uuid.UUID('69270e20-2032-4611-ae12-76c569726e31')


def generate(count=60):
    if count < 1:
        raise ValueError('count must be positive')
    rows = []
    for i in range(count):
        category = CATEGORIES[i % len(CATEGORIES)]
        goods = {'external': 100, 'fba': 20, 'rsl': 10}
        reserved = {'external': 0, 'fba': 0, 'rsl': 0}
        if category == 'out_of_stock':
            goods = dict.fromkeys(goods, 0)
        elif category == 'low_stock':
            goods = dict.fromkeys(goods, 1)
        elif category == 'external_only':
            goods = {'external': 100, 'fba': 0, 'rsl': 0}
        elif category == 'fba':
            goods = {'external': 0, 'fba': 80, 'rsl': 0}
        elif category == 'rsl':
            goods = {'external': 0, 'fba': 0, 'rsl': 80}
        elif category == 'reserved':
            reserved['external'] = 30
        sku = f'TEST-SKU-{i + 1:04d}'
        rows.append({'id': str(uuid.uuid5(NAMESPACE, sku)), 'sku': sku, 'category': category,
                     'status': ('discontinued' if (i // len(CATEGORIES)) % 2 else 'inactive') if category == 'inactive' else 'active',
                     'mappings': {'amazon': f'TEST-AMZ-{i + 1:04d}', 'rakuten': f'TEST-RKT-{i + 1:04d}'},
                     'good': goods, 'reserved': reserved,
                     'expected_available': {w: goods[w] - reserved[w] for w in goods},
                     'in_transit': 15 if category == 'in_transit' else 0,
                     'daily_sales': '15.00' if category == 'high_sales' else '1.00'})
    return {'synthetic': True, 'schema_version': 1, 'skus': rows}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--count', type=int, default=60)
    a = p.parse_args()
    print(json.dumps(generate(a.count), ensure_ascii=False, indent=2))
