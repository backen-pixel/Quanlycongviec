/**
 * Đồng bộ công ty + bộ mẫu theo module cho toàn bộ dự án.
 *
 * Usage:
 *   node scripts/sync-project-module-companies.js --dry     # chỉ báo cáo lệch
 *   node scripts/sync-project-module-companies.js           # áp dụng
 *   node scripts/sync-project-module-companies.js --limit 50
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const { syncProjectModuleAssignments } = require('../src/helpers/syncProjectModuleAssignments');

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const limit = Number(argValue('--limit', '0')) || null;

  const { data: rows, error } = await supabase
    .from('project_company_assignments')
    .select('project_id');
  if (error) throw error;

  let projectIds = [...new Set((rows || []).map((r) => String(r.project_id)).filter(Boolean))];
  if (limit) projectIds = projectIds.slice(0, limit);

  console.log(`${dryRun ? '[DRY] ' : ''}Quét ${projectIds.length} dự án…`);

  const summary = { scanned: 0, changedProjects: 0, companyFix: 0, templateFix: 0, errors: 0 };
  const samples = [];

  for (const pid of projectIds) {
    summary.scanned += 1;
    try {
      const { changes } = await syncProjectModuleAssignments(pid, { dryRun });
      if (!changes.length) continue;
      summary.changedProjects += 1;
      for (const c of changes) {
        if (c.to.company_id) summary.companyFix += 1;
        if (c.to.template_set_id) summary.templateFix += 1;
      }
      if (samples.length < 15) samples.push({ project_id: pid, changes });
    } catch (e) {
      summary.errors += 1;
      console.warn('  lỗi', pid, e.message);
    }
    if (summary.scanned % 100 === 0) console.log(`  …${summary.scanned}/${projectIds.length}`);
  }

  console.log('\nKết quả:', summary);
  if (samples.length) console.log('\nMẫu thay đổi:\n', JSON.stringify(samples, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
