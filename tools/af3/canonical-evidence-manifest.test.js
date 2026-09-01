'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createCanonicalEvidenceManifest } = require('./canonical-evidence-manifest');

const A_HASH = 'a'.repeat(64);
const B_HASH = 'b'.repeat(64);

function descriptor(path = 'proof/item.txt', sha256 = A_HASH, bytes = 12) {
  return { path, sha256, bytes };
}

test('returns the exact canonical known-answer object in ASCII path order', () => {
  const result = createCanonicalEvidenceManifest([
    descriptor('z/file.txt', B_HASH, 7),
    descriptor('a/file.txt', A_HASH, 3),
  ]);

  assert.deepEqual(result, {
    schema_version: 'af3-evidence-manifest/v1',
    hash_algorithm: 'sha256',
    entry_count: 2,
    entries: [
      { path: 'a/file.txt', sha256: A_HASH, bytes: 3 },
      { path: 'z/file.txt', sha256: B_HASH, bytes: 7 },
    ],
    manifest_sha256: '407f96d6fcf81af938f697416324cb9fcf78913ab633ce2d279941cdb80c5b01',
  });
  assert.deepEqual(Object.keys(result), [
    'schema_version',
    'hash_algorithm',
    'entry_count',
    'entries',
    'manifest_sha256',
  ]);
  assert.deepEqual(Object.keys(result.entries[0]), ['path', 'sha256', 'bytes']);
});

test('produces deep-equal output for multiple input permutations', () => {
  const first = descriptor('A.txt', A_HASH, 1);
  const second = descriptor('a.txt', B_HASH, 2);
  const third = descriptor('a/0.txt', 'c'.repeat(64), 3);
  const expected = createCanonicalEvidenceManifest([first, second, third]);

  assert.deepEqual(createCanonicalEvidenceManifest([third, first, second]), expected);
  assert.deepEqual(createCanonicalEvidenceManifest([second, third, first]), expected);
  assert.deepEqual(expected.entries.map((entry) => entry.path), ['A.txt', 'a.txt', 'a/0.txt']);
});

test('does not mutate the caller array or entry objects', () => {
  const first = descriptor('z.txt', A_HASH, 5);
  const second = descriptor('a.txt', B_HASH, 9);
  const input = [first, second];
  const snapshot = JSON.parse(JSON.stringify(input));

  const result = createCanonicalEvidenceManifest(input);

  assert.deepEqual(input, snapshot);
  assert.strictEqual(input[0], first);
  assert.strictEqual(input[1], second);
  assert.notStrictEqual(result.entries, input);
  assert.notStrictEqual(result.entries[0], second);
});

test('changing any accepted descriptor field changes the manifest digest', () => {
  const original = createCanonicalEvidenceManifest([descriptor()]).manifest_sha256;
  const variants = [
    descriptor('proof/other.txt', A_HASH, 12),
    descriptor('proof/item.txt', B_HASH, 12),
    descriptor('proof/item.txt', A_HASH, 13),
  ];

  for (const variant of variants) {
    assert.notEqual(createCanonicalEvidenceManifest([variant]).manifest_sha256, original);
  }
});

test('rejects invalid top-level types and entry-count bounds', () => {
  for (const value of [null, undefined, {}, 'entry']) {
    assert.throws(() => createCanonicalEvidenceManifest(value), TypeError);
  }
  assert.throws(() => createCanonicalEvidenceManifest([]), RangeError);
  assert.throws(
    () => createCanonicalEvidenceManifest(Array.from({ length: 1001 }, (_, index) =>
      descriptor(`item-${index}.txt`),
    )),
    RangeError,
  );
});

test('rejects missing keys, extra keys, and non-object entries', () => {
  const missingBytes = { path: 'a.txt', sha256: A_HASH };
  const extraKey = { ...descriptor('a.txt'), note: 'not allowed' };

  for (const value of [missingBytes, extraKey, null, [], 'entry', 5]) {
    assert.throws(() => createCanonicalEvidenceManifest([value]), TypeError);
  }
});

test('rejects invalid path forms and duplicate paths', () => {
  const invalidPaths = [
    '',
    'a'.repeat(241),
    '/absolute.txt',
    'trailing/',
    'a//b.txt',
    './a.txt',
    'a/./b.txt',
    '../a.txt',
    'a/../b.txt',
    'a\\b.txt',
    'C:/a.txt',
    'space name.txt',
    'non-ascii-đ.txt',
  ];

  for (const path of invalidPaths) {
    assert.throws(
      () => createCanonicalEvidenceManifest([descriptor(path)]),
      { message: /path/ },
      path,
    );
  }
  assert.throws(
    () => createCanonicalEvidenceManifest([
      descriptor('same.txt', A_HASH, 1),
      descriptor('same.txt', B_HASH, 2),
    ]),
    { name: 'TypeError', message: /duplicates/ },
  );
});

test('rejects malformed SHA-256 values', () => {
  const invalidHashes = [
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    42,
    null,
  ];

  for (const sha256 of invalidHashes) {
    assert.throws(
      () => createCanonicalEvidenceManifest([descriptor('a.txt', sha256, 1)]),
      { name: 'TypeError', message: /sha256/ },
    );
  }
});

test('accepts byte-count boundaries and rejects invalid byte counts', () => {
  assert.equal(createCanonicalEvidenceManifest([descriptor('zero.txt', A_HASH, 0)]).entries[0].bytes, 0);
  assert.equal(
    createCanonicalEvidenceManifest([
      descriptor('max.txt', A_HASH, Number.MAX_SAFE_INTEGER),
    ]).entries[0].bytes,
    Number.MAX_SAFE_INTEGER,
  );

  const invalidBytes = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, '1', null];
  for (const bytes of invalidBytes) {
    assert.throws(
      () => createCanonicalEvidenceManifest([descriptor('a.txt', A_HASH, bytes)]),
      { message: /bytes/ },
    );
  }
  assert.throws(
    () => createCanonicalEvidenceManifest([
      descriptor('a.txt', A_HASH, Number.MAX_SAFE_INTEGER + 1),
    ]),
    { name: 'RangeError', message: /bytes/ },
  );
});
