/**
 * Backfill company_id cho workshop_teams + workshop_task_templates (legacy null).
 *
 * Chạy: node scripts/backfill-workshop-null-company.js
 *        node scripts/backfill-workshop-null-company.js --apply
 */

const { supabase } = require('../src/config/supabase');

const APPLY = process.argv.includes('--apply');

const LOGISTICS_CO = '3438ae3b-b359-4bef-ace1-e8b647fd20c4';
const HUCABI = '18c2563f-3495-498d-8199-23200c9f420e';
const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';
const NEXTGO = '87479a83-1145-43b7-b090-3e40812cb5a9';

const CLONE_TEAM_COMPANIES = [HUCABI, PHUC_DAT, METALLA, NEXTGO];

const c = { g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

async function backfillTeams() {
  const { data: nullTeams, error } = await supabase
    .from('workshop_teams')
    .select('id, name, type, description, color, is_active, company_id')
    .is('company_id', null);
  if (error) throw error;
  console.log(`\n${c.b}workshop_teams null:${c.x} ${(nullTeams || []).length}`);

  for (const t of nullTeams || []) {
    console.log(`  ${c.d}assign${c.x} «${t.name}» (${t.type}) → ${LOGISTICS_CO}`);
    if (APPLY) {
      const { error: upErr } = await supabase
        .from('workshop_teams')
        .update({ company_id: LOGISTICS_CO })
        .eq('id', t.id);
      if (upErr) throw upErr;
    }
  }

  const { data: sourceTeams, error: srcErr } = await supabase
    .from('workshop_teams')
    .select('id, name, type, description, color, is_active, company_id')
    .eq('company_id', LOGISTICS_CO)
    .in('type', ['delivery', 'installation']);
  if (srcErr) throw srcErr;

  // Dry-run: giả định null teams đã gán LOGISTICS_CO
  const sources = APPLY
    ? (sourceTeams || [])
    : [
      ...(sourceTeams || []),
      ...(nullTeams || []).filter((t) => ['delivery', 'installation'].includes(t.type)),
    ];

  const { data: allTeams } = await supabase
    .from('workshop_teams')
    .select('id, name, type, company_id');
  const byKey = new Set((allTeams || []).map((t) => `${t.company_id}|${t.type}|${t.name}`));
  for (const t of nullTeams || []) {
    byKey.add(`${LOGISTICS_CO}|${t.type}|${t.name}`);
  }

  for (const co of CLONE_TEAM_COMPANIES) {
    for (const src of sources) {
      const key = `${co}|${src.type}|${src.name}`;
      if (byKey.has(key)) continue;
      console.log(`  ${c.d}clone${c.x} «${src.name}» (${src.type}) → ${co}`);
      if (APPLY) {
        const { data: created, error: insErr } = await supabase
          .from('workshop_teams')
          .insert({
            name: src.name,
            type: src.type,
            description: src.description || null,
            color: src.color || null,
            is_active: src.is_active !== false,
            company_id: co,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        byKey.add(key);

        const { data: members } = await supabase
          .from('workshop_team_members')
          .select('user_id, role')
          .eq('team_id', src.id);
        if (members?.length && created?.id) {
          const rows = members.map((m) => ({
            team_id: created.id,
            user_id: m.user_id,
            role: m.role || 'member',
          }));
          const { error: memErr } = await supabase.from('workshop_team_members').insert(rows);
          if (memErr) console.warn('  warn copy members:', memErr.message);
        }
      } else {
        byKey.add(key);
      }
    }
  }
}

async function backfillTemplates() {
  const { data: tpls, error } = await supabase
    .from('workshop_task_templates')
    .select('id, name, company_id, workshop_area')
    .is('company_id', null);
  if (error) throw error;
  console.log(`\n${c.b}workshop_task_templates null:${c.x} ${(tpls || []).length}`);

  for (const t of tpls || []) {
    let companyId = HUCABI;
    const area = String(t.workshop_area || '');
    const name = String(t.name || '').toLowerCase();
    if (area === 'logistics' || name.includes('vc') || name.includes('lắp')) {
      companyId = LOGISTICS_CO;
    } else if (name.includes('thùng') || name.includes('nextgo')) {
      companyId = NEXTGO;
    } else if (name.includes('alu') || name.includes('phúc')) {
      companyId = PHUC_DAT;
    }
    console.log(`  ${c.d}assign${c.x} «${t.name}» (${area || '?'}) → ${companyId}`);
    if (APPLY) {
      const { error: upErr } = await supabase
        .from('workshop_task_templates')
        .update({ company_id: companyId })
        .eq('id', t.id);
      if (upErr) throw upErr;
    }
  }
}

(async () => {
  console.log(`${c.b}Backfill workshop null company_id${c.x} · mode=${APPLY ? `${c.g}APPLY` : `${c.y}DRY-RUN`}${c.x}`);
  await backfillTeams();
  await backfillTemplates();
  if (!APPLY) console.log(`\n${c.y}Dry-run xong. Chạy lại với --apply để ghi DB.${c.x}`);
  else console.log(`\n${c.g}Đã apply.${c.x}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
