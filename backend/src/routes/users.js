const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { normalizeRegionIdList, assertRegionBelongsToCompany } = require('../helpers/crmRegionScope');
const { syncUserOrgToEcosystem } = require('../helpers/ecosystemSync');
const { recordUserPing, getPresenceForUserIds, listUsersWithActivity, ONLINE_THRESHOLD_MS } = require('../helpers/userPresence');
const { getCurrentLocationForUser } = require('../helpers/userCurrentLocation');
const { parseScopeFromQuery } = require('../helpers/scopeQueryParams');
const { pgUsersActivityStats } = require('../helpers/pgHotQueries');
const { responseCache, invalidateTags } = require('../middleware/responseCache');

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if (req.path === '/presence' || req.path === '/ping') return next();
  const origJson = res.json.bind(res);
  res.json = function usersInvalidate(body) {
    void invalidateTags(['users', 'presence']);
    return origJson(body);
  };
  next();
});

// ════════════════════════════════════════════════════
// STATIC ROUTES FIRST (before /:id param catch-all)
// ════════════════════════════════════════════════════

// ═══ WORKFLOW STAGES ═══
r.get('/stages', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    // Lấy tất cả stages active - ADMIN thấy hết
    const { data: allStages, error } = await supabase
      .from('workflow_stages')
      .select('*')
      .eq('is_active', true)
      .order('order_index');

    if (error) {
      return res.json({ stages: [
        { id: 'c1', slug: 'consulting', name: 'Tư vấn', color: '#8B5CF6', icon: '💬', order_index: 1 },
        { id: 'c2', slug: 'design', name: 'Thiết kế', color: '#EC4899', icon: '🎨', order_index: 2 },
        { id: 'c3', slug: 'quotation', name: 'Báo giá', color: '#F59E0B', icon: '💰', order_index: 3 },
        { id: 'c4', slug: 'contract', name: 'Hợp đồng', color: '#10B981', icon: '📝', order_index: 4 },
        { id: 'c5', slug: 'production', name: 'Sản xuất', color: '#F97316', icon: '🏭', order_index: 5 },
        { id: 'c6', slug: 'delivery', name: 'Vận chuyển & Lắp đặt', color: '#06B6D4', icon: '🚚', order_index: 6 },
        { id: 'c8', slug: 'customer-care', name: 'Chăm sóc KH', color: '#EF4444', icon: '❤️', order_index: 7 },
      ] });
    }

    // Admin/Manager thấy tất cả
    if (['admin', 'manager'].includes(role)) {
      return res.json({ stages: allStages || [] });
    }

    // NV thường: Lọc theo companies mà user có quyền truy cập
    // 1. Lấy ecosystem_units của user
    const { data: memberships } = await supabase
      .from('ecosystem_unit_members')
      .select('unit_id, ecosystem_units!inner(company_id)')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      // Nếu user không thuộc unit nào, trả về tất cả (fallback)
      return res.json({ stages: allStages || [] });
    }

    // 2. Lấy company_id từ units (filter null)
    let companyIdsFromUnits = [...new Set(
      memberships
        .map(m => m.ecosystem_units?.company_id)
        .filter(id => id != null)
    )];

    // 3. Tìm companies có division_unit_id match với units của user
    const unitIds = memberships.map(m => m.unit_id);
    const { data: companiesViaDiv } = await supabase
      .from('companies')
      .select('id')
      .in('division_unit_id', unitIds);

    const companyIdsFromDiv = (companiesViaDiv || []).map(c => c.id);
    const allCompanyIds = [...new Set([...companyIdsFromUnits, ...companyIdsFromDiv])];

    if (allCompanyIds.length === 0) {
      // Nếu không tìm thấy company nào, trả về tất cả (fallback)
      return res.json({ stages: allStages || [] });
    }

    // 4. Filter stages theo company_id
    const filteredStages = allStages.filter(s => 
      s.company_id == null || allCompanyIds.includes(s.company_id)
    );

    res.json({ stages: filteredStages });
  } catch (e) {
    console.error('/users/stages error:', e);
    res.status(500).json({ error: 'Lỗi khi lấy quy trình' });
  }
});

// ═══ ROLE → STAGE ACCESS ═══
r.get('/my-stages', async (req, res) => {
  try {
    const role = req.user.role;
    if (['admin', 'manager'].includes(role)) {
      const { data } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
      return res.json({ stages: data || [], allAccess: true });
    }
    let slugs = [];
    try {
      const { data: access } = await supabase.from('role_stage_access').select('stage_slug').eq('role', role);
      slugs = (access || []).map(a => a.stage_slug);
    } catch { /* table not exist */ }
    if (slugs.length === 0) return res.json({ stages: [], allAccess: false });
    const { data: stages } = await supabase.from('workflow_stages').select('*').eq('is_active', true).in('slug', slugs).order('order_index');
    res.json({ stages: stages || [], allAccess: false });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DEPARTMENTS ═══
r.get('/departments/list', async (req, res) => {
  try {
    const { data } = await supabase.from('departments').select('*').order('name');
    res.json({ departments: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.get('/departments', async (req, res) => {
  try {
    const { data } = await supabase.from('departments').select('*').order('name');
    res.json({ departments: data || [] });
  } catch { res.status(500).json({ error: 'Lỗi' }); }
});

/** Client gọi định kỳ (~60s) để báo còn hoạt động; quá 2 phút không ping → coi offline */
r.post('/ping', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const result = await recordUserPing(uid);
    if (!result.persisted) {
      return res.status(503).json({
        ok: false,
        persisted: false,
        error: result.error || 'Không ghi được ping — chạy migration database/67_user_activity_and_messenger_pins.sql',
      });
    }
    void invalidateTags(['users', 'presence']);
    res.json({ ok: true, persisted: true, last_ping_at: result.last_ping_at });
  } catch (e) {
    console.warn('[users/ping]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Vị trí hiện tại của user đang đăng nhập */
r.get('/me/location', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const location = await getCurrentLocationForUser(uid);
    res.json({ location });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Xóa vị trí ghi nhận của user hiện tại — dùng khi vị trí cũ sai, để ping kế tiếp ghi lại. */
r.delete('/me/location', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const { supabase } = require('../config/supabase');
    try {
      await supabase.from('user_current_location').delete().eq('user_id', uid);
    } catch (e) {
      if (e?.code !== '42P01') throw e;
    }
    try {
      await supabase
        .from('user_devices')
        .update({ geo_lat: null, geo_lng: null, geo_address: null })
        .eq('user_id', uid);
    } catch { /* ignore */ }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách vị trí nhân viên (cho bản đồ admin) */
r.get('/locations', responseCache({ ttl: 30, scope: 'role', tags: ['users', 'presence'] }), async (req, res) => {
  try {
    let { company_id: companyId, department_id: departmentId, search } = req.query;
    const role = req.user.role;
    const elevated = ['admin', 'manager', 'region_admin'].includes(role);
    if (!elevated && req.user.company_id) {
      companyId = companyId || req.user.company_id;
    }
    const { users } = await listUsersWithActivity({
      companyId: companyId || null,
      departmentId: departmentId || null,
      search: search ? String(search).trim() : '',
      onlineOnly: false,
    });
    const items = (users || []).map((u) => ({
      user_id: u.id,
      full_name: u.full_name,
      email: u.email,
      online: !!u.online,
      current_location: u.current_location || null,
    }));
    res.json({
      items,
      stats: {
        total: items.length,
        with_location: items.filter((x) => x.current_location?.lat != null).length,
        online: items.filter((x) => x.online).length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách nhân viên + ai đang hoạt động (ping trong 2 phút) */
r.get('/activity', responseCache({ ttl: 30, scope: 'role', tags: ['users', 'presence'] }), async (req, res) => {
  try {
    const scope = parseScopeFromQuery(req, { forceUserCompany: true });
    const { online_only: onlineOnly } = req.query;
    const { users, stats } = await listUsersWithActivity({
      companyId: scope.companyId,
      departmentId: scope.departmentId,
      search: scope.search || '',
      onlineOnly: onlineOnly === '1' || onlineOnly === 'true',
    });

    const pgStats = await pgUsersActivityStats({
      companyId: scope.companyId,
      departmentId: scope.departmentId,
    });
    const mergedStats = pgStats
      ? { ...stats, online: pgStats.online, total: pgStats.total }
      : stats;

    res.json({
      users,
      stats: mergedStats,
      online_threshold_minutes: Math.round(ONLINE_THRESHOLD_MS / 60000),
    });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('user_last_activity') || msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Bảng user_last_activity chưa có — chạy migration database/67_user_activity_and_messenger_pins.sql',
      });
    }
    res.status(500).json({ error: msg });
  }
});

/** Trạng thái online theo last ping (ngưỡng 2 phút) */
r.post('/presence', async (req, res) => {
  try {
    const raw = req.body?.user_ids;
    const ids = Array.isArray(raw) ? raw : [];
    const presence = await getPresenceForUserIds(ids);
    res.json({ presence });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('user_last_activity') || msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Bảng user_last_activity chưa có — chạy migration database/67_user_activity_and_messenger_pins.sql',
      });
    }
    res.status(500).json({ error: msg });
  }
});

// ═══ CRM / app preferences (đồng bộ web ↔ mobile, lưu JSON theo user) ═══
const CRM_APP_PREFS_BOOL_KEYS = [
  'voiceCaptureEnabled',
  'voiceBackgroundSyncEnabled',
  'autoLinkVoiceByPhone',
  'backgroundRealtimeEnabled',
  'autoToolsEnabled',
  'facebookAutoTool',
  'contactsAutoTool',
  'floatingChatBubbleEnabled',
  'floatingChatBubbleOnlyWhenUnread',
  'floatingChatBubbleCompact',
  'floatingChatBubbleSystemOverlay',
];

function crmAppPrefsStorageKey(userId) {
  return `crm_app_prefs:${userId}`;
}

function mergeCrmAppPrefsFromBody(prev, body) {
  const base = prev && typeof prev === 'object' ? { ...prev } : {};
  const b = body && typeof body === 'object' ? body : {};
  CRM_APP_PREFS_BOOL_KEYS.forEach((k) => {
    if (b[k] !== undefined) base[k] = !!b[k];
  });
  return base;
}

r.get('/crm-app-prefs', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const key = crmAppPrefsStorageKey(uid);
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    const v = data?.value;
    res.json(v && typeof v === 'object' ? v : {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/crm-app-prefs', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const key = crmAppPrefsStorageKey(uid);
    const { data: existing } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    const prev = existing?.value && typeof existing.value === 'object' ? existing.value : {};
    const merged = mergeCrmAppPrefsFromBody(prev, req.body);
    const { error } = await supabase.from('app_settings').upsert(
      {
        key,
        value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    res.json(merged);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════
// PARAM ROUTES (/:id comes after static routes)
// ════════════════════════════════════════════════════

// ═══ STAFF LIST (with filters) ═══
r.get('/', async (req, res) => {
  try {
    const { role, department_id, company_id, ecosystem_unit_id, company_unit_id, search, include_inactive } = req.query;

    // ── Lọc theo company_id trực tiếp (companies.id → departments → users) ──
    // Dùng cho EmployeePicker khi truyền companyId prop
    if (company_id && !company_unit_id && !ecosystem_unit_id) {
      try {
        const { data: depts } = await supabase.from('departments')
          .select('id').eq('company_id', company_id).eq('is_active', true);
        const deptIds = (depts || []).map(d => d.id);
        if (!deptIds.length) return res.json({ users: [], company_id });

        let q = supabase.from('users')
          .select('id, full_name, email, phone, avatar, role, department_id, position')
          .in('department_id', deptIds);
        if (!include_inactive) q = q.neq('is_active', false);
        if (role) q = q.eq('role', role);
        if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data: users, error } = await q.order('full_name');
        if (error) throw error;

        return res.json({ users: users || [], company_id });
      } catch (e) {
        console.error('company_id filter error:', e.message);
        return res.json({ users: [], company_id });
      }
    }

    // ── Lọc theo company_unit_id (ecosystem_units.id → company_id → departments → users) ──
    if (company_unit_id) {
      try {
        const { data: unit } = await supabase.from('ecosystem_units')
          .select('id, company_id').eq('id', company_unit_id).single();
        
        const resolvedCompanyId = unit?.company_id;
        if (!resolvedCompanyId) return res.json({ users: [], company_id: null });

        const { data: depts } = await supabase.from('departments')
          .select('id').eq('company_id', resolvedCompanyId).eq('is_active', true);
        const deptIds = (depts || []).map(d => d.id);
        if (!deptIds.length) return res.json({ users: [], company_id: resolvedCompanyId });

        let q = supabase.from('users')
          .select('id, full_name, email, phone, avatar, role, department_id, position')
          .in('department_id', deptIds);
        if (!include_inactive) q = q.neq('is_active', false);
        if (role) q = q.eq('role', role);
        if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data: users, error } = await q.order('full_name');
        if (error) throw error;

        // Return with company_id so frontend can fetch departments
        return res.json({ users: users || [], company_id: resolvedCompanyId });
      } catch (e) {
        console.error('company_unit_id filter error:', e.message);
        return res.json({ users: [] });
      }
    }

    // ── Lọc theo ecosystem_unit_id (division/company level) ──
    // Resolve: ecosystem_unit → companies → departments → users
    if (ecosystem_unit_id) {
      try {
        // Get all child units (recursive: division → companies → depts → teams)
        const allUnitIds = [ecosystem_unit_id];

        // Level 1: children trực tiếp
        const { data: level1 } = await supabase
          .from('ecosystem_units')
          .select('id')
          .eq('parent_id', ecosystem_unit_id);
        const l1Ids = (level1 || []).map(u => u.id);
        allUnitIds.push(...l1Ids);

        // Level 2: children của children
        if (l1Ids.length) {
          const { data: level2 } = await supabase
            .from('ecosystem_units')
            .select('id')
            .in('parent_id', l1Ids);
          const l2Ids = (level2 || []).map(u => u.id);
          allUnitIds.push(...l2Ids);

          // Level 3: sâu hơn nếu có
          if (l2Ids.length) {
            const { data: level3 } = await supabase
              .from('ecosystem_units')
              .select('id')
              .in('parent_id', l2Ids);
            allUnitIds.push(...(level3 || []).map(u => u.id));
          }
        }

        // Get company_ids from all units (units that have company_id)
        const { data: unitsWithCompanies } = await supabase
          .from('ecosystem_units')
          .select('company_id')
          .in('id', allUnitIds)
          .not('company_id', 'is', null);

        const companyIds = [...new Set((unitsWithCompanies || []).map(u => u.company_id).filter(Boolean))];

        if (!companyIds.length) {
          // No companies found → try ecosystem_unit_members (for teams/depts)
          const { data: members } = await supabase
            .from('ecosystem_unit_members')
            .select('user_id')
            .in('unit_id', allUnitIds);

          const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
          
          if (!userIds.length) return res.json({ users: [], stats: { total: 0 } });

          let q = supabase.from('users')
            .select('id,email,full_name,phone,avatar,role,position,department_id,is_active,department:departments!users_department_id_fkey(id,name,color)')
            .in('id', userIds);
          if (!include_inactive) q = q.neq('is_active', false);
          if (role) q = q.eq('role', role);
          if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
          const { data: users, error } = await q.order('full_name');
          if (error) throw error;

          return res.json({ users: users || [], stats: { total: users?.length || 0 } });
        }

        // Get departments from companies
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .in('company_id', companyIds)
          .eq('is_active', true);

        const deptIds = (depts || []).map(d => d.id);

        if (!deptIds.length) return res.json({ users: [], stats: { total: 0 } });

        // Get users by department
        let q = supabase.from('users')
          .select('id,email,full_name,phone,avatar,role,position,department_id,is_active,department:departments!users_department_id_fkey(id,name,color)')
          .in('department_id', deptIds);
        if (!include_inactive) q = q.neq('is_active', false);
        if (role) q = q.eq('role', role);
        if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data: users, error } = await q.order('full_name');
        if (error) throw error;

        return res.json({ users: users || [], stats: { total: users?.length || 0 } });
      } catch (e) {
        console.warn('ecosystem_unit_id filter failed:', e.message);
        return res.json({ users: [], stats: { total: 0 } });
      }
    }

    // ── Lọc thông thường (không có ecosystem_unit_id) ──
    const fullCols = `id,email,full_name,phone,avatar,role,position,department_id,team_id,date_of_birth,hire_date,address,emergency_contact,salary,notes,skills,is_active,last_login_at,created_at,department:departments!users_department_id_fkey(id,name,color,company_id),team:teams!users_team_id_fkey(id,name,color)`;
    const basicCols = `id,email,full_name,phone,avatar,role,department_id,team_id,is_active,last_login_at,created_at,department:departments!users_department_id_fkey(id,name,color,company_id),team:teams!users_team_id_fkey(id,name,color)`;
    const basicColsNoDept = `id,email,full_name,phone,avatar,role,department_id,is_active,last_login_at,created_at`;

    let data = null, error = null;

    let q = supabase.from('users').select(fullCols);
    if (!include_inactive) q = q.neq('is_active', false);
    if (role) q = q.eq('role', role);
    if (department_id === 'none') q = q.is('department_id', null);
    else if (department_id) q = q.eq('department_id', department_id);
    
    // Company filter: need to get departments first, then filter users
    if (company_id) {
      const { data: companyDepts } = await supabase
        .from('departments')
        .select('id')
        .eq('company_id', company_id)
        .eq('is_active', true);
      
      const deptIds = (companyDepts || []).map(d => d.id);
      if (deptIds.length > 0) {
        q = q.in('department_id', deptIds);
      } else {
        // No departments for this company → return empty
        return res.json({ users: [], stats: { total: 0, byRole: {} } });
      }
    }
    
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    ({ data, error } = await q.order('full_name'));

    if (error) {
      console.warn('Users full select failed, trying basic+dept:', error.message);
      let q2 = supabase.from('users').select(basicCols);
      if (!include_inactive) q2 = q2.neq('is_active', false);
      if (role) q2 = q2.eq('role', role);
      if (department_id === 'none') q2 = q2.is('department_id', null);
      else if (department_id) q2 = q2.eq('department_id', department_id);
      if (search) q2 = q2.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      ({ data, error } = await q2.order('full_name'));
    }

    if (error) {
      console.warn('Users basic+dept select failed, trying no-dept:', error.message);
      let q3 = supabase.from('users').select(basicColsNoDept);
      if (!include_inactive) q3 = q3.neq('is_active', false);
      if (role) q3 = q3.eq('role', role);
      if (department_id === 'none') q3 = q3.is('department_id', null);
      else if (department_id) q3 = q3.eq('department_id', department_id);
      if (search) q3 = q3.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      ({ data, error } = await q3.order('full_name'));
    }

    if (error) throw error;

    let all = data || [];
    if (company_id) {
      all = all.filter(u => u.department?.company_id === company_id);
    }

    const stats = { total: all.length, byRole: {}, byDept: {} };
    all.forEach(u => {
      stats.byRole[u.role] = (stats.byRole[u.role] || 0) + 1;
      if (u.department?.name) stats.byDept[u.department.name] = (stats.byDept[u.department.name] || 0) + 1;
    });
    res.json({ users: all, stats });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET STAFF DETAIL ═══
r.get('/:id', async (req, res) => {
  try {
    // Defensive: try full columns, fallback to basic
    let user = null;
    const { data: u1, error: e1 } = await supabase.from('users').select(`
      id,email,full_name,phone,avatar,role,position,department_id,team_id,
      date_of_birth,hire_date,address,emergency_contact,salary,notes,skills,
      is_active,last_login_at,created_at,
      department:departments!users_department_id_fkey(id,name,color,company_id),
      team:teams!users_team_id_fkey(id,name,color)
    `).eq('id', req.params.id).single();
    if (!e1) { user = u1; }
    else {
      const { data: u2, error: e2 } = await supabase.from('users').select(`
        id,email,full_name,phone,avatar,role,department_id,is_active,last_login_at,created_at
      `).eq('id', req.params.id).single();
      if (e2) throw e2;
      user = u2;
    }

    let taskStats = { assigned: 0, done: 0, in_progress: 0, created: 0 };
    let recentTasks = [];
    try {
      const [assigned, created] = await Promise.all([
        supabase.from('tasks').select('id,status', { count: 'exact' }).eq('assignee_id', req.params.id),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('created_by_id', req.params.id),
      ]);
      taskStats = {
        assigned: assigned.count || 0,
        done: (assigned.data || []).filter(t => t.status === 'done').length,
        in_progress: (assigned.data || []).filter(t => t.status === 'in_progress').length,
        created: created.count || 0,
      };
      const { data: rt } = await supabase.from('tasks')
        .select('id,title,status,priority,due_date,projects(id,code,name)')
        .eq('assignee_id', req.params.id).neq('status', 'done')
        .order('due_date').limit(10);
      recentTasks = rt || [];
    } catch { }

    let crm_region_ids = [];
    try {
      const { data: ur } = await supabase.from('user_company_regions').select('region_id').eq('user_id', req.params.id);
      crm_region_ids = normalizeRegionIdList((ur || []).map((r) => r.region_id));
    } catch {
      crm_region_ids = [];
    }

    res.json({ user: { ...user, taskStats, recentTasks, crm_region_ids } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE STAFF ═══
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.email || !b.full_name) return res.status(400).json({ error: 'Email và họ tên bắt buộc' });
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/quản lý được tạo nhân viên' });
    }
    const password = b.password || 'tubep123';
    const hash = await bcrypt.hash(password, 12);

    // Build insert object — only include fields that exist
    const insertObj = {
      email: b.email, password: hash, full_name: b.full_name,
      phone: b.phone || null, role: b.role || 'staff',
      department_id: b.department_id || null,
      team_id: b.team_id || null,
    };
    if (b.avatar !== undefined && b.avatar != null && String(b.avatar).trim()) {
      insertObj.avatar = String(b.avatar).trim();
    }
    // Optional fields (need migration 06)
    ['position','date_of_birth','hire_date','address','emergency_contact','salary','notes','skills'].forEach(f => {
      if (b[f] !== undefined) insertObj[f] = b[f] || null;
    });

    if (b.crm_region_ids !== undefined && ['admin', 'manager'].includes(req.user.role)) {
      let targetCo = null;
      if (b.department_id) {
        const { data: d } = await supabase.from('departments').select('company_id').eq('id', b.department_id).maybeSingle();
        targetCo = d?.company_id || null;
      }
      const ids = normalizeRegionIdList(b.crm_region_ids);
      if (ids.length && !targetCo) {
        return res.status(400).json({ error: 'Chọn phòng ban thuộc công ty trước khi gán khu vực CRM' });
      }
      for (const rid of ids) {
        const v = await assertRegionBelongsToCompany(supabase, targetCo, rid);
        if (!v.ok) return res.status(400).json({ error: v.error || 'Khu vực CRM không hợp lệ' });
      }
    }

    const { data, error } = await supabase.from('users').insert(insertObj)
      .select('id,email,full_name,phone,role,department_id,is_active,created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email đã tồn tại' });
      // If column doesn't exist, retry with basic fields
      if (error.message?.includes('column')) {
        const ins2 = {
          email: b.email, password: hash, full_name: b.full_name,
          phone: b.phone || null, role: b.role || 'staff', department_id: b.department_id || null,
        };
        if (insertObj.avatar) ins2.avatar = insertObj.avatar;
        const { data: d2, error: e2 } = await supabase.from('users').insert(ins2)
          .select('id,email,full_name,phone,role,department_id,is_active,created_at').single();
        if (e2) throw e2;
        if (d2?.id && b.crm_region_ids !== undefined && ['admin', 'manager'].includes(req.user.role)) {
          const ids = normalizeRegionIdList(b.crm_region_ids);
          let targetCo = null;
          if (b.department_id) {
            const { data: dpt } = await supabase.from('departments').select('company_id').eq('id', b.department_id).maybeSingle();
            targetCo = dpt?.company_id || null;
          }
          if (ids.length && targetCo) {
            await supabase.from('user_company_regions').delete().eq('user_id', d2.id);
            const { error: insErr } = await supabase.from('user_company_regions').insert(
              ids.map((region_id) => ({ user_id: d2.id, region_id })),
            );
            if (insErr) console.warn('[users POST] user_company_regions:', insErr.message);
          }
        }
        return res.status(201).json({ user: d2 });
      }
      throw error;
    }

    if (data?.id && b.crm_region_ids !== undefined && ['admin', 'manager'].includes(req.user.role)) {
      const ids = normalizeRegionIdList(b.crm_region_ids);
      let targetCo = null;
      if (b.department_id) {
        const { data: dpt } = await supabase.from('departments').select('company_id').eq('id', b.department_id).maybeSingle();
        targetCo = dpt?.company_id || null;
      }
      if (ids.length && targetCo) {
        const { error: insErr } = await supabase.from('user_company_regions').insert(
          ids.map((region_id) => ({ user_id: data.id, region_id })),
        );
        if (insErr) console.warn('[users POST] user_company_regions:', insErr.message);
      }
    }

    // Auto sync org membership to ecosystem (department/team)
    try {
      if (data?.id && (insertObj.department_id || insertObj.team_id)) {
        await syncUserOrgToEcosystem(data.id, { old_department_id: null, old_team_id: null });
      }
    } catch (syncErr) {
      console.warn('[users POST] syncUserOrgToEcosystem:', syncErr.message);
    }

    res.status(201).json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE STAFF ═══
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const targetId = req.params.id;
    const { data: beforeOrg } = await supabase
      .from('users')
      .select('department_id, team_id')
      .eq('id', targetId)
      .maybeSingle();
    const update = { updated_at: new Date().toISOString() };
    const fields = ['full_name','phone','role','position','department_id','team_id','date_of_birth','hire_date','address','emergency_contact','salary','notes','skills','is_active'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.avatar !== undefined) {
      update.avatar = (b.avatar && String(b.avatar).trim()) || null;
    }
    
    // Password: hash and log who changed whose password
    if (b.password) {
      update.password = await bcrypt.hash(b.password, 12);
      console.log(`[PASSWORD] User ${req.user.userId} (${req.user.email}) changed password for user ${targetId}`);
    }

    // Safety: NEVER allow email or id to be changed via this endpoint
    delete update.email;
    delete update.id;

    // Try update, fallback to basic fields if columns don't exist
    let { data, error } = await supabase.from('users').update(update).eq('id', req.params.id)
      .select('id,email,full_name,phone,avatar,role,department_id,is_active,created_at').single();
    if (error && error.message?.includes('column')) {
      const safeUpdate = {};
      ['full_name','phone','role','department_id','is_active','avatar'].forEach(f => {
        if (update[f] !== undefined) safeUpdate[f] = update[f];
      });
      if (update.password) safeUpdate.password = update.password;
      safeUpdate.updated_at = update.updated_at;
      ({ data, error } = await supabase.from('users').update(safeUpdate).eq('id', req.params.id)
        .select('id,email,full_name,phone,avatar,role,department_id,is_active,created_at').single());
    }
    if (error) throw error;

    if (b.crm_region_ids !== undefined) {
      if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Không có quyền gán khu vực CRM' });
      }
      const { data: targetUser } = await supabase
        .from('users')
        .select('id, company_id, department_id')
        .eq('id', targetId)
        .maybeSingle();
      let targetCo = targetUser?.company_id || null;
      if (!targetCo && targetUser?.department_id) {
        const { data: d } = await supabase.from('departments').select('company_id').eq('id', targetUser.department_id).maybeSingle();
        targetCo = d?.company_id || null;
      }
      const ids = normalizeRegionIdList(b.crm_region_ids);
      for (const rid of ids) {
        const v = await assertRegionBelongsToCompany(supabase, targetCo, rid);
        if (!v.ok) return res.status(400).json({ error: v.error || 'Khu vực không hợp lệ' });
      }
      await supabase.from('user_company_regions').delete().eq('user_id', targetId);
      if (ids.length) {
        const { error: insErr } = await supabase.from('user_company_regions').insert(
          ids.map((region_id) => ({ user_id: targetId, region_id })),
        );
        if (insErr) throw insErr;
      }
    }

    // Auto sync org membership changes to ecosystem
    try {
      const old_department_id = beforeOrg?.department_id || null;
      const old_team_id = beforeOrg?.team_id || null;
      const new_department_id = b.department_id !== undefined ? (b.department_id || null) : old_department_id;
      const new_team_id = b.team_id !== undefined ? (b.team_id || null) : old_team_id;
      if (String(old_department_id || '') !== String(new_department_id || '') || String(old_team_id || '') !== String(new_team_id || '')) {
        await syncUserOrgToEcosystem(targetId, { old_department_id, old_team_id });
      }
    } catch (syncErr) {
      console.warn('[users PUT] syncUserOrgToEcosystem:', syncErr.message);
    }

    res.json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DEACTIVATE STAFF (soft delete) ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    await supabase.from('users').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Đã vô hiệu hóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ HARD DELETE STAFF — Xóa vĩnh viễn (admin only) ═══
// NULL hoá các trường role/created_by ở các bảng nghiệp vụ, DELETE log/comment riêng,
// rồi DELETE users (cascade tự xử lý các bảng có ON DELETE CASCADE).
// Triển khai qua Postgres function `delete_user_hard` (xem migration 275).
r.delete('/:id/permanent', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới được xóa vĩnh viễn' });
    }
    const targetId = req.params.id;
    if (!targetId) return res.status(400).json({ error: 'Thiếu id' });
    if (String(targetId) === String(req.user.id || req.user.userId)) {
      return res.status(400).json({ error: 'Không thể tự xóa tài khoản của chính bạn' });
    }

    const { data: target, error: tErr } = await supabase
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', targetId)
      .single();
    if (tErr || !target) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    // Cảnh báo nếu xóa admin cuối cùng
    if (target.role === 'admin') {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);
      if ((count || 0) <= 1) {
        return res.status(400).json({ error: 'Không thể xóa admin cuối cùng còn hoạt động' });
      }
    }

    const { data, error } = await supabase.rpc('delete_user_hard', { p_user_id: targetId });
    if (error) {
      console.error('[users DELETE permanent]', error);
      const msg = error.message || '';
      if (msg.includes('delete_user_hard') && msg.toLowerCase().includes('does not exist')) {
        return res.status(500).json({
          error: 'Chưa cài đặt function `delete_user_hard`. Chạy migration database/275_delete_user_hard.sql trước.',
        });
      }
      return res.status(500).json({ error: msg || 'Lỗi xóa nhân viên' });
    }

    res.json({
      message: `Đã xóa vĩnh viễn nhân viên «${target.full_name || target.email}»`,
      data,
    });
  } catch (e) {
    console.error('[users DELETE permanent]', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
