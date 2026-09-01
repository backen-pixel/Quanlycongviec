'use strict';

const { createHash } = require('node:crypto');

const SCHEMA_VERSION = 'af3-evidence-manifest/v1';
const HASH_ALGORITHM = 'sha256';
const MAX_ENTRIES = 1000;
const MAX_PATH_LENGTH = 240;
const REQUIRED_KEYS = ['bytes', 'path', 'sha256'];
const PATH_CHARACTERS = /^[A-Za-z0-9._/-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

function assertExactKeys(entry, index) {
  const keys = Object.keys(entry).sort();

  if (
    keys.length !== REQUIRED_KEYS.length ||
    !keys.every((key, keyIndex) => key === REQUIRED_KEYS[keyIndex])
  ) {
    throw new TypeError(
      `entries[${index}] must have exactly the enumerable own keys path, sha256, and bytes`,
    );
  }
}

function assertValidPath(path, index) {
  if (typeof path !== 'string') {
    throw new TypeError(`entries[${index}].path must be a string`);
  }

  if (path.length < 1 || path.length > MAX_PATH_LENGTH) {
    throw new RangeError(
      `entries[${index}].path length must be between 1 and ${MAX_PATH_LENGTH} characters`,
    );
  }

  if (!PATH_CHARACTERS.test(path)) {
    throw new TypeError(
      `entries[${index}].path must use only printable ASCII characters A-Z, a-z, 0-9, ., _, /, and -`,
    );
  }

  if (path.startsWith('/') || path.endsWith('/')) {
    throw new TypeError(`entries[${index}].path must be repo-relative without leading or trailing slash`);
  }

  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(
      `entries[${index}].path must not contain empty, current-directory, or parent-directory segments`,
    );
  }
}

function assertValidSha256(sha256, index) {
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    throw new TypeError(`entries[${index}].sha256 must be exactly 64 lowercase hexadecimal characters`);
  }
}

function assertValidBytes(bytes, index) {
  if (typeof bytes !== 'number' || !Number.isInteger(bytes)) {
    throw new TypeError(`entries[${index}].bytes must be an integer`);
  }

  if (bytes < 0 || bytes > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      `entries[${index}].bytes must be between 0 and Number.MAX_SAFE_INTEGER`,
    );
  }
}

function compareAsciiPaths(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function createCanonicalEvidenceManifest(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('entries must be an array');
  }

  if (entries.length < 1 || entries.length > MAX_ENTRIES) {
    throw new RangeError(`entries must contain between 1 and ${MAX_ENTRIES} descriptors`);
  }

  const paths = new Set();
  const validatedEntries = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`entries[${index}] must be an object`);
    }

    assertExactKeys(entry, index);
    assertValidPath(entry.path, index);
    assertValidSha256(entry.sha256, index);
    assertValidBytes(entry.bytes, index);

    if (paths.has(entry.path)) {
      throw new TypeError(`entries[${index}].path duplicates path ${entry.path}`);
    }
    paths.add(entry.path);

    return {
      path: entry.path,
      sha256: entry.sha256,
      bytes: entry.bytes,
    };
  });

  validatedEntries.sort(compareAsciiPaths);

  const body = {
    schema_version: SCHEMA_VERSION,
    hash_algorithm: HASH_ALGORITHM,
    entry_count: validatedEntries.length,
    entries: validatedEntries,
  };
  const canonicalBytes = Buffer.from(JSON.stringify(body), 'utf8');
  const manifestSha256 = createHash(HASH_ALGORITHM).update(canonicalBytes).digest('hex');

  return {
    ...body,
    manifest_sha256: manifestSha256,
  };
}

module.exports = { createCanonicalEvidenceManifest };
