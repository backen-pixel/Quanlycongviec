const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

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
        { id: 'c6', slug: 'shipping', name: 'Vận chuyển', color: '#06B6D4', icon: '🚛', order_index: 6 },
        { id: 'c7', slug: 'installation', name: 'Lắp đặt', color: '#3B82F6', icon: '🔧', order_index: 7 },
        { id: 'c8', slug: 'customer-care', name: 'Chăm sóc KH', color: '#EF4444', icon: '❤️', order_index: 8 },
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

// ════════════════════════════════════════════════════
// PARAM ROUTES (/:id comes after static routes)
// ════════════════════════════════════════════════════

// ═══ STAFF LIST (with filters) ═══
r.get('/', async (req, res) => {
  try {
    const { role, department_id, company_id, ecosystem_unit_id, company_unit_id, search, include_inactive } = req.query;

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
        if (!include_inactive) q = q.eq('is_active', true);
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
          if (!include_inactive) q = q.eq('is_active', true);
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
        if (!include_inactive) q = q.eq('is_active', true);
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
    const fullCols = `id,email,full_name,phone,avatar,role,position,department_id,team_id,date_of_birth,hire_date,address,emergency_contact,salary,notes,skills,is_active,last_login_at,created_at,department:departments!users_department_id_fkey(id,name,color,company_id),team:teams(id,name,color)`;
    const basicCols = `id,email,full_name,phone,avatar,role,department_id,team_id,is_active,last_login_at,created_at,department:departments!users_department_id_fkey(id,name,color,company_id),team:teams(id,name,color)`;
    const basicColsNoDept = `id,email,full_name,phone,avatar,role,department_id,is_active,last_login_at,created_at`;

    let data = null, error = null;

    let q = supabase.from('users').select(fullCols);
    if (!include_inactive) q = q.eq('is_active', true);
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
      if (!include_inactive) q2 = q2.eq('is_active', true);
      if (role) q2 = q2.eq('role', role);
      if (department_id === 'none') q2 = q2.is('department_id', null);
      else if (department_id) q2 = q2.eq('department_id', department_id);
      if (search) q2 = q2.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      ({ data, error } = await q2.order('full_name'));
    }

    if (error) {
      console.warn('Users basic+dept select failed, trying no-dept:', error.message);
      let q3 = supabase.from('users').select(basicColsNoDept);
      if (!include_inactive) q3 = q3.eq('is_active', true);
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
      department:departments!users_department_id_fkey(id,name,color),
      team:teams(id,name,color)
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

    res.json({ user: { ...user, taskStats, recentTasks } });
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
    // Optional fields (need migration 06)
    ['position','date_of_birth','hire_date','address','emergency_contact','salary','notes','skills'].forEach(f => {
      if (b[f] !== undefined) insertObj[f] = b[f] || null;
    });

    const { data, error } = await supabase.from('users').insert(insertObj)
      .select('id,email,full_name,phone,role,department_id,is_active,created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email đã tồn tại' });
      // If column doesn't exist, retry with basic fields
      if (error.message?.includes('column')) {
        const { data: d2, error: e2 } = await supabase.from('users').insert({
          email: b.email, password: hash, full_name: b.full_name,
          phone: b.phone || null, role: b.role || 'staff', department_id: b.department_id || null,
        }).select('id,email,full_name,phone,role,department_id,is_active,created_at').single();
        if (e2) throw e2;
        return res.status(201).json({ user: d2 });
      }
      throw error;
    }
    res.status(201).json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE STAFF ═══
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['full_name','phone','role','position','department_id','team_id','date_of_birth','hire_date','address','emergency_contact','salary','notes','skills','is_active','avatar'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.password) update.password = await bcrypt.hash(b.password, 12);

    // Try update, fallback to basic fields if columns don't exist
    let { data, error } = await supabase.from('users').update(update).eq('id', req.params.id)
      .select('id,email,full_name,phone,role,department_id,is_active,created_at').single();
    if (error && error.message?.includes('column')) {
      const safeUpdate = {};
      ['full_name','phone','role','department_id','is_active','avatar'].forEach(f => {
        if (update[f] !== undefined) safeUpdate[f] = update[f];
      });
      if (update.password) safeUpdate.password = update.password;
      safeUpdate.updated_at = update.updated_at;
      ({ data, error } = await supabase.from('users').update(safeUpdate).eq('id', req.params.id)
        .select('id,email,full_name,phone,role,department_id,is_active,created_at').single());
    }
    if (error) throw error;
    res.json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DEACTIVATE STAFF ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    await supabase.from('users').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Đã vô hiệu hóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
