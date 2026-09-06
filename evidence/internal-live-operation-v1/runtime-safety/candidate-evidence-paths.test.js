const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const prefix = 'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/';
const read = (file) => fs.readFileSync(path.join(repositoryDir, file), 'utf8');

test('timestamp-corrected candidate producers and consumers cannot target historical C3/C3-R1 artifacts', () => {
  for (const file of ['candidate-binding.js', 'write-candidate-attestation.js', 'run-static-verification.js', 'verify-founder-local-runtime.js', 'verify-founder-local-lifecycle.js']) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(source.includes("path.join(__dirname, 'runtime', 'candidates', 'c3-r2'"), file);
    assert.ok(!source.includes("'c3-r1'"), file);
    assert.ok(!source.includes("path.join(__dirname, 'runtime')"), file);
    assert.ok(!source.includes("path.join(__dirname, 'runtime', 'candidate-attestation.json')"), file);
  }
  for (const file of ['backend/tests/founder-cockpit-live-read.js', 'backend/tests/founder-cockpit-reconciliation-live.js']) {
    assert.ok(read(file).includes(prefix), file);
    assert.ok(!read(file).includes('runtime-safety/runtime/candidates/c3-r1/'), file);
    assert.ok(!read(file).includes('runtime-safety/runtime/real-data-'), file);
  }
});

test('manifest and structural verifier use only the corrected fixed namespace', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'EVIDENCE_MANIFEST.json'), 'utf8'));
  assert.equal(manifest.generated_artifact_directory, 'runtime/candidates/c3-r2');
  const references = JSON.stringify(manifest).match(/evidence\/[^"\s]+\.json/g);
  assert.ok(references.length >= 8);
  const verifier = read('scripts/verify-internal-live-v1.ps1');
  for (const reference of references) {
    assert.ok(reference.startsWith(prefix), reference);
    assert.ok(verifier.includes(reference), reference);
  }
  assert.ok(!/runtime-safety\/runtime\/[a-z-]+\.json/.test(verifier));
  assert.match(fs.readFileSync(path.join(__dirname, 'runtime', '.gitignore'), 'utf8'), /^\*\r?\n!\.gitignore\r?\n?$/);
});
