/**
 * Auto-sync: Khi tạo/sửa Company/Department/User → tự động tạo/cập nhật ecosystem_unit
 */
const { supabase } = require('../config/supabase');

// Tìm level_id theo slug
async function getLevelId(slug) {
  const { data } = await supabase.from('ecosystem_levels').select('id').eq('slug', slug).single();
  return data?.id || null;
}

// Tìm ecosystem_unit đã liên kết với company/department
async function findLinkedUnit(field, id) {
  const { data } = await supabase.from('ecosystem_units')
    .select('id').eq(field, id).eq('is_active', true).single();
  return data?.id || null;
}

/**
 * Khi tạo/sửa Company → auto tạo ecosystem_unit cấp Công ty
 * @param {object} company - { id, name, short_name, division_unit_id }
 */
async function syncCompanyToEcosystem(company) {
  try {
    if (!company.division_unit_id) return null; // Chưa gán Khối → skip

    const levelId = await getLevelId('subsidiary');
    if (!levelId) return null;

    const existingUnitId = await findLinkedUnit('company_id', company.id);

    if (existingUnitId) {
      // Update existing
      await supabase.from('ecosystem_units').update({
        name: company.name,
        short_name: company.short_name || null,
        parent_id: company.division_unit_id,
        updated_at: new Date().toISOString(),
      }).eq('id', existingUnitId);
      return existingUnitId;
    } else {
      // Create new
      const { data, error } = await supabase.from('ecosystem_units').insert({
        name: company.name,
        short_name: company.short_name || null,
        code: company.code || null,
        level_id: levelId,
        parent_id: company.division_unit_id,
        company_id: company.id,
      }).select('id').single();
      if (error) { console.error('syncCompany error:', error); return null; }
      return data.id;
    }
  } catch (e) { console.error('syncCompanyToEcosystem:', e.message); return null; }
}

/**
 * Khi tạo/sửa Department → auto tạo ecosystem_unit cấp Phòng ban
 * @param {object} dept - { id, name, short_name, company_id }
 */
async function syncDepartmentToEcosystem(dept) {
  try {
    if (!dept.company_id) return null;

    const levelId = await getLevelId('department');
    if (!levelId) return null;

    // Tìm ecosystem_unit của company cha
    const parentUnitId = await findLinkedUnit('company_id', dept.company_id);
    if (!parentUnitId) return null; // Company chưa có trong ecosystem

    const existingUnitId = await findLinkedUnit('department_id', dept.id);

    if (existingUnitId) {
      await supabase.from('ecosystem_units').update({
        name: dept.name,
        short_name: dept.short_name || null,
        parent_id: parentUnitId,
        updated_at: new Date().toISOString(),
      }).eq('id', existingUnitId);
      return existingUnitId;
    } else {
      const { data, error } = await supabase.from('ecosystem_units').insert({
        name: dept.name,
        short_name: dept.short_name || null,
        level_id: levelId,
        parent_id: parentUnitId,
        department_id: dept.id,
      }).select('id').single();
      if (error) { console.error('syncDept error:', error); return null; }
      return data.id;
    }
  } catch (e) { console.error('syncDepartmentToEcosystem:', e.message); return null; }
}

/**
 * Khi thêm user vào department → auto thêm vào ecosystem_unit_members
 * @param {string} userId
 * @param {string} departmentId
 * @param {string} role - 'director'|'manager'|'team_lead'|'member'
 */
async function syncUserToEcosystem(userId, departmentId, role = 'member') {
  try {
    if (!departmentId) return;

    // Tìm ecosystem_unit của department
    const unitId = await findLinkedUnit('department_id', departmentId);
    if (!unitId) return;

    // Check if already member
    const { data: existing } = await supabase.from('ecosystem_unit_members')
      .select('id').eq('unit_id', unitId).eq('user_id', userId).single();

    if (existing) {
      // Update role
      await supabase.from('ecosystem_unit_members').update({
        unit_role: role,
        can_manage_children: ['director', 'manager'].includes(role),
      }).eq('id', existing.id);
    } else {
      // Add
      await supabase.from('ecosystem_unit_members').insert({
        unit_id: unitId,
        user_id: userId,
        unit_role: role,
        can_manage_children: ['director', 'manager'].includes(role),
      });
    }
  } catch (e) { console.error('syncUserToEcosystem:', e.message); }
}

/**
 * Khi xóa user khỏi department → xóa khỏi ecosystem
 */
async function removeUserFromEcosystem(userId, departmentId) {
  try {
    const unitId = await findLinkedUnit('department_id', departmentId);
    if (!unitId) return;
    await supabase.from('ecosystem_unit_members').delete().eq('unit_id', unitId).eq('user_id', userId);
  } catch (e) { console.error('removeUserFromEcosystem:', e.message); }
}

module.exports = {
  syncCompanyToEcosystem,
  syncDepartmentToEcosystem,
  syncUserToEcosystem,
  removeUserFromEcosystem,
};
