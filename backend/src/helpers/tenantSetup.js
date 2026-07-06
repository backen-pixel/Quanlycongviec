const bcrypt = require('bcryptjs');

const { supabase } = require('../config/supabase');

const { getTenantCompanyIds, invalidateTenantCache } = require('./tenantScope');

const { checkCompanyLimit, checkUserLimit } = require('./tenantLimits');

const { invalidatePipelinesAndStages } = require('./crmTaxonomyCache');

const { syncDepartmentToEcosystem, syncCompanyToEcosystem } = require('./ecosystemSync');



const DEFAULT_LEAD_STAGES = [

  { name: 'Mới', icon: '🆕', color: '#94A3B8', order_index: 1 },

  { name: 'Đã liên hệ', icon: '📞', color: '#3B82F6', order_index: 2 },

  { name: 'Đang tư vấn', icon: '💬', color: '#8B5CF6', order_index: 3 },

  { name: 'Chờ phản hồi', icon: '⏳', color: '#F59E0B', order_index: 4 },

  { name: 'Chuyển Deal', icon: '✅', color: '#10B981', order_index: 5, is_won: true },

  { name: 'Mất', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },

];



const DEFAULT_DEAL_STAGES = [

  { name: 'Deal mới', icon: '🆕', color: '#06B6D4', order_index: 1 },

  { name: 'Báo giá', icon: '💰', color: '#F59E0B', order_index: 2 },

  { name: 'Đàm phán', icon: '🤝', color: '#8B5CF6', order_index: 3 },

  { name: 'Ký hợp đồng', icon: '📝', color: '#3B82F6', order_index: 4 },

  { name: 'Thắng', icon: '🏆', color: '#10B981', order_index: 5, is_won: true },

  { name: 'Thua', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },

];



const DEPT_TEMPLATES = {

  sales: 'Tư vấn (Sales)',

  design: 'Thiết kế (Design)',

  production: 'Sản xuất (Production)',

  delivery: 'Vận chuyển',

  'customer-care': 'Chăm sóc khách hàng',

  accounting: 'Kế toán',

};



function isTenantBootstrapAdmin(user) {

  const role = String(user?.role ?? '').trim().toLowerCase();

  const hasTenant = user?.tenant_id != null && String(user.tenant_id).trim() !== '';

  const noCompany = user?.company_id == null || String(user.company_id).trim() === '';

  return hasTenant && role === 'admin' && noCompany;

}



function isTenantSetupAdmin(user) {

  const role = String(user?.role ?? '').trim().toLowerCase();

  return !!(user?.tenant_id && role === 'admin');

}



function deptSlug(name, companyId) {

  const base = String(name || 'dept').toLowerCase()

    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dept';

  return `${base}-${String(companyId || '').slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;

}



async function assertTenantSetupAdmin(user) {

  if (!isTenantSetupAdmin(user)) {

    const err = new Error('Chỉ admin tenant mới thực hiện thiết lập');

    err.code = 'forbidden';

    throw err;

  }

}



async function resolveTenantCompanyId(user, bodyCompanyId) {

  const companyIds = await getTenantCompanyIds(user.tenant_id);

  const cid = bodyCompanyId || user.company_id || companyIds[0] || null;

  if (!cid || !companyIds.map(String).includes(String(cid))) {

    const err = new Error('Chưa có công ty hoặc công ty không thuộc hệ sinh thái của bạn');

    err.code = 'validation';

    throw err;

  }

  return cid;

}



async function getLevelId(levelIndex) {

  const { data } = await supabase.from('ecosystem_levels').select('id').eq('level_index', levelIndex).maybeSingle();

  return data?.id || null;

}



async function linkDivisionToCompany(tenantId, companyId) {

  const level1Id = await getLevelId(1);

  if (!level1Id) return null;

  const { data: divUnit } = await supabase

    .from('ecosystem_units')

    .select('id')

    .eq('tenant_id', tenantId)

    .eq('level_id', level1Id)

    .limit(1)

    .maybeSingle();

  if (divUnit?.id) {

    await supabase.from('companies').update({ division_unit_id: divUnit.id }).eq('id', companyId);

    return divUnit.id;

  }

  return null;

}



async function getTenantSetupProgress(user) {

  const tenantId = user?.tenant_id;

  if (!tenantId) {

    return { needs_setup: false, enforced: false, reason: 'legacy' };

  }



  const { data: tenant } = await supabase

    .from('tenants')

    .select('id, name, settings')

    .eq('id', tenantId)

    .maybeSingle();



  const onboardingCompleted = tenant?.settings?.onboarding_completed === true;

  const companyIds = await getTenantCompanyIds(tenantId);

  const companyId = user?.company_id || companyIds[0] || null;



  const level1Id = await getLevelId(1);

  let divisionsCount = 0;

  if (level1Id) {

    const { count } = await supabase

      .from('ecosystem_units')

      .select('id', { count: 'exact', head: true })

      .eq('tenant_id', tenantId)

      .eq('level_id', level1Id);

    divisionsCount = count || 0;

  }



  let deptsCount = 0;

  let otherStaffCount = 0;

  let pipelineCount = 0;

  let company = null;

  let pipelines = [];



  if (companyId) {

    const [{ count: dCount }, { count: sCount }, { count: pCount }, coRes, pipeRes] = await Promise.all([

      supabase.from('departments').select('id', { count: 'exact', head: true }).eq('company_id', companyId),

      supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('id', user?.userId || user?.id || ''),

      supabase.from('crm_pipelines').select('id', { count: 'exact', head: true }).eq('company_id', companyId),

      supabase.from('companies').select('id, name, short_name, phone, address, division_unit_id').eq('id', companyId).maybeSingle(),

      supabase.from('crm_pipelines').select('id, name, is_default').eq('company_id', companyId).order('created_at'),

    ]);

    deptsCount = dCount || 0;

    otherStaffCount = sCount || 0;

    pipelineCount = pCount || 0;

    company = coRes.data || null;

    pipelines = pipeRes.data || [];



    if (pipelines.length) {

      const pipeIds = pipelines.map((p) => p.id);

      const { data: stages } = await supabase

        .from('crm_pipeline_stages')

        .select('id, name, pipeline_type, order_index, is_won, is_lost')

        .in('pipeline_id', pipeIds)

        .order('order_index');

      const stageMap = {};

      (stages || []).forEach((s) => {

        if (!stageMap[s.pipeline_id]) stageMap[s.pipeline_id] = { lead: [], deal: [] };

        const bucket = s.pipeline_type === 'deal' ? 'deal' : 'lead';

        stageMap[s.pipeline_id][bucket].push(s);

      });

      pipelines = pipelines.map((p) => ({

        ...p,

        stages: stageMap[p.id] || { lead: [], deal: [] },

      }));

    }

  }



  const missions = [

    { id: 'welcome', label: 'Chào mừng', done: true, required: false },

    {

      id: 'ecosystem',

      label: 'Hệ sinh thái & Khối',

      done: !!(tenant?.name && divisionsCount > 0),

      required: false,

    },

    {

      id: 'company',

      label: 'Công ty / Xưởng',

      done: companyIds.length > 0,

      required: true,

    },

    {

      id: 'departments',

      label: 'Phòng ban',

      done: deptsCount > 0,

      required: false,

    },

    {

      id: 'staff',

      label: 'Nhân viên',

      done: otherStaffCount > 0,

      required: false,

    },

    {

      id: 'pipeline',

      label: 'Pipeline CRM',

      done: pipelineCount > 0,

      required: true,

    },

    {

      id: 'finish',

      label: 'Hoàn tất',

      done: onboardingCompleted,

      required: true,

    },

  ];



  const isAdmin = isTenantSetupAdmin(user);

  const needsSetup = isAdmin && !onboardingCompleted;



  return {

    needs_setup: needsSetup,

    enforced: true,

    tenant_id: tenantId,

    tenant_name: tenant?.name || '',

    companies_count: companyIds.length,

    company_id: companyId,

    company,

    divisions_count: divisionsCount,

    departments_count: deptsCount,

    staff_count: otherStaffCount,

    pipeline_count: pipelineCount,

    pipelines,

    missions,

    onboarding_completed: onboardingCompleted,

  };

}



async function getTenantSetupStatus(user) {

  return getTenantSetupProgress(user);

}



async function bootstrapDefaultCrmPipeline(companyId, companyName) {

  const { data: pipeline, error } = await supabase

    .from('crm_pipelines')

    .insert({

      name: `Pipeline ${companyName}`.slice(0, 120),

      company_id: companyId,

      description: 'Pipeline mặc định khi thiết lập xưởng mới',

      is_default: true,

      is_active: true,

    })

    .select('id')

    .single();

  if (error) throw error;



  const stages = [

    ...DEFAULT_LEAD_STAGES.map((s) => ({ ...s, pipeline_id: pipeline.id, pipeline_type: 'lead', is_active: true })),

    ...DEFAULT_DEAL_STAGES.map((s) => ({ ...s, pipeline_id: pipeline.id, pipeline_type: 'deal', is_active: true })),

  ];

  const { error: stErr } = await supabase.from('crm_pipeline_stages').insert(stages);

  if (stErr) throw stErr;

  invalidatePipelinesAndStages();

  return pipeline;

}



async function completeTenantFirstSetup(user, body = {}) {

  const userId = user?.userId || user?.id;

  if (!userId || !user?.tenant_id) {

    const err = new Error('Chỉ tài khoản tenant mới cần thiết lập');

    err.code = 'not_tenant_user';

    throw err;

  }

  if (!isTenantBootstrapAdmin(user)) {

    const err = new Error('Tài khoản đã gắn công ty — dùng mục cập nhật công ty');

    err.code = 'already_setup';

    throw err;

  }



  const companyIds = await getTenantCompanyIds(user.tenant_id);

  if (companyIds.length > 0) {

    const err = new Error('Hệ sinh thái đã có công ty — không cần thiết lập lại');

    err.code = 'already_setup';

    throw err;

  }



  const limit = await checkCompanyLimit(user.tenant_id);

  if (!limit.ok) {

    const err = new Error(limit.error || 'Đã đạt giới hạn công ty của gói');

    err.code = 'company_limit';

    throw err;

  }



  const companyName = String(body.company_name || '').trim();

  if (!companyName) {

    const err = new Error('Nhập tên công ty / xưởng');

    err.code = 'validation';

    throw err;

  }



  const insertRow = {

    name: companyName,

    short_name: String(body.short_name || '').trim() || null,

    phone: String(body.phone || '').trim() || null,

    address: String(body.address || '').trim() || null,

    email: String(body.email || user.email || '').trim() || null,

    tenant_id: user.tenant_id,

  };



  const { data: company, error: cErr } = await supabase

    .from('companies')

    .insert(insertRow)

    .select('*')

    .single();

  if (cErr) throw cErr;



  await linkDivisionToCompany(user.tenant_id, company.id);

  await syncCompanyToEcosystem(company);

  await supabase

    .from('users')

    .update({ company_id: company.id, updated_at: new Date().toISOString() })

    .eq('id', userId);



  const { data: existingLink } = await supabase

    .from('user_companies')

    .select('id')

    .eq('user_id', userId)

    .eq('company_id', company.id)

    .maybeSingle();

  if (!existingLink) {

    await supabase.from('user_companies').insert({

      user_id: userId,

      company_id: company.id,

      is_primary: true,

    });

  }



  await bootstrapDefaultCrmPipeline(company.id, companyName);

  invalidateTenantCache(user.tenant_id);



  const { data: freshUser } = await supabase

    .from('users')

    .select('id, email, full_name, role, avatar, phone, department_id, company_id, tenant_id, position')

    .eq('id', userId)

    .single();



  return {

    company,

    user: freshUser,

    company_id: company.id,

  };

}



async function setupTenantEcosystem(user, body = {}) {

  await assertTenantSetupAdmin(user);

  const tenantName = String(body.tenant_name || '').trim();

  const divisionName = String(body.division_name || '').trim();



  if (!tenantName && !divisionName) {

    const err = new Error('Nhập tên hệ sinh thái hoặc tên Khối');

    err.code = 'validation';

    throw err;

  }



  if (tenantName) {

    await supabase.from('tenants').update({ name: tenantName }).eq('id', user.tenant_id);

  }



  let divisionUnit = null;

  const level1Id = await getLevelId(1);

  if (divisionName && level1Id) {

    const { data: existing } = await supabase

      .from('ecosystem_units')

      .select('id, name')

      .eq('tenant_id', user.tenant_id)

      .eq('level_id', level1Id)

      .limit(1)

      .maybeSingle();



    if (existing) {

      divisionUnit = existing;

    } else {

      const { data: unit, error } = await supabase

        .from('ecosystem_units')

        .insert({

          name: divisionName,

          level_id: level1Id,

          tenant_id: user.tenant_id,

          is_active: true,

        })

        .select()

        .single();

      if (error) throw error;

      divisionUnit = unit;

    }



    const companyIds = await getTenantCompanyIds(user.tenant_id);

    if (companyIds.length === 1) {

      await supabase.from('companies').update({ division_unit_id: divisionUnit.id }).eq('id', companyIds[0]);

    }

  }



  return { ok: true, division: divisionUnit };

}



async function setupTenantDepartments(user, body = {}) {

  await assertTenantSetupAdmin(user);

  const companyId = await resolveTenantCompanyId(user, body.company_id);



  const templates = Array.isArray(body.templates) ? body.templates : [];

  const customNames = Array.isArray(body.names) ? body.names : [];

  const names = [];

  templates.forEach((t) => {

    if (DEPT_TEMPLATES[t]) names.push(DEPT_TEMPLATES[t]);

  });

  customNames.forEach((n) => {

    const s = String(n || '').trim();

    if (s) names.push(s);

  });



  if (!names.length) {

    const err = new Error('Chọn ít nhất một phòng ban');

    err.code = 'validation';

    throw err;

  }



  const { data: co } = await supabase

    .from('companies')

    .select('division_unit_id')

    .eq('id', companyId)

    .maybeSingle();

  const divisionUnitId = co?.division_unit_id || null;



  const created = [];

  for (const name of names) {

    const { data, error } = await supabase

      .from('departments')

      .insert({

        name,

        slug: deptSlug(name, companyId),

        company_id: companyId,

        division_unit_id: divisionUnitId,

        color: '#6366F1',

      })

      .select()

      .single();

    if (error) throw error;

    await syncDepartmentToEcosystem({ ...data, company_id: companyId, division_unit_id: divisionUnitId });

    created.push(data);

  }



  return { departments: created };

}



async function setupTenantStaff(user, body = {}) {

  await assertTenantSetupAdmin(user);

  const companyId = await resolveTenantCompanyId(user, body.company_id);

  const deptId = body.department_id || null;

  const staff = Array.isArray(body.staff) ? body.staff : [];

  const validRows = staff.filter((r) => String(r?.email || '').trim() && String(r?.full_name || '').trim());



  if (!validRows.length) {

    const err = new Error('Nhập ít nhất một nhân viên (email + họ tên)');

    err.code = 'validation';

    throw err;

  }



  const defaultPassword = String(body.default_password || 'tubep123');

  const defaultRole = body.role || 'staff';

  const created = [];

  const errors = [];



  for (const row of validRows) {

    const limit = await checkUserLimit(user.tenant_id);

    if (!limit.ok) {

      errors.push({ email: row.email, error: limit.error });

      break;

    }



    const email = String(row.email).trim().toLowerCase();

    const full_name = String(row.full_name).trim();

    const hash = await bcrypt.hash(row.password || defaultPassword, 12);

    const insertObj = {

      email,

      password: hash,

      full_name,

      role: row.role || defaultRole,

      department_id: row.department_id || deptId || null,

      tenant_id: user.tenant_id,

      company_id: companyId,

    };



    const { data, error } = await supabase

      .from('users')

      .insert(insertObj)

      .select('id, email, full_name, role, department_id')

      .single();



    if (error) {

      errors.push({ email, error: error.code === '23505' ? 'Email đã tồn tại' : error.message });

      continue;

    }



    const { data: linkExists } = await supabase

      .from('user_companies')

      .select('id')

      .eq('user_id', data.id)

      .eq('company_id', companyId)

      .maybeSingle();

    if (!linkExists) {

      await supabase.from('user_companies').insert({

        user_id: data.id,

        company_id: companyId,

        is_primary: true,

      });

    }

    created.push(data);

  }



  return { created, errors };

}



async function finishTenantSetup(user) {

  await assertTenantSetupAdmin(user);

  const companyIds = await getTenantCompanyIds(user.tenant_id);

  if (!companyIds.length) {

    const err = new Error('Cần tạo công ty trước khi hoàn tất');

    err.code = 'validation';

    throw err;

  }



  const { data: tenant } = await supabase

    .from('tenants')

    .select('settings')

    .eq('id', user.tenant_id)

    .maybeSingle();



  const settings = {

    ...(tenant?.settings || {}),

    onboarding_completed: true,

    onboarding_completed_at: new Date().toISOString(),

  };



  await supabase.from('tenants').update({ settings }).eq('id', user.tenant_id);

  return { ok: true };

}



module.exports = {

  getTenantSetupStatus,

  getTenantSetupProgress,

  completeTenantFirstSetup,

  setupTenantEcosystem,

  setupTenantDepartments,

  setupTenantStaff,

  finishTenantSetup,

  isTenantBootstrapAdmin,

  isTenantSetupAdmin,

  bootstrapDefaultCrmPipeline,

  DEPT_TEMPLATES,

};

