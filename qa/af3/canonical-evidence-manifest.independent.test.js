'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const {
  createCanonicalEvidenceManifest,
} = require('../../tools/af3/canonical-evidence-manifest');

const ZERO_HASH = '0'.repeat(64);
const F_HASH = 'f'.repeat(64);
const PATTERN_HASH = '1234567890abcdef'.repeat(4);

function evidence(path, sha256 = PATTERN_HASH, bytes = 1) {
  return { path, sha256, bytes };
}

function compareAscii(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function independentOracle(input) {
  const entries = input
    .map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
    .sort(compareAscii);
  const body = {
    schema_version: 'af3-evidence-manifest/v1',
    hash_algorithm: 'sha256',
    entry_count: entries.length,
    entries,
  };
  const canonicalBytes = Buffer.from(JSON.stringify(body), 'utf8');

  return {
    body,
    canonicalBytes,
    manifestSha256: createHash('sha256').update(canonicalBytes).digest('hex'),
  };
}

test('matches an independent crypto oracle and hard-coded known answer', () => {
  const input = [
    evidence('z/receipt.json', F_HASH, 41),
    evidence('A/design.txt', ZERO_HASH, 0),
    evidence('a/source.js', PATTERN_HASH, Number.MAX_SAFE_INTEGER),
  ];
  const oracle = independentOracle(input);
  const actual = createCanonicalEvidenceManifest(input);

  assert.equal(oracle.canonicalBytes.length, 446);
  assert.equal(
    oracle.manifestSha256,
    '8e449ed89fac9a9dc1b160e6d6d6a79af35233ae699f85be6927d9972a863acc',
  );
  assert.deepEqual(actual, {
    ...oracle.body,
    manifest_sha256: oracle.manifestSha256,
  });
  assert.deepEqual(Object.keys(actual), [
    'schema_version',
    'hash_algorithm',
    'entry_count',
    'entries',
    'manifest_sha256',
  ]);
  assert.deepEqual(Object.keys(actual.entries[0]), ['path', 'sha256', 'bytes']);
});

test('is invariant across all permutations of a three-entry fixture', () => {
  const first = evidence('Z.txt', ZERO_HASH, 5);
  const second = evidence('a.txt', PATTERN_HASH, 6);
  const third = evidence('a/0.txt', F_HASH, 7);
  const permutations = [
    [first, second, third],
    [first, third, second],
    [second, first, third],
    [second, third, first],
    [third, first, second],
    [third, second, first],
  ];
  const expected = createCanonicalEvidenceManifest(permutations[0]);

  for (const permutation of permutations) {
    assert.deepEqual(createCanonicalEvidenceManifest(permutation), expected);
  }
  assert.deepEqual(
    expected.entries.map(({ path }) => path),
    ['Z.txt', 'a.txt', 'a/0.txt'],
  );
});

test('accepts the one-entry and 1000-entry count boundaries', () => {
  const one = [evidence('a', ZERO_HASH, 0)];
  const oneActual = createCanonicalEvidenceManifest(one);

  assert.equal(oneActual.entry_count, 1);
  assert.equal(oneActual.manifest_sha256, independentOracle(one).manifestSha256);

  const thousand = Array.from({ length: 1000 }, (_, index) =>
    evidence(`qa/bound-${String(999 - index).padStart(4, '0')}.txt`, F_HASH, index),
  );
  const thousandActual = createCanonicalEvidenceManifest(thousand);

  assert.equal(thousandActual.entry_count, 1000);
  assert.equal(thousandActual.entries.length, 1000);
  assert.equal(thousandActual.entries[0].path, 'qa/bound-0000.txt');
  assert.equal(thousandActual.entries[999].path, 'qa/bound-0999.txt');
  assert.equal(
    thousandActual.manifest_sha256,
    independentOracle(thousand).manifestSha256,
  );
});

test('accepts the path-length and byte-count value boundaries', () => {
  const accepted = [
    evidence('a', ZERO_HASH, 0),
    evidence('z'.repeat(240), F_HASH, Number.MAX_SAFE_INTEGER),
  ];
  const actual = createCanonicalEvidenceManifest(accepted);

  assert.equal(actual.entry_count, 2);
  assert.equal(actual.entries[0].bytes, 0);
  assert.equal(actual.entries[1].path.length, 240);
  assert.equal(actual.entries[1].bytes, Number.MAX_SAFE_INTEGER);
});

test('rejects traversal, absolute, drive, backslash, and other invalid paths', () => {
  const invalidPaths = [
    '',
    'x'.repeat(241),
    '/root/file.txt',
    'C:/Windows/file.txt',
    '\\\\server\\share\\file.txt',
    'folder\\file.txt',
    'folder/',
    './file.txt',
    'folder/./file.txt',
    '../file.txt',
    'folder/../file.txt',
    'folder//file.txt',
    'space name.txt',
    'non-ascii-đ.txt',
  ];

  for (const path of invalidPaths) {
    assert.throws(
      () => createCanonicalEvidenceManifest([evidence(path)]),
      { message: /path/ },
      `expected invalid path to fail closed: ${JSON.stringify(path)}`,
    );
  }
});

test('rejects duplicate canonical paths', () => {
  assert.throws(
    () => createCanonicalEvidenceManifest([
      evidence('same/path.txt', ZERO_HASH, 1),
      evidence('same/path.txt', F_HASH, 2),
    ]),
    { name: 'TypeError', message: /duplicate/ },
  );
});

test('rejects malformed SHA-256 and byte-count values', () => {
  const invalidHashes = [
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    64,
    null,
  ];
  for (const sha256 of invalidHashes) {
    assert.throws(
      () => createCanonicalEvidenceManifest([evidence('hash.txt', sha256, 1)]),
      { name: 'TypeError', message: /sha256/ },
    );
  }

  const invalidBytes = [
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    1n,
    null,
  ];
  for (const bytes of invalidBytes) {
    assert.throws(
      () => createCanonicalEvidenceManifest([evidence('bytes.txt', ZERO_HASH, bytes)]),
      { message: /bytes/ },
    );
  }
});

test('rejects malformed top-level, entry, and count shapes', () => {
  for (const input of [null, undefined, {}, 'entry', new Uint8Array([1])]) {
    assert.throws(() => createCanonicalEvidenceManifest(input), TypeError);
  }
  assert.throws(() => createCanonicalEvidenceManifest([]), RangeError);
  assert.throws(
    () => createCanonicalEvidenceManifest(
      Array.from({ length: 1001 }, (_, index) => evidence(`over-${index}.txt`)),
    ),
    RangeError,
  );

  const malformedEntries = [
    null,
    [],
    'entry',
    12,
    { path: 'missing-bytes.txt', sha256: ZERO_HASH },
    { ...evidence('extra-key.txt'), extra: true },
  ];
  for (const entry of malformedEntries) {
    assert.throws(
      () => createCanonicalEvidenceManifest([entry]),
      TypeError,
    );
  }
});

test('rejects sparse arrays because every counted entry must be an object', () => {
  const sparse = new Array(1);

  assert.throws(
    () => createCanonicalEvidenceManifest(sparse),
    { name: 'TypeError', message: /entries\[0\].*object/ },
  );
});

test('rejects unknown enumerable symbol keys in an entry', () => {
  const entry = evidence('symbol-key.txt', ZERO_HASH, 1);
  Object.defineProperty(entry, Symbol('unknown'), {
    value: 'must not be silently ignored',
    enumerable: true,
  });

  assert.throws(
    () => createCanonicalEvidenceManifest([entry]),
    { name: 'TypeError', message: /exactly.*keys/ },
  );
});

test('does not mutate the caller array or descriptor objects', () => {
  const first = Object.freeze(evidence('z.txt', F_HASH, 9));
  const second = Object.freeze(evidence('a.txt', ZERO_HASH, 2));
  const input = Object.freeze([first, second]);
  const before = JSON.stringify(input);

  const actual = createCanonicalEvidenceManifest(input);

  assert.equal(JSON.stringify(input), before);
  assert.strictEqual(input[0], first);
  assert.strictEqual(input[1], second);
  assert.notStrictEqual(actual.entries, input);
  assert.notStrictEqual(actual.entries[0], second);
  assert.deepEqual(actual.entries, [
    evidence('a.txt', ZERO_HASH, 2),
    evidence('z.txt', F_HASH, 9),
  ]);
});

test('binds every accepted descriptor field into the digest', () => {
  const baseline = evidence('bind/item.txt', ZERO_HASH, 3);
  const baselineDigest = createCanonicalEvidenceManifest([baseline]).manifest_sha256;
  const changed = [
    evidence('bind/other.txt', ZERO_HASH, 3),
    evidence('bind/item.txt', F_HASH, 3),
    evidence('bind/item.txt', ZERO_HASH, 4),
  ];

  for (const variant of changed) {
    assert.notEqual(
      createCanonicalEvidenceManifest([variant]).manifest_sha256,
      baselineDigest,
    );
  }
});
