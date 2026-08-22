/**
 * Biến dữ liệu của bước module trên luồng.
 *
 * Tab «Dữ liệu» của node mô tả hợp đồng bàn giao ở mức cột CSDL — hữu ích để đọc
 * nhưng dán vào tin nhắn thì ra uuid. File này định nghĩa bộ biến DÙNG ĐƯỢC: giá trị
 * đã tra cứu sẵn thành tên người, tên cột, ngày kiểu Việt Nam.
 *
 * Khối hành động phía sau tham chiếu bằng {{nodeId.key}} — cùng cú pháp với biến của
 * khối Lấy báo cáo / AI, nên người dùng không phải phân biệt hai loại.
 *
 * Chủ thể (deal hoặc dự án) do người chạy chọn, hoặc luồng tự lấy bản ghi mới nhất
 * khi chạy thử.
 */

const { supabase } = require('../config/supabase');

const V = (key, label, type, desc) => ({ key, label, type, desc });

/** Tên bước để AI biết khối số liệu đang đọc là của công đoạn nào. */
const MODULE_LABEL = {
  crm: 'CRM — deal / khách hàng',
  production: 'Sản xuất — xưởng',
  logistics: 'Vận chuyển / Lắp đặt',
  projects: 'Dự án & công việc',
};

/** Danh mục biến — frontend nạp qua GET /flows/meta/module-variables để dựng menu chèn. */
const MODULE_VARIABLES = {
  crm: [
    V('deal_code', 'Mã deal', 'string', 'crm_leads.code'),
    V('deal_title', 'Tên deal', 'string', 'crm_leads.title'),
    V('deal_value', 'Giá trị deal', 'number', 'estimated_value, đã format kiểu 250.000.000'),
    V('deposit_amount', 'Tiền cọc', 'number', 'deposit_amount đã format'),
    V('customer_name', 'Tên khách hàng', 'string', 'customers.full_name'),
    V('customer_phone', 'SĐT khách', 'string', 'crm_leads.phone, thiếu thì lấy customers.phone'),
    V('install_address', 'Địa chỉ lắp', 'string', 'install_address của deal hoặc địa chỉ khách'),
    V('owner_name', 'Sale phụ trách', 'string', 'Tên người ở assigned_to / lead_owner_id'),
    V('stage_name', 'Cột CRM hiện tại', 'string', 'Tên cột trong pipeline CRM'),
    V('expected_close_date', 'Ngày hẹn chốt', 'date', 'expected_close_date'),
    V('kanban_deadline_at', 'Hạn trên cột', 'date', 'kanban_deadline_at'),
    V('sx_handover_at', 'Mốc vào xưởng', 'date', 'Lần đầu deal được xưởng nhận'),
    V('task_summary', 'Nhiệm vụ CRM', 'string', 'Dạng «3/7 việc đã xong»'),
  ],
  production: [
    V('project_code', 'Mã dự án', 'string', 'projects.code'),
    V('project_name', 'Tên dự án', 'string', 'projects.name'),
    V('customer_name', 'Tên khách hàng', 'string', 'customers.full_name'),
    V('workshop_company', 'Xưởng SX', 'string', 'Tên công ty sản xuất'),
    V('workshop_type', 'Loại xưởng', 'string', 'workshop_project_types.name'),
    V('sx_stage_name', 'Cột kanban SX', 'string', 'Tên cột SX hiện tại'),
    V('production_person', 'NV phụ trách SX', 'string', 'production_person_id'),
    V('order_date', 'Ngày đặt hàng', 'date', 'projects.order_date'),
    V('sx_reception_date', 'Ngày xưởng nhận', 'date', 'projects.sx_reception_date'),
    V('production_deadline', 'Deadline SX', 'date', 'production_finish_date hoặc production_deadline'),
    V('days_to_deadline', 'Còn mấy ngày tới deadline', 'number', 'Số âm nghĩa là đã trễ'),
    V('install_date', 'Ngày lắp', 'date', 'projects.install_date'),
    V('project_status', 'Trạng thái dự án', 'string', 'projects.status'),
    V('task_summary', 'Nhiệm vụ dự án', 'string', 'Dạng «5/12 việc đã xong»'),
  ],
  logistics: [
    V('project_code', 'Mã dự án', 'string', 'projects.code'),
    V('project_name', 'Tên dự án', 'string', 'projects.name'),
    V('customer_name', 'Tên khách hàng', 'string', 'customers.full_name'),
    V('vc_stage_name', 'Cột kanban VC', 'string', 'Tên cột VC hiện tại'),
    V('logistics_company', 'Công ty VC', 'string', 'Tên công ty vận chuyển'),
    V('logistics_person', 'NV vận chuyển', 'string', 'logistics_person_id'),
    V('installer_person', 'NV lắp đặt', 'string', 'installer_person_id'),
    V('vc_handover_status', 'Trạng thái bàn giao', 'string', 'pending / scheduled / external / confirmed'),
    V('pickup_at', 'Ngày lấy hàng', 'date', 'projects.pickup_at'),
    V('install_date', 'Ngày lắp', 'date', 'projects.install_date'),
    V('install_address', 'Địa chỉ lắp', 'string', 'projects.install_address'),
    V('vc_notes', 'Ghi chú VC', 'string', 'projects.vc_notes'),
    V('task_summary', 'Nhiệm vụ lắp', 'string', 'Dạng «2/6 việc đã xong»'),
  ],
  projects: [
    V('project_code', 'Mã dự án', 'string', 'projects.code'),
    V('project_name', 'Tên dự án', 'string', 'projects.name'),
    V('customer_name', 'Tên khách hàng', 'string', 'customers.full_name'),
    V('project_status', 'Trạng thái', 'string', 'projects.status'),
    V('deadline', 'Hạn dự án', 'date', 'projects.deadline'),
    V('task_summary', 'Công việc', 'string', 'Dạng «5/12 việc đã xong»'),
  ],
};

const HANDOVER_STATUS_LABEL = {
  pending: 'Chờ sale chọn đơn vị',
  scheduled: 'Đã xếp đơn vị trong hệ thống',
  external: 'Thuê vận chuyển ngoài',
  confirmed: 'Hai bên đã xác nhận',
};

const PROJECT_STATUS_LABEL = {
  consulting: 'Đang tư vấn',
  producing: 'Đang sản xuất',
  shipping: 'Đang giao / lắp',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
};

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Mốc lưu theo UTC nhưng người đọc ở VN — cộng bù trước khi cắt ngày.
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${vn.getUTCFullYear()}`;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString('vi-VN');
}

function daysUntil(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

function taskSummary(rows) {
  if (!rows?.length) return 'Chưa có việc nào';
  const done = rows.filter((t) => ['done', 'completed'].includes(String(t.status || '').toLowerCase())).length;
  return `${done}/${rows.length} việc đã xong`;
}

/**
 * Ngữ cảnh đọc dữ liệu — nạp lười và nhớ kết quả vì một luồng thường chỉ đụng
 * tới vài biến. Deal và dự án suy ra được lẫn nhau qua crm_leads.project_id.
 */
function createDataContext({ dealId = null, projectId = null } = {}) {
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, Promise.resolve().then(fn).catch(() => null));
    return memo.get(key);
  };

  const getDeal = () => once('deal', async () => {
    let query = supabase.from('crm_leads').select('*');
    if (dealId) query = query.eq('id', dealId);
    else if (projectId) query = query.eq('project_id', projectId).limit(1);
    else return null;
    const { data } = await query.maybeSingle();
    return data || null;
  });

  const getProject = () => once('project', async () => {
    let id = projectId;
    if (!id) id = (await getDeal())?.project_id || null;
    if (!id) return null;
    const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
    return data || null;
  });

  const getCustomer = () => once('customer', async () => {
    const id = (await getDeal())?.customer_id || (await getProject())?.customer_id;
    if (!id) return null;
    const { data } = await supabase
      .from('customers').select('full_name, phone, address').eq('id', id).maybeSingle();
    return data || null;
  });

  const getUserName = (userId) => once(`user:${userId || ''}`, async () => {
    if (!userId) return '';
    const { data } = await supabase.from('users').select('full_name, email').eq('id', userId).maybeSingle();
    return data?.full_name || data?.email || '';
  });

  const getCompanyName = (companyId) => once(`company:${companyId || ''}`, async () => {
    if (!companyId) return '';
    const { data } = await supabase.from('companies').select('name, short_name').eq('id', companyId).maybeSingle();
    return data?.short_name || data?.name || '';
  });

  const getStageName = (table, stageId) => once(`stage:${table}:${stageId || ''}`, async () => {
    if (!stageId) return '';
    const { data } = await supabase.from(table).select('name').eq('id', stageId).maybeSingle();
    return data?.name || '';
  });

  const getWorkshopTypeName = (typeId) => once(`wtype:${typeId || ''}`, async () => {
    if (!typeId) return '';
    const { data } = await supabase.from('workshop_project_types').select('name').eq('id', typeId).maybeSingle();
    return data?.name || '';
  });

  const getCrmTasks = () => once('crmTasks', async () => {
    const d = await getDeal();
    if (!d?.id) return [];
    const { data } = await supabase
      .from('crm_tasks').select('status').eq('lead_id', d.id).neq('status', 'cancelled').limit(500);
    return data || [];
  });

  const getProjectTasks = () => once('projectTasks', async () => {
    const p = await getProject();
    if (!p?.id) return [];
    const { data } = await supabase
      .from('tasks').select('status').eq('project_id', p.id).neq('status', 'cancelled').limit(500);
    return data || [];
  });

  return {
    getDeal, getProject, getCustomer, getUserName, getCompanyName,
    getStageName, getWorkshopTypeName, getCrmTasks, getProjectTasks,
  };
}

async function resolveCrm(ctx) {
  const deal = await ctx.getDeal();
  if (!deal) return null;
  const customer = await ctx.getCustomer();
  return {
    deal_code: deal.code || '',
    deal_title: deal.title || '',
    deal_value: formatMoney(deal.estimated_value),
    deposit_amount: formatMoney(deal.deposit_amount),
    customer_name: customer?.full_name || '',
    customer_phone: deal.phone || customer?.phone || '',
    install_address: deal.install_address || customer?.address || '',
    owner_name: await ctx.getUserName(deal.assigned_to || deal.lead_owner_id),
    stage_name: await ctx.getStageName('crm_pipeline_stages', deal.stage_id),
    expected_close_date: formatDate(deal.expected_close_date),
    kanban_deadline_at: formatDate(deal.kanban_deadline_at),
    sx_handover_at: formatDate(deal.sx_handover_at),
    task_summary: taskSummary(await ctx.getCrmTasks()),
  };
}

async function resolveProduction(ctx) {
  const p = await ctx.getProject();
  if (!p) return null;
  const deadline = p.production_finish_date || p.production_deadline;
  return {
    project_code: p.code || '',
    project_name: p.name || '',
    customer_name: (await ctx.getCustomer())?.full_name || '',
    workshop_company: await ctx.getCompanyName(p.company_id),
    workshop_type: await ctx.getWorkshopTypeName(p.workshop_type_id),
    sx_stage_name: await ctx.getStageName('production_pipeline_stages', p.sx_kanban_column_id),
    production_person: await ctx.getUserName(p.production_person_id),
    order_date: formatDate(p.order_date),
    sx_reception_date: formatDate(p.sx_reception_date),
    production_deadline: formatDate(deadline),
    days_to_deadline: daysUntil(deadline),
    install_date: formatDate(p.install_date),
    project_status: PROJECT_STATUS_LABEL[p.status] || p.status || '',
    task_summary: taskSummary(await ctx.getProjectTasks()),
  };
}

async function resolveLogistics(ctx) {
  const p = await ctx.getProject();
  if (!p) return null;
  return {
    project_code: p.code || '',
    project_name: p.name || '',
    customer_name: (await ctx.getCustomer())?.full_name || '',
    vc_stage_name: await ctx.getStageName('logistics_pipeline_stages', p.vc_kanban_column_id),
    logistics_company: await ctx.getCompanyName(p.logistics_company_id),
    logistics_person: await ctx.getUserName(p.logistics_person_id),
    installer_person: await ctx.getUserName(p.installer_person_id),
    vc_handover_status: HANDOVER_STATUS_LABEL[p.vc_handover_status] || p.vc_handover_status || '',
    pickup_at: formatDate(p.pickup_at),
    install_date: formatDate(p.install_date),
    install_address: p.install_address || '',
    vc_notes: p.vc_notes || '',
    task_summary: taskSummary(await ctx.getProjectTasks()),
  };
}

async function resolveProjects(ctx) {
  const p = await ctx.getProject();
  if (!p) return null;
  return {
    project_code: p.code || '',
    project_name: p.name || '',
    customer_name: (await ctx.getCustomer())?.full_name || '',
    project_status: PROJECT_STATUS_LABEL[p.status] || p.status || '',
    deadline: formatDate(p.deadline),
    task_summary: taskSummary(await ctx.getProjectTasks()),
  };
}

const RESOLVERS = {
  crm: resolveCrm,
  production: resolveProduction,
  logistics: resolveLogistics,
  projects: resolveProjects,
};

/**
 * Giá trị thật của một bước module.
 * @returns {Promise<object|null>} null khi chủ thể không có dữ liệu tương ứng
 *   (ví dụ node VC nhưng deal chưa từng tạo dự án).
 */
async function resolveModuleVariables(moduleKey, ctx) {
  const fn = RESOLVERS[String(moduleKey || '').toLowerCase()];
  if (!fn) return null;
  return fn(ctx);
}

/**
 * Người đang phụ trách hồ sơ — dùng cho nhóm nhận «Thành viên hồ sơ».
 *
 * Gộp người trên deal (sale, owner, thành viên được chia sẻ) và người trên dự án
 * (sale, NV xưởng, NV vận chuyển, NV lắp đặt) vì một hồ sơ đi xuyên ba module.
 */
async function resolveSubjectMemberIds(subject) {
  const ctx = createDataContext(subject || {});
  const deal = await ctx.getDeal();
  const project = await ctx.getProject();

  const ids = new Set();
  const add = (v) => { if (v) ids.add(String(v)); };
  add(deal?.assigned_to);
  add(deal?.lead_owner_id);
  add(project?.sales_person_id);
  add(project?.production_person_id);
  add(project?.logistics_person_id);
  add(project?.installer_person_id);

  if (deal?.id) {
    const { data } = await supabase.from('lead_members').select('user_id').eq('lead_id', deal.id);
    for (const m of data || []) add(m.user_id);
  }
  return [...ids];
}

/**
 * Chọn chủ thể để chạy thử khi người dùng chưa chỉ định: ưu tiên dự án mới cập nhật
 * nhất đang chạy đúng luồng này, không có thì lấy deal mới nhất.
 */
async function pickSampleSubject(flowId) {
  const { data: proj } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('flow_id', flowId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proj?.id) {
    return { projectId: proj.id, label: `${proj.code || ''} ${proj.name || ''}`.trim(), auto: true };
  }

  const { data: deal } = await supabase
    .from('crm_leads')
    .select('id, code, title')
    .eq('type', 'deal')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (deal?.id) {
    return { dealId: deal.id, label: `${deal.code || ''} ${deal.title || ''}`.trim(), auto: true };
  }
  return null;
}

module.exports = {
  MODULE_VARIABLES,
  MODULE_LABEL,
  createDataContext,
  resolveModuleVariables,
  resolveSubjectMemberIds,
  pickSampleSubject,
};
