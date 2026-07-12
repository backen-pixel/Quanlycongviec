/**
 * Thêm/cập nhật user làm trưởng nhóm (leader) cho mọi nhóm chat nội bộ, trừ nhóm test.
 *
 * Chạy:
 *   node scripts/promote-messenger-group-leader.js --email kinhphucdat@gmail.com
 *   node scripts/promote-messenger-group-leader.js --email kinhphucdat@gmail.com --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function isTestGroupName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (n === 'test') return true;
  if (n.startsWith('test ') || n.startsWith('test')) return true;
  if (n.includes(' test')) return true;
  if (n.includes('thử') || n.includes('demo')) return true;
  return false;
}

async function main() {
  const email = String(arg('--email') || 'kinhphucdat@gmail.com').trim().toLowerCase();
  const dryRun = process.argv.includes('--dry-run');

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .ilike('email', email)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user?.id) throw new Error(`Không tìm thấy user email=${email}`);

  const { data: groups, error: gErr } = await supabase
    .from('messenger_groups')
    .select('id, name, is_direct')
    .eq('is_direct', false)
    .order('name');
  if (gErr) throw gErr;

  const targets = (groups || []).filter((g) => !isTestGroupName(g.name));
  const skipped = (groups || []).filter((g) => isTestGroupName(g.name));

  console.log(`User: ${user.full_name?.trim() || user.email} (${user.id})`);
  console.log(`Nhóm áp dụng: ${targets.length} | Bỏ qua (test): ${skipped.length}`);
  if (skipped.length) {
    console.log('  Test:', skipped.map((g) => g.name).join(', '));
  }

  let inserted = 0;
  let updated = 0;

  for (const g of targets) {
    const { data: existing } = await supabase
      .from('messenger_group_members')
      .select('id, role')
      .eq('group_id', g.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.role === 'leader') {
      console.log(`  = ${g.name} (đã là leader)`);
      continue;
    }

    if (dryRun) {
      console.log(`  ~ ${g.name} (${existing ? `đổi ${existing.role} → leader` : 'thêm leader'})`);
      if (existing) updated += 1;
      else inserted += 1;
      continue;
    }

    if (existing) {
      const { error } = await supabase
        .from('messenger_group_members')
        .update({ role: 'leader' })
        .eq('group_id', g.id)
        .eq('user_id', user.id);
      if (error) throw error;
      console.log(`  ↑ ${g.name} (${existing.role} → leader)`);
      updated += 1;
    } else {
      const { error } = await supabase.from('messenger_group_members').insert({
        group_id: g.id,
        user_id: user.id,
        role: 'leader',
        added_by: user.id,
      });
      if (error) throw error;
      console.log(`  + ${g.name} (thêm leader)`);
      inserted += 1;
    }
  }

  console.log(`\nXong${dryRun ? ' (dry-run)' : ''}: thêm ${inserted}, cập nhật ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
