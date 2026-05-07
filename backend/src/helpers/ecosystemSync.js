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

async function getCompanyDivisionIds(company) {
  if (!company?.id) return [];
  const { data: links } = await supabase.from('company_division_units')
    .select('division_unit_id')
    .eq('company_id', company.id);
  if (links?.length) {
    return [...new Set(links.map((l) => l.division_unit_id).filter(Boolean))];
  }
  if (company.division_unit_id) return [company.division_unit_id];
  return [];
}

/** Đơn vị công ty con trong HST dưới một Khối cụ thể */
async function findSubsidiaryUnderDivision(companyId, divisionUnitId) {
  if (!companyId || !divisionUnitId) return null;
  const { data } = await supabase.from('ecosystem_units')
    .select('id')
    .eq('company_id', companyId)
    .eq('parent_id', divisionUnitId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.id || null;
}

async function getPrimaryDivisionForCompanyId(companyId) {
  const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', companyId).maybeSingle();
  return co?.division_unit_id || null;
}

/**
 * Khi tạo/sửa Company → ecosystem_unit cấp Công ty (một nút dưới mỗi Khối đã gán)
 * @param {object} company - { id, name, short_name, division_unit_id, ... }
 */
async function syncCompanyToEcosystem(company) {
  try {
    if (!company?.id) return null;

    const divisionIds = await getCompanyDivisionIds(company);
    if (!divisionIds.length) {
      await supabase.from('ecosystem_units').update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('company_id', company.id).eq('is_active', true);
      return null;
    }

    const levelId = await getLevelId('subsidiary');
    if (!levelId) return null;

    const divKey = divisionIds.map((x) => String(x));
    let firstId = null;

    for (const divId of divisionIds) {
      const existingId = await findSubsidiaryUnderDivision(company.id, divId);
      if (existingId) {
        await supabase.from('ecosystem_units').update({
          name: company.name,
          short_name: company.short_name || null,
          parent_id: divId,
          is_active: true,
          updated_at: new Date().toISOString(),
        }).eq('id', existingId);
        if (!firstId) firstId = existingId;
      } else {
        const { data, error } = await supabase.from('ecosystem_units').insert({
          name: company.name,
          short_name: company.short_name || null,
          code: company.code || null,
          level_id: levelId,
          parent_id: divId,
          company_id: company.id,
          is_active: true,
        }).select('id').single();
        if (error) { console.error('syncCompany error:', error); continue; }
        if (!firstId) firstId = data.id;
      }
    }

    const { data: subs } = await supabase.from('ecosystem_units')
      .select('id, parent_id')
      .eq('company_id', company.id)
      .eq('is_active', true);
    for (const row of subs || []) {
      const pid = row.parent_id ? String(row.parent_id) : '';
      if (pid && !divKey.includes(pid)) {
        await supabase.from('ecosystem_units').update({
          is_active: false,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
      }
    }

    return firstId;
  } catch (e) { console.error('syncCompanyToEcosystem:', e.message); return null; }
}

/**
 * Khi tạo/sửa Department → auto tạo ecosystem_unit cấp Phòng ban (cha = công ty con đúng Khối)
 * @param {object} dept - { id, name, short_name, company_id, division_unit_id? }
 */
async function syncDepartmentToEcosystem(dept) {
  try {
    if (!dept.company_id) return null;

    const levelId = await getLevelId('department');
    if (!levelId) return null;

    const divId = dept.division_unit_id || await getPrimaryDivisionForCompanyId(dept.company_id);
    if (!divId) return null;

    let parentUnitId = await findSubsidiaryUnderDivision(dept.company_id, divId);
    if (!parentUnitId) {
      const { data: co } = await supabase.from('companies').select('*').eq('id', dept.company_id).single();
      if (co) await syncCompanyToEcosystem(co);
      parentUnitId = await findSubsidiaryUnderDivision(dept.company_id, divId);
    }
    if (!parentUnitId) return null;

    const existingUnitId = await findLinkedUnit('department_id', dept.id);

    if (existingUnitId) {
      await supabase.from('ecosystem_units').update({
        name: dept.name,
        short_name: dept.short_name || null,
        parent_id: parentUnitId,
        updated_at: new Date().toISOString(),
      }).eq('id', existingUnitId);
      return existingUnitId;
    }
    const { data, error } = await supabase.from('ecosystem_units').insert({
      name: dept.name,
      short_name: dept.short_name || null,
      level_id: levelId,
      parent_id: parentUnitId,
      department_id: dept.id,
    }).select('id').single();
    if (error) { console.error('syncDept error:', error); return null; }
    return data.id;
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

async function findTeamUnit(teamId) {
  if (!teamId) return null;
  const { data } = await supabase.from('ecosystem_units')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.id || null;
}

async function ensureTeamUnit(teamId) {
  if (!teamId) return null;
  const existingId = await findTeamUnit(teamId);
  if (existingId) return existingId;

  const { data: team } = await supabase.from('teams')
    .select('id,name,short_name,department_id,is_active')
    .eq('id', teamId)
    .maybeSingle();
  if (!team || team.is_active === false) return null;

  const deptUnitId = await findLinkedUnit('department_id', team.department_id);
  if (!deptUnitId) return null;

  const teamLevelId = await getLevelId('team');
  if (!teamLevelId) return null;

  const { data, error } = await supabase.from('ecosystem_units').insert({
    name: team.name,
    short_name: team.short_name || null,
    level_id: teamLevelId,
    parent_id: deptUnitId,
    team_id: team.id,
    is_active: true,
  }).select('id').single();
  if (error) { console.error('ensureTeamUnit:', error.message); return null; }
  return data?.id || null;
}

async function syncTeamToEcosystem(team) {
  try {
    if (!team?.id) return null;
    if (team.is_active === false) {
      await supabase.from('ecosystem_units')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('team_id', team.id)
        .eq('is_active', true);
      return null;
    }

    const teamLevelId = await getLevelId('team');
    if (!teamLevelId) return null;
    const deptUnitId = await findLinkedUnit('department_id', team.department_id);
    if (!deptUnitId) return null;

    const existingId = await findTeamUnit(team.id);
    if (existingId) {
      await supabase.from('ecosystem_units').update({
        name: team.name,
        short_name: team.short_name || null,
        parent_id: deptUnitId,
        level_id: teamLevelId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existingId);
      return existingId;
    }

    const { data, error } = await supabase.from('ecosystem_units').insert({
      name: team.name,
      short_name: team.short_name || null,
      level_id: teamLevelId,
      parent_id: deptUnitId,
      team_id: team.id,
      is_active: true,
    }).select('id').single();
    if (error) { console.error('syncTeamToEcosystem:', error.message); return null; }
    return data?.id || null;
  } catch (e) {
    console.error('syncTeamToEcosystem:', e.message);
    return null;
  }
}

async function syncUserOrgToEcosystem(userId, { old_department_id = null, old_team_id = null } = {}) {
  try {
    if (!userId) return;

    // Load current user org
    const { data: u } = await supabase
      .from('users')
      .select('id, role, department_id, team_id')
      .eq('id', userId)
      .maybeSingle();
    if (!u?.id) return;

    // Remove from old team unit
    if (old_team_id) {
      const oldTeamUnitId = await findTeamUnit(old_team_id);
      if (oldTeamUnitId) {
        await supabase.from('ecosystem_unit_members').delete().eq('unit_id', oldTeamUnitId).eq('user_id', userId);
      }
    }
    // Remove from old department unit (fallback)
    if (old_department_id) {
      const oldDeptUnitId = await findLinkedUnit('department_id', old_department_id);
      if (oldDeptUnitId) {
        await supabase.from('ecosystem_unit_members').delete().eq('unit_id', oldDeptUnitId).eq('user_id', userId);
      }
    }

    // Add/update membership to current department
    if (u.department_id) {
      await syncUserToEcosystem(userId, u.department_id, 'member');
    }
    // Add membership to current team unit (if exists)
    if (u.team_id) {
      const teamUnitId = await ensureTeamUnit(u.team_id);
      if (teamUnitId) {
        const { data: existing } = await supabase.from('ecosystem_unit_members')
          .select('id').eq('unit_id', teamUnitId).eq('user_id', userId).maybeSingle();
        if (!existing?.id) {
          await supabase.from('ecosystem_unit_members').insert({
            unit_id: teamUnitId,
            user_id: userId,
            unit_role: 'member',
            can_manage_children: false,
          });
        }
      }
    }
  } catch (e) {
    console.error('syncUserOrgToEcosystem:', e.message);
  }
}

module.exports = {
  syncCompanyToEcosystem,
  syncDepartmentToEcosystem,
  syncUserToEcosystem,
  removeUserFromEcosystem,
  syncTeamToEcosystem,
  syncUserOrgToEcosystem,
};
