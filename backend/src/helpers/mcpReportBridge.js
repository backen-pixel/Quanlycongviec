/**
 * MCP — báo cáo vận hành.
 *
 * VÌ SAO THÊM
 * MCP đã có 23 tool báo cáo, nhưng tất cả xoay quanh CRM theo nhân sự (tổ chức, nhân viên,
 * pipeline, rủi ro deal). Ba câu hỏi vận hành hay bị hỏi nhất lại chưa có tool nào trả lời
 * được, phải viết script tay mỗi lần:
 *   - Lead đang về từ kênh nào, khu vực nào, so với kỳ trước ra sao?
 *   - Lead nào đang đọng, đọng bao lâu, nằm ở ai?
 *   - Xưởng đang ùn ở cột nào, bao nhiêu đơn quá hạn?
 *
 * KHÁC VỚI `*_api_get`
 * Các tool module hiện có chỉ mở đường cho model tự gọi endpoint — model phải biết path và
 * tự cộng số. Ba tool ở đây TỔNG HỢP sẵn, trả về con số đã gom nhóm, nên trả lời được bằng
 * một lượt gọi và không phụ thuộc model cộng đúng.
 *
 * CHỈ ĐỌC. Đọc thẳng Supabase (không qua route) vì đây là phép gom nhóm mới, không có luật
 * nghiệp vụ nào của route cần giữ — khác hẳn tầng ghi, nơi bắt buộc đi qua route.
 *
 * PHẠM VI CÔNG TY: mọi truy vấn đều buộc lọc `company_id`. Gateway còn lọc thêm lần nữa
 * theo danh sách công ty của khoá API.
 */

const { supabase } = require('../config/supabase');

const MAX_ROWS = 20000;

async function tatCa(table, select, build) {
  const ra = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select);
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    ra.push(...(data || []));
    if (!data || data.length < 1000 || ra.length >= MAX_ROWS) break;
    from += 1000;
  }
  return ra;
}

/** Ngày theo giờ VN — báo cáo phải khớp cách người ở đây gọi "hôm nay". */
function ngayVN(iso) {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function doiArgNgay(a) {
  const from = String(a.date_from || '').trim() || null;
  const to = String(a.date_to || '').trim() || null;
  return { from, to };
}

function demTheo(list, key) {
  const d = {};
  list.forEach((x) => {
    const k = key(x) || '(không có)';
    d[k] = (d[k] || 0) + 1;
  });
  return Object.entries(d).sort((x, y) => y[1] - x[1]).map(([ten, so]) => ({ ten, so }));
}

/** Gom URL quảng cáo dài về một nhãn kênh — nếu không báo cáo nguồn sẽ vỡ vụn hàng chục dòng. */
function nhanKenh(tenNguon) {
  const n = String(tenNguon || '').trim();
  if (!n) return '(không ghi nguồn)';
  if (n.startsWith('[FB:')) return n;
  if (/^https?:\/\//i.test(n)) {
    if (/utm_source=google|gclid|gad_source/i.test(n)) return 'Google Ads (qua URL)';
    try { return `Website ${new URL(n).hostname}`; } catch { return 'Website'; }
  }
  return n;
}

async function baoCaoNguonLead(a) {
  const { from, to } = doiArgNgay(a);
  const companyId = a.company_id;
  if (!companyId) {
    const e = new Error('Thiếu company_id');
    e.status = 400;
    throw e;
  }
  const leads = await tatCa('crm_leads', 'id, type, created_at, source_id, region_id, stage_id',
    (q) => {
      let x = q.eq('company_id', companyId);
      if (from) x = x.gte('created_at', from);
      if (to) x = x.lte('created_at', `${to}T23:59:59`);
      if (a.type === 'lead' || a.type === 'deal') x = x.eq('type', a.type);
      return x;
    });

  const [sources, regions] = await Promise.all([
    tatCa('crm_sources', 'id, name'),
    tatCa('company_regions', 'id, name', (q) => q.eq('company_id', companyId)),
  ]);
  const sn = Object.fromEntries(sources.map((s) => [s.id, s.name]));
  const rn = Object.fromEntries(regions.map((r) => [r.id, r.name]));

  return {
    company_id: companyId,
    ky: { tu: from, den: to },
    tong: leads.length,
    tong_lead: leads.filter((l) => l.type !== 'deal').length,
    tong_deal: leads.filter((l) => l.type === 'deal').length,
    theo_kenh: demTheo(leads, (l) => nhanKenh(sn[l.source_id])),
    theo_khu_vuc: demTheo(leads, (l) => rn[l.region_id] || '(không gán khu vực)'),
    theo_ngay: demTheo(leads, (l) => ngayVN(l.created_at)).sort((x, y) => x.ten.localeCompare(y.ten)),
    ghi_chu: 'Ngày tính theo giờ VN. URL quảng cáo dài đã gom về nhãn kênh.',
  };
}

async function baoCaoLeadDong(a) {
  const companyId = a.company_id;
  if (!companyId) {
    const e = new Error('Thiếu company_id');
    e.status = 400;
    throw e;
  }
  const soNgay = Math.min(Math.max(parseInt(a.min_age_days, 10) || 0, 0), 3650);
  const moc = Date.now() - soNgay * 86400000;

  const leads = await tatCa('crm_leads',
    'id, code, title, type, created_at, stage_id, assigned_to, lead_seen_by',
    (q) => {
      let x = q.eq('company_id', companyId);
      if (a.pipeline_id) x = x.eq('pipeline_id', a.pipeline_id);
      if (a.stage_id) x = x.eq('stage_id', a.stage_id);
      return x;
    });

  const chuaXem = leads.filter((l) => {
    const v = l.lead_seen_by;
    const rong = !v || (Array.isArray(v) ? v.length === 0 : (typeof v === 'object' && Object.keys(v).length === 0));
    return rong && new Date(l.created_at).getTime() <= moc;
  });

  const [stages, users] = await Promise.all([
    tatCa('crm_pipeline_stages', 'id, name'),
    tatCa('users', 'id, full_name, is_active'),
  ]);
  const sn = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const um = Object.fromEntries(users.map((u) => [u.id, u]));

  // Giao cho tài khoản đã tắt = lead không ai mở được. Phải nêu riêng, đã gặp thật.
  const giaoChoTkTat = chuaXem.filter((l) => l.assigned_to && um[l.assigned_to]?.is_active === false);

  return {
    company_id: companyId,
    dieu_kien: { chua_ai_xem: true, toi_thieu_ngay: soNgay },
    tong_lead_cong_ty: leads.length,
    dong: chuaXem.length,
    theo_giai_doan: demTheo(chuaXem, (l) => sn[l.stage_id] || '(không giai đoạn)'),
    theo_nguoi_phu_trach: demTheo(chuaXem, (l) => {
      const u = um[l.assigned_to];
      if (!u) return l.assigned_to ? '(user không tồn tại)' : '(chưa gán)';
      return `${u.full_name}${u.is_active === false ? ' ⛔ tài khoản đã tắt' : ''}`;
    }),
    theo_thang_tao: demTheo(chuaXem, (l) => String(l.created_at).slice(0, 7))
      .sort((x, y) => x.ten.localeCompare(y.ten)),
    canh_bao_giao_cho_tai_khoan_da_tat: giaoChoTkTat.length,
    ghi_chu: 'Đọng = chưa ai mở xem (lead_seen_by rỗng). Lead giao cho tài khoản đã tắt thì '
      + 'không ai mở được, cần gán lại.',
  };
}

async function baoCaoXuong(a) {
  const companyId = a.company_id;
  if (!companyId) {
    const e = new Error('Thiếu company_id');
    e.status = 400;
    throw e;
  }
  const projects = await tatCa('projects',
    'id, code, name, company_id, workshop_type_id, sx_kanban_column_id, sx_kanban_deadline_at, status',
    (q) => {
      let x = q.eq('company_id', companyId);
      if (a.workshop_type_id) x = x.eq('workshop_type_id', a.workshop_type_id);
      return x;
    });

  const [stages, types] = await Promise.all([
    tatCa('production_pipeline_stages', 'id, name, order_index, company_id, workshop_type_id, board_tab',
      (q) => q.eq('company_id', companyId)),
    tatCa('workshop_project_types', 'id, name', (q) => q.eq('company_id', companyId)),
  ]);
  const sm = new Map(stages.map((s) => [String(s.id), s]));
  const wn = Object.fromEntries(types.map((t) => [t.id, t.name]));

  const nay = Date.now();
  const coHan = projects.filter((p) => p.sx_kanban_deadline_at);
  const quaHan = coHan.filter((p) => new Date(p.sx_kanban_deadline_at).getTime() < nay);
  const sapToi = coHan.filter((p) => {
    const t = new Date(p.sx_kanban_deadline_at).getTime();
    return t >= nay && t <= nay + 3 * 86400000;
  });

  return {
    company_id: companyId,
    tong_du_an: projects.length,
    dang_tren_bang: projects.filter((p) => p.sx_kanban_column_id).length,
    khong_co_cot: projects.filter((p) => !p.sx_kanban_column_id).length,
    qua_han: quaHan.length,
    sap_toi_han_3_ngay: sapToi.length,
    khong_dat_han: projects.length - coHan.length,
    theo_cot: demTheo(projects.filter((p) => p.sx_kanban_column_id),
      (p) => {
        const s = sm.get(String(p.sx_kanban_column_id));
        return s ? `#${s.order_index} ${s.name}${s.board_tab && s.board_tab !== 'sx' ? ` (tab ${s.board_tab})` : ''}` : '(cột không tồn tại)';
      }),
    theo_phan_loai: demTheo(projects, (p) => wn[p.workshop_type_id] || '(chưa phân loại)'),
    qua_han_chi_tiet: quaHan.slice(0, 30).map((p) => ({
      ma: p.code,
      ten: p.name,
      cot: sm.get(String(p.sx_kanban_column_id))?.name || null,
      han: p.sx_kanban_deadline_at,
    })),
    ghi_chu: 'Thẻ ở cột có tab khác "sx" sẽ không hiện trên tab Sản xuất của bảng Kanban.',
  };
}

const MCP_REPORT_OPS_TOOLS = [
  {
    name: 'get_lead_source_report',
    description: 'Báo cáo nguồn lead: lead/deal về từ kênh nào, khu vực nào, mỗi ngày bao nhiêu. '
      + 'URL quảng cáo dài được gom về nhãn kênh để không vỡ vụn.',
    scope: 'crm_read',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: { type: 'string' },
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        type: { type: 'string', enum: ['lead', 'deal'], description: 'Bỏ trống = cả hai' },
      },
      required: ['company_id'],
    },
  },
  {
    name: 'get_stuck_leads_report',
    description: 'Lead đang ĐỌNG — chưa ai mở xem lần nào. Gom theo giai đoạn, người phụ trách, '
      + 'tháng tạo. Nêu riêng số lead đang giao cho tài khoản đã tắt (không ai mở được).',
    scope: 'crm_read',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: { type: 'string' },
        pipeline_id: { type: 'string' },
        stage_id: { type: 'string' },
        min_age_days: { type: 'number', description: 'Chỉ tính lead cũ hơn N ngày. Mặc định 0.' },
      },
      required: ['company_id'],
    },
  },
  {
    name: 'get_production_overview_report',
    description: 'Tổng quan xưởng: số dự án theo cột Kanban và theo phân loại, số quá hạn, '
      + 'sắp tới hạn 3 ngày, và danh sách đơn quá hạn.',
    scope: 'production_read',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: { type: 'string' },
        workshop_type_id: { type: 'string', description: 'Lọc theo phân loại xưởng' },
      },
      required: ['company_id'],
    },
  },
];

const MCP_REPORT_OPS_TOOL_SET = new Set(MCP_REPORT_OPS_TOOLS.map((t) => t.name));
const MCP_REPORT_OPS_SCOPES = Object.fromEntries(MCP_REPORT_OPS_TOOLS.map((t) => [t.name, t.scope]));

function getMcpReportOpsTools() {
  return MCP_REPORT_OPS_TOOLS.map(({ scope, ...t }) => t);
}

async function callMcpReportOpsTool(name, args = {}) {
  const a = args || {};
  if (name === 'get_lead_source_report') return baoCaoNguonLead(a);
  if (name === 'get_stuck_leads_report') return baoCaoLeadDong(a);
  if (name === 'get_production_overview_report') return baoCaoXuong(a);
  const e = new Error(`Tool báo cáo không được phép: ${name}`);
  e.status = 404;
  throw e;
}

module.exports = {
  MCP_REPORT_OPS_TOOL_SET,
  MCP_REPORT_OPS_SCOPES,
  getMcpReportOpsTools,
  callMcpReportOpsTool,
  // Xuất để test offline phần gom nhãn kênh (không cần DB).
  nhanKenh,
  ngayVN,
};
