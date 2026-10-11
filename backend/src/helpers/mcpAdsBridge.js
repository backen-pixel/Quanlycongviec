/**
 * MCP ads bridge — bộ công cụ scope 'ads_read' cho đối tác chạy quảng cáo.
 *
 * Khác crm_read bridge: KHÔNG cần user act-as, chỉ đọc số liệu tổng hợp đã
 * khử thông tin cá nhân. Phạm vi công ty lấy từ chính API key.
 */
const { supabase } = require('../config/supabase');
const { giaiPhamVi, locTheoPage, locMangTheoPage } = require('./partnerScope');

const NHAN = ['rac', 'lanh', 'am', 'nong', 'da_chot'];

const SCHEMA_KY = {
  date_from: { type: 'string', description: 'YYYY-MM-DD — đầu kỳ' },
  date_to: { type: 'string', description: 'YYYY-MM-DD — cuối kỳ' },
};

const MCP_ADS_TOOLS = [
  {
    name: 'list_lead_campaigns',
    description: 'Liệt kê các chiến dịch quảng cáo Facebook có lead trong kỳ, kèm số lead và điểm chất lượng trung bình.',
    inputSchema: { type: 'object', properties: { ...SCHEMA_KY, limit: { type: 'integer', description: 'Tối đa (mặc định 50)' } } },
  },
  {
    name: 'get_campaign_performance',
    description: 'Hiệu quả một chiến dịch: số lead, phân bố nhãn chất lượng, tỉ lệ chốt, doanh thu.',
    inputSchema: {
      type: 'object',
      properties: { campaign_id: { type: 'string', description: 'ID chiến dịch Facebook' }, ...SCHEMA_KY },
      required: ['campaign_id'],
    },
  },
  {
    name: 'compare_campaigns',
    description: 'So sánh nhiều chiến dịch trên cùng bộ chỉ số để biết cái nào đáng giữ ngân sách.',
    inputSchema: {
      type: 'object',
      properties: { campaign_ids: { type: 'array', items: { type: 'string' }, description: 'Danh sách ID chiến dịch' }, ...SCHEMA_KY },
    },
  },
  {
    name: 'get_lead_quality_breakdown',
    description: 'Bóc chất lượng lead theo chiến dịch, nhóm quảng cáo hoặc từng quảng cáo.',
    inputSchema: {
      type: 'object',
      properties: {
        group_by: { type: 'string', enum: ['page', 'campaign', 'adset', 'ad', 'channel'], description: 'Gom theo cấp nào (mặc định campaign)' },
        ...SCHEMA_KY,
      },
    },
  },
  {
    name: 'find_wasted_spend',
    description: 'Chỉ ra quảng cáo ra nhiều lead nhưng chất lượng kém — ứng viên tắt trước tiên.',
    inputSchema: {
      type: 'object',
      properties: {
        min_leads: { type: 'integer', description: 'Số lead tối thiểu để xét (mặc định 5)' },
        max_quality_rate: { type: 'integer', description: 'Tỉ lệ lead chất lượng tối đa, phần trăm (mặc định 30)' },
        ...SCHEMA_KY,
      },
    },
  },
  {
    name: 'list_pages',
    description: 'Liệt kê hệ sinh thái, các công ty và page Facebook mà khoá này được xem, kèm số lead của từng page.',
    inputSchema: { type: 'object', properties: { ...SCHEMA_KY } },
  },
  {
    name: 'get_conversion_events',
    description: 'Danh sách đơn đã chốt trong kỳ kèm giá trị và chiến dịch nguồn — để đối chiếu với Conversions API.',
    inputSchema: { type: 'object', properties: { ...SCHEMA_KY, limit: { type: 'integer' } } },
  },
];

const MCP_ADS_TOOL_NAMES = MCP_ADS_TOOLS.map((t) => t.name);
const MCP_ADS_TOOL_SET = new Set(MCP_ADS_TOOL_NAMES);

function getMcpAdsTools() {
  return MCP_ADS_TOOLS.map((t) => ({ ...t }));
}

function isoNgay(v, cuoiNgay = false) {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T${cuoiNgay ? '23:59:59' : '00:00:00'}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Nạp quy kết + lead + điểm rồi gom theo cấp yêu cầu. */
async function napVaGom(apiKey, { gomTheo = 'campaign', dateFrom, dateTo, campaignIds = null, scope = null } = {}) {
  const tu = isoNgay(dateFrom);
  const den = isoNgay(dateTo, true);
  const pv = scope || await giaiPhamVi(apiKey);
  if (!pv.hop_le) return [];

  let qa = supabase.from('lead_attribution')
    .select('lead_id, kenh, fb_page_id, fb_campaign_id, fb_campaign_name, fb_adset_id, fb_ad_id, fb_ad_title, cham_dau_luc')
    .not('lead_id', 'is', null)
    .limit(20000);
  qa = locTheoPage(qa, pv);
  if (tu) qa = qa.gte('cham_dau_luc', tu);
  if (den) qa = qa.lte('cham_dau_luc', den);
  if (campaignIds?.length) qa = qa.in('fb_campaign_id', campaignIds.map(String));
  const { data: qk, error } = await qa;
  if (error) throw new Error(error.message);
  const rows = locMangTheoPage(qk || [], pv);
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((x) => String(x.lead_id)))].slice(0, 20000);
  const [leadRows, diemRows] = await Promise.all([
    supabase.from('crm_leads').select('id, type, actual_close_date, estimated_value, company_id').eq('is_test', false)
      .in('id', ids).then((x) => x.data || [], () => []),
    supabase.from('lead_quality_scores').select('lead_id, diem, nhan')
      .in('lead_id', ids).then((x) => x.data || [], () => []),
  ]);

  const mLead = new Map(leadRows
    .filter((l) => pv.company_ids.includes(String(l.company_id)))
    .map((l) => [String(l.id), l]));
  const mPage = new Map(pv.pages.map((p) => [p.page_id, p]));
  const mDiem = new Map(diemRows.map((x) => [String(x.lead_id), x]));

  const khoaCua = (a) => {
    if (gomTheo === 'page') return a.fb_page_id || 'khong-ro';
    if (gomTheo === 'ad') return a.fb_ad_id || 'khong-ro';
    if (gomTheo === 'adset') return a.fb_adset_id || 'khong-ro';
    if (gomTheo === 'channel') return a.kenh || 'khong-ro';
    return a.fb_campaign_id || 'khong-ro';
  };

  const gom = new Map();
  for (const a of rows) {
    const l = mLead.get(String(a.lead_id));
    if (!l) continue;
    const k = khoaCua(a);
    if (!gom.has(k)) {
      gom.set(k, {
        key: k,
        page_id: a.fb_page_id || null,
        page_name: (mPage.get(String(a.fb_page_id || '')) || {}).page_name || null,
        company_id: (mPage.get(String(a.fb_page_id || '')) || {}).company_id || null,
        campaign_id: a.fb_campaign_id || null,
        campaign_name: a.fb_campaign_name || null,
        adset_id: gomTheo === 'adset' || gomTheo === 'ad' ? a.fb_adset_id || null : undefined,
        ad_id: gomTheo === 'ad' ? a.fb_ad_id || null : undefined,
        ad_title: gomTheo === 'ad' ? a.fb_ad_title || null : undefined,
        channel: gomTheo === 'channel' ? a.kenh || null : undefined,
        leads: 0,
        by_label: Object.fromEntries(NHAN.map((n) => [n, 0])),
        _sum: 0,
        _n: 0,
        deals: 0,
        closed: 0,
        revenue: 0,
      });
    }
    const g = gom.get(k);
    g.leads += 1;
    const d = mDiem.get(String(a.lead_id));
    if (d) {
      g.by_label[d.nhan] = (g.by_label[d.nhan] || 0) + 1;
      g._sum += Number(d.diem) || 0;
      g._n += 1;
    }
    if (l.type === 'deal') g.deals += 1;
    if (l.actual_close_date) { g.closed += 1; g.revenue += Number(l.estimated_value) || 0; }
  }

  return [...gom.values()].map((g) => {
    const chatLuong = (g.by_label.am || 0) + (g.by_label.nong || 0) + (g.by_label.da_chot || 0);
    const { _sum, _n, ...rest } = g;
    return {
      ...rest,
      avg_score: _n ? Math.round(_sum / _n) : null,
      quality_leads: chatLuong,
      quality_rate: g.leads ? Math.round((chatLuong / g.leads) * 100) : 0,
      junk_rate: g.leads ? Math.round(((g.by_label.rac || 0) / g.leads) * 100) : 0,
      close_rate: g.leads ? Math.round((g.closed / g.leads) * 100) : 0,
      spend: null,
      cost_per_lead: null,
      roas: null,
    };
  }).sort((a, b) => b.leads - a.leads);
}

const GHI_CHU_CHI_TIEU = 'Chi tiêu, giá mỗi lead và ROAS trả null cho tới khi nối Facebook Marketing API. '
  + 'Điểm chất lượng đo độ đầy đủ thông tin và mức tương tác, KHÔNG phải xác suất chốt đơn.';

async function callMcpAdsTool(name, args = {}, apiKey) {
  const pv = await giaiPhamVi(apiKey);
  if (!pv.hop_le) {
    throw new Error('Khoá chưa được phân vùng dữ liệu: ' + (pv.ly_do || 'không rõ'));
  }
  const ky = { dateFrom: args.date_from, dateTo: args.date_to, scope: pv };

  if (name === 'list_pages') {
    const ds = await napVaGom(apiKey, { gomTheo: 'page', ...ky });
    const coSo = new Map(ds.map((g) => [String(g.page_id || ''), g]));
    return {
      ecosystem: { id: pv.tenant_id, name: pv.tenant_name },
      companies: pv.companies,
      pages: pv.pages.map((p) => {
        const g = coSo.get(p.page_id);
        return {
          page_id: p.page_id,
          page_name: p.page_name,
          company_id: p.company_id,
          company_name: (pv.companies.find((c) => c.id === p.company_id) || {}).name || null,
          is_active: p.is_active,
          leads: g ? g.leads : 0,
          quality_rate: g ? g.quality_rate : 0,
          closed: g ? g.closed : 0,
        };
      }),
      locked_to_pages: pv.page_ids_khai_tay.length > 0 ? pv.page_ids_khai_tay : null,
    };
  }

  if (name === 'list_lead_campaigns') {
    const ds = await napVaGom(apiKey, { gomTheo: 'campaign', ...ky });
    const limit = Math.min(Number(args.limit) || 50, 200);
    return { campaigns: ds.slice(0, limit), total: ds.length, note: GHI_CHU_CHI_TIEU };
  }

  if (name === 'get_campaign_performance') {
    if (!args.campaign_id) throw new Error('Thiếu campaign_id');
    const ds = await napVaGom(apiKey, { gomTheo: 'campaign', campaignIds: [args.campaign_id], ...ky });
    if (!ds.length) return { campaign: null, message: 'Không có lead nào cho chiến dịch này trong kỳ.' };
    const ads = await napVaGom(apiKey, { gomTheo: 'ad', campaignIds: [args.campaign_id], ...ky });
    return { campaign: ds[0], ads, note: GHI_CHU_CHI_TIEU };
  }

  if (name === 'compare_campaigns') {
    const ids = Array.isArray(args.campaign_ids) && args.campaign_ids.length ? args.campaign_ids : null;
    const ds = await napVaGom(apiKey, { gomTheo: 'campaign', campaignIds: ids, ...ky });
    return { campaigns: ds.slice(0, 50), compared: ds.length, note: GHI_CHU_CHI_TIEU };
  }

  if (name === 'get_lead_quality_breakdown') {
    const gomTheo = ['page', 'campaign', 'adset', 'ad', 'channel'].includes(args.group_by) ? args.group_by : 'campaign';
    const ds = await napVaGom(apiKey, { gomTheo, ...ky });
    return { group_by: gomTheo, rows: ds.slice(0, 200), total: ds.length, note: GHI_CHU_CHI_TIEU };
  }

  if (name === 'find_wasted_spend') {
    const minLeads = Number(args.min_leads) || 5;
    const tranChatLuong = Number(args.max_quality_rate) || 30;
    const ds = await napVaGom(apiKey, { gomTheo: 'ad', ...ky });
    const xau = ds
      .filter((g) => g.leads >= minLeads && g.quality_rate <= tranChatLuong)
      .sort((a, b) => b.leads - a.leads || a.quality_rate - b.quality_rate);
    return {
      criteria: { min_leads: minLeads, max_quality_rate: tranChatLuong },
      candidates: xau.slice(0, 50),
      total: xau.length,
      note: 'Sắp theo số lead giảm dần — tốn nhiều lead mà ít chất lượng thì tắt trước. ' + GHI_CHU_CHI_TIEU,
    };
  }

  if (name === 'get_conversion_events') {
    const tu = isoNgay(args.date_from);
    const den = isoNgay(args.date_to, true);
    const limit = Math.min(Number(args.limit) || 100, 200);
    let q = supabase.from('crm_leads')
      .select('id, code, actual_close_date, estimated_value, company_id').eq('is_test', false)
      .eq('type', 'deal').not('actual_close_date', 'is', null)
      .order('actual_close_date', { ascending: false }).limit(limit);
    q = q.in('company_id', pv.company_ids.length ? pv.company_ids : ['00000000-0000-0000-0000-000000000000']);
    if (tu) q = q.gte('actual_close_date', tu);
    if (den) q = q.lte('actual_close_date', den);
    const { data: deals, error } = await q;
    if (error) throw new Error(error.message);
    const ds = deals || [];
    const qk = ds.length
      ? await supabase.from('lead_attribution')
        .select('lead_id, fb_page_id, fb_campaign_id, fb_campaign_name, fb_ad_id, kenh')
        .in('lead_id', ds.map((d) => d.id)).then((x) => x.data || [], () => [])
      : [];
    const m = new Map(qk.map((x) => [String(x.lead_id), x]));
    const rang = pv.page_ids_khai_tay || [];
    const dsLoc = rang.length
      ? ds.filter((d) => rang.includes(String((m.get(String(d.id)) || {}).fb_page_id || '')))
      : ds;
    return {
      events: dsLoc.map((d) => {
        const a = m.get(String(d.id));
        return {
          lead_id: d.id,
          code: d.code || null,
          event_name: 'Purchase',
          closed_at: d.actual_close_date,
          value: Number(d.estimated_value) || 0,
          currency: 'VND',
          channel: a?.kenh || null,
          page_id: a?.fb_page_id || null,
          campaign_id: a?.fb_campaign_id || null,
          campaign_name: a?.fb_campaign_name || null,
          ad_id: a?.fb_ad_id || null,
        };
      }),
      total: dsLoc.length,
      note: 'Không kèm thông tin cá nhân. Cần dữ liệu đã băm thì dùng REST /api/partner/v1/conversions.',
    };
  }

  throw new Error(`Tool ads không tồn tại: ${name}`);
}

module.exports = {
  MCP_ADS_TOOLS,
  MCP_ADS_TOOL_NAMES,
  MCP_ADS_TOOL_SET,
  getMcpAdsTools,
  callMcpAdsTool,
  napVaGom,
};
