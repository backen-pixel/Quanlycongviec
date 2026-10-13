/**
 * Cấp đủ quyền Drive cho nhân viên xưởng HCB — HAI TẦNG, thiếu tầng nào cũng không dùng được:
 *   1) user_permissions: 8 quyền drive.* (giống hệt cách Kim Vy / Nguyễn Minh Nhựt đang có).
 *   2) drive_acl: 2 Drive CHUNG của HCB đang TRỐNG ACL — mà root scope='shared' không có
 *      quyền mặc định, phải share rõ ràng. Share theo PHÒNG BAN vì 20/21 người có
 *      users.company_id = NULL, chỉ thuộc HCB qua department → principal 'company' không khớp.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const VAI_TRO_ACL = 'editor';
const apply = process.argv.includes('--apply');

async function nhanVienXuongHcb() {
  const byId = new Map();
  const them = (u) => { if (u?.id) byId.set(String(u.id), u); };
  const sel = 'id,full_name,role,company_id,department_id';
  const { data: a } = await supabase.from('users').select(sel).eq('company_id', HCB).eq('is_active', true);
  (a || []).forEach(them);
  const { data: dp } = await supabase.from('departments').select('id,name').eq('company_id', HCB).eq('is_active', true);
  const deptIds = (dp || []).map((d) => d.id);
  if (deptIds.length) {
    const { data: b } = await supabase.from('users').select(sel).in('department_id', deptIds).eq('is_active', true);
    (b || []).forEach(them);
  }
  const { data: wt } = await supabase.from('workshop_project_types').select('id').eq('company_id', HCB);
  const { data: ds } = await supabase.from('production_workshop_type_default_staff')
    .select('user_id').in('workshop_type_id', (wt || []).map((w) => w.id));
  const uid = [...new Set((ds || []).map((x) => x.user_id).filter(Boolean))];
  if (uid.length) {
    const { data: c } = await supabase.from('users').select(sel).in('id', uid).eq('is_active', true);
    (c || []).forEach(them);
  }
  return { users: [...byId.values()], deptIds, depts: dp || [] };
}

(async () => {
  const { users, deptIds, depts } = await nhanVienXuongHcb();
  const { data: perms } = await supabase.from('permissions').select('id,resource,action').ilike('resource', 'drive');
  const { data: roots } = await supabase.from('drive_roots')
    .select('id,name,scope,module_key').eq('company_id', HCB).eq('scope', 'shared');

  console.log(`Nhân viên xưởng HCB: ${users.length}`);
  console.log(`Quyền drive: ${perms.length} — ${perms.map((p) => p.action).join(', ')}`);
  console.log(`Phòng ban HCB: ${depts.map((d) => d.name).join(', ')}`);
  console.log(`Drive chung HCB: ${roots.map((r) => r.name).join(' | ')}`);

  const { data: dangCo } = await supabase.from('user_permissions')
    .select('user_id,permission_id,granted')
    .in('permission_id', perms.map((p) => p.id))
    .in('user_id', users.map((u) => u.id));
  const daCo = new Set((dangCo || []).filter((r) => r.granted).map((r) => `${r.user_id}|${r.permission_id}`));

  const themQuyen = [];
  for (const u of users) {
    for (const p of perms) {
      if (!daCo.has(`${u.id}|${p.id}`)) themQuyen.push({ user_id: u.id, permission_id: p.id, granted: true });
    }
  }
  const thieu = {};
  users.forEach((u) => { thieu[u.full_name] = themQuyen.filter((r) => r.user_id === u.id).length; });
  console.log(`\nTẦNG 1 — user_permissions cần thêm: ${themQuyen.length} dòng`);
  Object.entries(thieu).forEach(([n, c]) => console.log(`   ${c === 0 ? '✔ đã đủ' : `+${c}`}  ${n}`));

  const themAcl = [];
  for (const r of roots) {
    for (const d of deptIds) {
      themAcl.push({ target_type: 'root', target_id: r.id, principal_type: 'department', principal_id: d, role: VAI_TRO_ACL });
    }
  }
  console.log(`\nTẦNG 2 — drive_acl cần thêm: ${themAcl.length} dòng (role=${VAI_TRO_ACL})`);

  if (!apply) return console.log('\n(chạy thử — thêm --apply để ghi)');

  const bak = path.join(__dirname, '..', 'uploads', `_rollback_drive_hcb_${Date.now()}.json`);
  fs.writeFileSync(bak, JSON.stringify({
    ghi_chu: 'Hoàn tác: xoá các dòng user_permissions và drive_acl liệt kê dưới đây.',
    user_permissions_them: themQuyen,
    drive_acl_them: themAcl,
    user_permissions_truoc: dangCo || [],
  }, null, 2));

  if (themQuyen.length) {
    for (let i = 0; i < themQuyen.length; i += 100) {
      const { error } = await supabase.from('user_permissions').insert(themQuyen.slice(i, i + 100));
      if (error) throw new Error(`user_permissions: ${error.message}`);
    }
  }
  for (const row of themAcl) {
    const { data: co } = await supabase.from('drive_acl').select('id')
      .eq('target_type', row.target_type).eq('target_id', row.target_id)
      .eq('principal_type', row.principal_type).eq('principal_id', row.principal_id).maybeSingle();
    if (co) {
      const { error } = await supabase.from('drive_acl').update({ role: row.role }).eq('id', co.id);
      if (error) throw new Error(`drive_acl update: ${error.message}`);
    } else {
      const { error } = await supabase.from('drive_acl').insert(row);
      if (error) throw new Error(`drive_acl insert: ${error.message}`);
    }
  }
  console.log(`\n✅ xong. Hoàn tác: ${path.basename(bak)}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
