import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const frontendRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(frontendRoot, 'dist');
const manifestPath = path.join(distRoot, 'founder-local-manifest.json');
const indexPath = path.join(distRoot, 'index.html');

const EXPECTED = Object.freeze({
  contract_version: 'business_ai_os_founder_local_dist_v1',
  runtime_profile: 'founder-local-read-only',
  read_only: true,
  entry_path: '/business-os/login',
  api_base_url: '/api',
  api_origin_policy: 'same-origin-only',
  credential_request_policy: 'single-slash-relative-api-path-only',
});

function fail(code) {
  console.error(`Founder-local frontend dist verification failed: ${code}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail('manifest_missing');
if (!fs.existsSync(indexPath)) fail('index_missing');

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  fail('manifest_invalid_json');
}

const expectedKeys = Object.keys(EXPECTED).sort();
const actualKeys = Object.keys(manifest || {}).sort();
if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) fail('manifest_keys_invalid');
for (const [key, expected] of Object.entries(EXPECTED)) {
  if (manifest[key] !== expected) fail(`manifest_${key}_invalid`);
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
if (!indexHtml.includes('<meta name="business-ai-os-runtime-profile" content="founder-local-read-only">')) {
  fail('index_profile_marker_missing');
}
if (!indexHtml.includes('<meta name="business-ai-os-api-base" content="/api">')) {
  fail('index_api_base_marker_missing');
}
if (/\b(?:src|href)\s*=\s*["']https?:\/\//i.test(indexHtml)) {
  fail('index_external_resource_forbidden');
}

console.log(JSON.stringify({
  ok: true,
  manifest: 'frontend/dist/founder-local-manifest.json',
  contract_version: manifest.contract_version,
  runtime_profile: manifest.runtime_profile,
  api_base_url: manifest.api_base_url,
  api_origin_policy: manifest.api_origin_policy,
}, null, 2));
