/**
 * Rewrite CRM shared schema flags from pass-by-value primitives to a shared object.
 * Re-runnable. Does not touch git.
 */
const fs = require('fs');
const path = require('path');

const CRM = path.join(__dirname, '../src/routes/crm');
const BUNDLE = path.join(CRM, 'shared/helpersBundle.js');
const ROUTES_DIR = path.join(CRM, 'routes');

function patchHelpersBundle(src) {
  let out = src.replace(/\r\n/g, '\n');
  if (out.includes('const crmSchemaCompat = {') && !out.includes('let _vcPipelineStageAvailable')) {
    return out; // already patched
  }
  const declRe = /let _crmLeadSelectMigrationChecked = false;\nlet _vcPipelineStageAvailable = true; \/\/ migration 81\nlet _crmLeadTypeColorAvailable = true; \/\/ migration 339/;
  const repl = `/** Shared mutable schema/select compatibility flags (object — pass by reference across routers). */
const crmSchemaCompat = {
  leadSelectMigrationChecked: false,
  vcPipelineStageAvailable: true, // migration 81
  leadTypeColorAvailable: true, // migration 339
};`;
  if (!declRe.test(out)) {
    throw new Error('helpersBundle: expected schema flag declaration not found');
  }
  out = out.replace(declRe, repl);

  // Module-level bindings → object props (order matters: longer names first)
  const pairs = [
    [/_crmLeadSelectMigrationChecked\b/g, 'crmSchemaCompat.leadSelectMigrationChecked'],
    [/_crmLeadTypeColorAvailable\b/g, 'crmSchemaCompat.leadTypeColorAvailable'],
    [/_vcPipelineStageAvailable\b/g, 'crmSchemaCompat.vcPipelineStageAvailable'],
  ];
  for (const [re, to] of pairs) out = out.replace(re, to);

  // Export: replace three primitives with crmSchemaCompat
  out = out.replace(
    /  crmSchemaCompat\.leadSelectMigrationChecked,\n  crmSchemaCompat\.leadTypeColorAvailable,\n  crmSchemaCompat\.vcPipelineStageAvailable,/,
    '  crmSchemaCompat,',
  );
  // If still old export names somehow
  out = out.replace(
    /  _crmLeadSelectMigrationChecked,\n  _crmLeadTypeColorAvailable,\n  _vcPipelineStageAvailable,/,
    '  crmSchemaCompat,',
  );

  // Avoid double-prefix if re-run
  out = out.replace(/crmSchemaCompat\.crmSchemaCompat\./g, 'crmSchemaCompat.');

  return out;
}

function patchRouteFile(src) {
  let out = src.replace(/\r\n/g, '\n');
  if (!out.includes('_vcPipelineStageAvailable') && out.includes('helpers["crmSchemaCompat"]')) {
    return out;
  }
  if (!out.includes('_vcPipelineStageAvailable') && !out.includes('_crmLeadSelectMigrationChecked')) {
    return src;
  }

  // IIFE params: three flags → one object
  out = out.replace(
    /_crmLeadSelectMigrationChecked, _crmLeadTypeColorAvailable, _vcPipelineStageAvailable/,
    'crmSchemaCompat',
  );
  out = out.replace(
    /helpers\["_crmLeadSelectMigrationChecked"\], helpers\["_crmLeadTypeColorAvailable"\], helpers\["_vcPipelineStageAvailable"\]/,
    'helpers["crmSchemaCompat"]',
  );

  // Body usages (leadLifecycle etc.) — only when still bare identifiers
  // Skip if already crmSchemaCompat.xxx
  out = out.replace(/(?<!crmSchemaCompat\.)\b_crmLeadSelectMigrationChecked\b/g, 'crmSchemaCompat.leadSelectMigrationChecked');
  out = out.replace(/(?<!crmSchemaCompat\.)\b_crmLeadTypeColorAvailable\b/g, 'crmSchemaCompat.leadTypeColorAvailable');
  out = out.replace(/(?<!crmSchemaCompat\.)\b_vcPipelineStageAvailable\b/g, 'crmSchemaCompat.vcPipelineStageAvailable');

  return out;
}

function main() {
  const bundleBefore = fs.readFileSync(BUNDLE, 'utf8');
  const bundleAfter = patchHelpersBundle(bundleBefore);
  fs.writeFileSync(BUNDLE, bundleAfter);
  console.log('patched helpersBundle.js', bundleBefore.length, '→', bundleAfter.length);

  for (const name of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'))) {
    const fp = path.join(ROUTES_DIR, name);
    const before = fs.readFileSync(fp, 'utf8');
    const after = patchRouteFile(before);
    if (after !== before) {
      fs.writeFileSync(fp, after);
      console.log('patched', name);
    }
  }
  console.log('done');
}

main();
