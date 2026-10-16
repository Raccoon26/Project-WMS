#!/usr/bin/env python3
"""Collect concatenated gh --paginate JSON pages; compatible with gh 2.46."""
import json
import sys


def pages(data):
    decoder = json.JSONDecoder()
    result = []
    remaining = data.lstrip()
    while remaining:
        page, end = decoder.raw_decode(remaining)
        if not isinstance(page, (list, dict)):
            raise ValueError('Expected JSON object/array page')
        result.append(page)
        remaining = remaining[end:].lstrip()
    if not result:
        raise ValueError('Empty API response')
    return result


if __name__ == '__main__':
    print(json.dumps(pages(sys.stdin.read())))
