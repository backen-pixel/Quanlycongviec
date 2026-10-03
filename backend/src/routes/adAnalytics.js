/**
 * Phân tích hiệu quả quảng cáo Facebook — /api/ad-analytics (nội bộ, cần JWT).
 *
 *   GET  /summary            tổng quan kỳ: lead, chất lượng, deal, doanh thu
 *   GET  /ads                bảng theo từng quảng cáo (ad_id)
 *   GET  /campaigns          gom theo chiến dịch (lấy tên từ fb_ad_catalog)
 *   GET  /pages              gom theo page
 *   PUT  /ads/:adId          đặt tên chiến dịch / nhóm QC cho một ad_id
 *   POST /ads/bulk-name      đặt tên hàng loạt
 *
 *   GET  /bo-loc             danh sách công ty + page để đổ vào ô lọc
 *   GET  /marketing/status   đã nối Marketing API chưa
 *   POST /marketing/test     thử một cặp (ad account, token) — không lưu
 *   PUT  /marketing/account  khai báo / sửa tài khoản quảng cáo
 *   POST /marketing/sync     kéo tên chiến dịch + chi tiêu về ngay
 *
 * Chưa khai báo tài khoản quảng cáo thì chi tiêu trả null, không đoán.
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const { chayPhanTich, tomTat } = require('../helpers/adInsights');
const { dongBoTatCa, kiemTraKetNoi, daCauHinh, chuanHoaActId } = require('../helpers/fbMarketingSync');

const r = Router();
r.use(auth);

function isoNgay(v, cuoi = false) {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T${cuoi ? '23:59:59' : '00:00:00'}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const CONG_TY_RONG = '00000000-0000-0000-0000-000000000000';

/**
 * Công ty người dùng được xem, LUÔN cắt theo hệ sinh thái đang đăng nhập.
 *
 * `tenantGate` chạy sẵn trong middleware auth nên req.tenantCompanyIds đã có:
 *   - admin-like  → mọi công ty TRONG hệ sinh thái của mình (không vượt tenant)
 *   - người khác  → đúng công ty của mình, và công ty đó phải thuộc hệ sinh thái
 *   - null        → không giới hạn (platform_admin, hoặc tài khoản legacy chưa gắn HST)
 */
async function congTyChoPhep(req) {
  const hst = isTenantScopeEnforced(req) ? (req.tenantCompanyIds || []) : null;
  if (isAdminLike(req.user)) {
    if (!hst) return null;
    return hst.length ? hst : [CONG_TY_RONG];
  }
  const cid = req.user?.company_id ? String(req.user.company_id) : null;
  if (!cid) return [CONG_TY_RONG];
  if (hst && !hst.includes(cid)) return [CONG_TY_RONG];
  return [cid];
}

/**
 * Danh sách công ty cuối cùng được dùng để lọc:
 * giao của (quyền người dùng) và (công ty người dùng chọn trên ô lọc).
 * Trả null = không giới hạn công ty nào.
 */
async function congTyLoc(req) {
  const quyen = await congTyChoPhep(req);
  const chon = req.query.company_id ? String(req.query.company_id) : null;
  if (!chon) return quyen;
  if (!quyen) return [chon];
  // Chọn công ty ngoài quyền → không trả về gì, thay vì âm thầm bỏ qua bộ lọc.
  return quyen.includes(chon) ? [chon] : [CONG_TY_RONG];
}

/** Nạp quy kết + lead + điểm, gom theo khoá. */
async function docLeadBatBuoc(query) {
  try {
    const result = await query;
    if (result?.error || !Array.isArray(result?.data)) throw new Error('Invalid CRM read');
    return result.data;
  } catch {
    // Lỗi đọc không được biến thành báo cáo 0 Lead; không giữ lỗi upstream.
    const error = new Error('Chưa đọc được dữ liệu CRM. Vui lòng tải lại báo cáo.');
    error.code = 'AD_ANALYTICS_CRM_UNAVAILABLE';
    throw error;
  }
}

function traLoiBaoCao(res, error) {
  const crmUnavailable = error?.code === 'AD_ANALYTICS_CRM_UNAVAILABLE';
  return res.status(crmUnavailable ? 503 : 500).json({
    error: crmUnavailable ? 'Chưa đọc được dữ liệu CRM. Vui lòng tải lại báo cáo.'
      : 'Chưa tải được dữ liệu quảng cáo. Vui lòng thử lại.',
    code: crmUnavailable ? 'AD_ANALYTICS_CRM_UNAVAILABLE' : 'AD_ANALYTICS_READ_FAILED',
    data_status: 'UNKNOWN',
  });
}

async function napDuLieu(req) {
  const tu = isoNgay(req.query.from);
  const den = isoNgay(req.query.to, true);
  const pageId = req.query.page_id ? String(req.query.page_id) : null;

  let qa = supabase.from('lead_attribution')
    .select('lead_id, fb_page_id, fb_ad_id, fb_adset_id, fb_campaign_id, fb_ad_title, fb_source, kenh, cham_dau_luc')
    .not('lead_id', 'is', null)
    .limit(20000);
  if (tu) qa = qa.gte('cham_dau_luc', tu);
  if (den) qa = qa.lte('cham_dau_luc', den);
  if (pageId) qa = qa.eq('fb_page_id', pageId);
  const { data: qk, error } = await qa;
  if (error) throw new Error(error.message);
  const rows = qk || [];
  if (!rows.length) {
    return { rows: [], mLead: new Map(), mDiem: new Map(), mCat: new Map(), mPage: new Map(), mChiTieu: new Map() };
  }

  const ids = [...new Set(rows.map((x) => String(x.lead_id)))].slice(0, 20000);
  const dsCT = await congTyLoc(req);

  const [leadRows, diemRows, catRows, pageRows] = await Promise.all([
    docLeadBatBuoc(supabase.from('crm_leads').select('id, type, actual_close_date, estimated_value, company_id, created_at')
      .in('id', ids)),
    supabase.from('lead_quality_scores').select('lead_id, diem, nhan')
      .in('lead_id', ids).then((x) => x.data || [], () => []),
    supabase.from('fb_ad_catalog').select('ad_id, ad_name, adset_name, campaign_id, campaign_name, nguon')
      .then((x) => x.data || [], () => []),
    supabase.from('facebook_pages').select('page_id, page_name, default_company_id')
      .then((x) => x.data || [], () => []),
  ]);

  const mLead = new Map(leadRows
    .filter((l) => !dsCT || dsCT.includes(String(l.company_id)))
    .map((l) => [String(l.id), l]));
  return {
    rows,
    mLead,
    mDiem: new Map(diemRows.map((x) => [String(x.lead_id), x])),
    mCat: new Map(catRows.map((x) => [String(x.ad_id), x])),
    mPage: new Map(pageRows.map((x) => [String(x.page_id), x])),
    mChiTieu: await napChiTieu(tu, den),
  };
}

/** Chi tiêu theo ad_id trong kỳ. Rỗng nếu chưa nối Marketing API. */
async function napChiTieu(tu, den) {
  let q = supabase.from('fb_ad_spend_daily').select('ad_id, chi_tieu, hien_thi, nhap').limit(50000);
  if (tu) q = q.gte('ngay', String(tu).slice(0, 10));
  if (den) q = q.lte('ngay', String(den).slice(0, 10));
  const { data } = await q.then((x) => x, () => ({ data: [] }));
  const m = new Map();
  for (const x of data || []) {
    const k = String(x.ad_id);
    const o = m.get(k) || { chi_tieu: 0, hien_thi: 0, nhap: 0 };
    o.chi_tieu += Number(x.chi_tieu) || 0;
    o.hien_thi += Number(x.hien_thi) || 0;
    o.nhap += Number(x.nhap) || 0;
    m.set(k, o);
  }
  return m;
}

/** Gắn chi tiêu vào một ô đã chốt. Không có số thật thì để null, không đoán. */
function themChiTieu(o, adIds, mChiTieu) {
  if (!mChiTieu || !mChiTieu.size) return o;
  let chi = 0; let ht = 0; let nh = 0; let co = false;
  for (const id of adIds) {
    const c = mChiTieu.get(String(id));
    if (!c) continue;
    co = true; chi += c.chi_tieu; ht += c.hien_thi; nh += c.nhap;
  }
  if (!co) return o;
  const spend = Math.round(chi);
  return {
    ...o,
    spend,
    hien_thi: ht,
    nhap: nh,
    cost_per_lead: o.leads ? Math.round(spend / o.leads) : null,
    roas: null,
    spend_status: 'PARTIAL_UNVERIFIED',
    eligible_for_budget_optimization: false,
  };
}

function oTrong() {
  return {
    leads: 0,
    by_label: { rac: 0, lanh: 0, am: 0, nong: 0, da_chot: 0 },
    _sum: 0, _n: 0, deals: 0, closed: 0, revenue: null, closed_estimated_value: 0,
    revenue_status: 'UNKNOWN', revenue_basis: 'RECOGNIZED_NET_SOURCE_NOT_CONNECTED',
    eligible_for_budget_optimization: false,
    _leadIds: new Set(), _paidLeadIds: new Set(),
  };
}

function chot(g) {
  const chatLuong = (g.by_label.am || 0) + (g.by_label.nong || 0) + (g.by_label.da_chot || 0);
  const { _sum, _n, _leadIds, _paidLeadIds, ...rest } = g;
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
}

function congDon(g, l, d) {
  // Một hồ sơ nhiều touchpoint vẫn chỉ tính một lần trong từng nhóm.
  const leadId = String(l.id);
  if (g._leadIds.has(leadId)) return;
  g._leadIds.add(leadId);
  g.leads += 1;
  if (d) {
    g.by_label[d.nhan] = (g.by_label[d.nhan] || 0) + 1;
    g._sum += Number(d.diem) || 0;
    g._n += 1;
  }
  if (l.type === 'deal') g.deals += 1;
  if (l.actual_close_date) { g.closed += 1; g.closed_estimated_value += Number(l.estimated_value) || 0; }
}

r.get('/summary', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mChiTieu } = await napDuLieu(req);
    const tong = oTrong();
    const tuQC = oTrong();
    const adSet = new Set();
    for (const a of rows) {
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const d = mDiem.get(String(a.lead_id));
      congDon(tong, l, d);
      if (a.fb_ad_id) { congDon(tuQC, l, d); adSet.add(String(a.fb_ad_id)); }
    }
    const coChiTieu = mChiTieu.size > 0;
    res.json({
      tat_ca: themChiTieu(chot(tong), adSet, mChiTieu),
      tu_quang_cao: themChiTieu(chot(tuQC), adSet, mChiTieu),
      so_quang_cao: adSet.size,
      ti_le_biet_quang_cao: tong.leads ? Math.round((tuQC.leads / tong.leads) * 100) : 0,
      co_chi_tieu: coChiTieu,
      ghi_chu_chi_tieu: coChiTieu
        ? 'Chi tiêu chỉ gồm quảng cáo có Lead được liên kết, chưa chứng minh đầy đủ. Doanh thu kế toán và ROAS chưa xác minh; không dùng để tự tăng ngân sách.'
        : 'Chi tiêu và ROAS chưa có — cần khai báo tài khoản quảng cáo và token Marketing API.',
    });
  } catch (e) {
    traLoiBaoCao(res, e);
  }
});

r.get('/ads', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mCat, mPage, mChiTieu } = await napDuLieu(req);
    const gom = new Map();
    for (const a of rows) {
      if (!a.fb_ad_id) continue;
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const k = String(a.fb_ad_id);
      if (!gom.has(k)) {
        const c = mCat.get(k) || {};
        const p = mPage.get(String(a.fb_page_id)) || {};
        gom.set(k, {
          ad_id: k,
          ad_title_fb: a.fb_ad_title || null,
          ad_name: c.ad_name || null,
          adset_name: c.adset_name || null,
          campaign_id: c.campaign_id || a.fb_campaign_id || null,
          campaign_name: c.campaign_name || null,
          ten_tu_dau: c.nguon || null,
          page_id: a.fb_page_id || null,
          page_name: p.page_name || null,
          lan_dau: a.cham_dau_luc,
          lan_cuoi: a.cham_dau_luc,
          ...oTrong(),
        });
      }
      const g = gom.get(k);
      if (a.cham_dau_luc < g.lan_dau) g.lan_dau = a.cham_dau_luc;
      if (a.cham_dau_luc > g.lan_cuoi) g.lan_cuoi = a.cham_dau_luc;
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    const data = [...gom.values()]
      .map((g) => themChiTieu(chot(g), [g.ad_id], mChiTieu))
      .sort((x, y) => y.leads - x.leads);
    res.json({ data, total: data.length });
  } catch (e) {
    traLoiBaoCao(res, e);
  }
});

r.get('/campaigns', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mCat, mChiTieu } = await napDuLieu(req);
    const gom = new Map();
    const chuaDatTen = new Set();
    for (const a of rows) {
      if (!a.fb_ad_id) continue;
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const c = mCat.get(String(a.fb_ad_id)) || {};
      const ten = c.campaign_name || null;
      const campaignId = c.campaign_id || a.fb_campaign_id || null;
      const k = campaignId ? `id:${campaignId}`
        : ten ? `name:${ten}` : `ad:${a.fb_ad_id}`;
      if (!ten) chuaDatTen.add(String(l.id));
      if (!gom.has(k)) {
        gom.set(k, {
          campaign_id: campaignId,
          campaign_name: ten,
          chua_dat_ten: !ten,
          ad_ids: new Set(),
          ...oTrong(),
        });
      }
      const g = gom.get(k);
      g.ad_ids.add(String(a.fb_ad_id));
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    const data = [...gom.values()]
      .map((g) => themChiTieu(
        { ...chot(g), ad_ids: [...g.ad_ids], so_quang_cao: g.ad_ids.size }, g.ad_ids, mChiTieu,
      ))
      .sort((x, y) => y.leads - x.leads);
    res.json({ data, total: data.length, lead_chua_dat_ten_chien_dich: chuaDatTen.size });
  } catch (e) {
    traLoiBaoCao(res, e);
  }
});

r.get('/pages', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mPage, mChiTieu } = await napDuLieu(req);
    const gom = new Map();
    for (const a of rows) {
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const k = String(a.fb_page_id || 'khong-ro');
      if (!gom.has(k)) {
        const p = mPage.get(k) || {};
        gom.set(k, {
          page_id: a.fb_page_id || null, page_name: p.page_name || null,
          co_ad_id: 0, ad_ids: new Set(), ...oTrong(),
        });
      }
      const g = gom.get(k);
      if (a.fb_ad_id) {
        g._paidLeadIds.add(String(l.id));
        g.co_ad_id = g._paidLeadIds.size;
        g.ad_ids.add(String(a.fb_ad_id));
      }
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    const data = [...gom.values()]
      .map((g) => themChiTieu(chot(g), g.ad_ids, mChiTieu))
      .map(({ ad_ids, ...rest }) => rest)
      .sort((x, y) => y.leads - x.leads);
    res.json({ data, total: data.length });
  } catch (e) {
    traLoiBaoCao(res, e);
  }
});

// ── Phân tích tự động ───────────────────────────────────────

r.get('/insights', async (req, res) => {
  try {
    const dsCT = await congTyLoc(req);
    const pageId = req.query.page_id ? String(req.query.page_id) : null;
    const { data, error } = await supabase
      .from('fb_ad_analysis')
      .select('*')
      .order('diem_uu_tien', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    let rows = (data || []).map(x => ({
      ...x,
      ...((Array.isArray(x.nhan_xet) ? x.nhan_xet : []).some(n => ['doanh_thu_cao', 'lo_von'].includes(n.ma))
        ? { xep_hang: 'can_xem', diem_uu_tien: 0, analysis_status: 'STALE_FINANCIAL_BASIS' } : {}),
      so_lieu: { ...x.so_lieu, closed_estimated_value: x.so_lieu?.closed_estimated_value ?? x.so_lieu?.revenue ?? null,
        revenue: null, roas: null, doanh_thu_moi_lead: null, revenue_status: 'UNKNOWN', eligible_for_budget_optimization: false },
      nhan_xet: (Array.isArray(x.nhan_xet) ? x.nhan_xet : []).filter(n => !['doanh_thu_cao', 'lo_von'].includes(n.ma)),
    }));
    if (dsCT) rows = rows.filter((x) => dsCT.includes(String(x.so_lieu?.company_id || '')));
    if (pageId) rows = rows.filter((x) => String(x.so_lieu?.page_id || '') === pageId);
    rows.sort((a, b) => (Number(b.diem_uu_tien) || 0) - (Number(a.diem_uu_tien) || 0));

    const nen = rows.length
      ? (() => {
        const leads = rows.reduce((a, x) => a + (x.so_lieu?.leads || 0), 0);
        const closed = rows.reduce((a, x) => a + (x.so_lieu?.closed || 0), 0);
        const closed_estimated_value = rows.reduce((a, x) => a + (x.so_lieu?.closed_estimated_value || 0), 0);
        return {
          so_quang_cao: rows.length,
          leads,
          closed,
          revenue: null, closed_estimated_value, revenue_status: 'UNKNOWN', eligible_for_budget_optimization: false,
          ti_le_chot: leads ? Math.round((closed / leads) * 100) : 0,
          doanh_thu_moi_lead: null,
        };
      })()
      : null;

    res.json({
      data: rows,
      tom_tat: tomTat(rows, nen),
      tinh_luc: rows[0]?.tinh_luc || null,
    });
  } catch (e) {
    console.error('[ad-analytics/insights]', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/insights/run', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được chạy lại phân tích' });
    const kq = await chayPhanTich({ ngay: Number(req.body?.ngay) || 90 });
    res.json({ ok: true, ...kq });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/ads/:adId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được đặt tên chiến dịch' });
    const adId = String(req.params.adId || '').trim();
    if (!adId) return res.status(400).json({ error: 'Thiếu ad_id' });
    const bo = {
      ad_id: adId,
      nguon: 'thu_cong',
      cap_nhat_boi: req.user.userId,
      updated_at: new Date().toISOString(),
    };
    for (const k of ['ad_name', 'adset_name', 'campaign_id', 'campaign_name', 'ghi_chu']) {
      if (req.body?.[k] !== undefined) bo[k] = req.body[k] || null;
    }
    const { data, error } = await supabase.from('fb_ad_catalog')
      .upsert(bo, { onConflict: 'ad_id' }).select().maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ ok: true, ad: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/ads/bulk-name', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được đặt tên chiến dịch' });
    const ids = Array.isArray(req.body?.ad_ids) ? req.body.ad_ids.map(String).filter(Boolean) : [];
    const ten = req.body?.campaign_name ? String(req.body.campaign_name).trim() : null;
    if (!ids.length) return res.status(400).json({ error: 'Thiếu ad_ids' });
    if (!ten) return res.status(400).json({ error: 'Thiếu campaign_name' });
    const now = new Date().toISOString();
    const rows = ids.map((id) => ({
      ad_id: id,
      campaign_name: ten,
      campaign_id: req.body?.campaign_id || null,
      nguon: 'thu_cong',
      cap_nhat_boi: req.user.userId,
      updated_at: now,
    }));
    const { error } = await supabase.from('fb_ad_catalog').upsert(rows, { onConflict: 'ad_id' });
    if (error) throw new Error(error.message);
    res.json({ ok: true, da_dat_ten: rows.length, campaign_name: ten });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách cho ô lọc: hệ sinh thái → công ty → page. Đã cắt theo quyền. */
r.get('/bo-loc', async (req, res) => {
  try {
    const dsCT = await congTyChoPhep(req);

    let qc = supabase.from('companies')
      .select('id, name, short_name, tenant_id')
      .neq('is_active', false)
      .order('name');
    if (dsCT) qc = qc.in('id', dsCT);
    const { data: cty, error: e1 } = await qc;
    if (e1) throw new Error(e1.message);

    const idCty = (cty || []).map((x) => String(x.id));
    const tenantId = req.tenantContext?.tenantId || req.user?.tenant_id || null;

    const [tenantRow, pageRows] = await Promise.all([
      tenantId
        ? supabase.from('tenants').select('id, name').eq('id', tenantId).maybeSingle()
          .then((x) => x.data || null, () => null)
        : Promise.resolve(null),
      supabase.from('facebook_pages')
        .select('page_id, page_name, default_company_id')
        .order('page_name')
        .then((x) => x.data || [], () => []),
    ]);

    // Page không gắn công ty chỉ hiện cho tài khoản không bị giới hạn công ty.
    const pages = pageRows
      .filter((p) => !dsCT || idCty.includes(String(p.default_company_id || '')))
      .map((p) => ({
        page_id: String(p.page_id),
        page_name: p.page_name || String(p.page_id),
        company_id: p.default_company_id ? String(p.default_company_id) : null,
      }));

    res.json({
      he_sinh_thai: tenantRow ? { id: String(tenantRow.id), ten: tenantRow.name } : null,
      khoa_theo_he_sinh_thai: isTenantScopeEnforced(req),
      cong_ty: (cty || []).map((c) => ({ id: String(c.id), ten: c.short_name || c.name })),
      pages,
    });
  } catch (e) {
    console.error('[ad-analytics/bo-loc]', e);
    res.status(500).json({ error: e.message });
  }
});

function marketingCompanyScope(req) {
  const { accountCompanyScope } = require('../modules/marketingAutomation/accountScope');
  return accountCompanyScope(req.user, { tenantEnforced: isTenantScopeEnforced(req), tenantCompanyIds: req.tenantCompanyIds });
}
function accountAllowed(scope, company) { return scope === null || (company && scope.includes(String(company))); }
async function storedAccount(id) {
  const r = await supabase.from('fb_ad_accounts').select('ad_account_id,company_id,tenant_id,access_token').eq('ad_account_id', id).maybeSingle();
  if (r.error) throw new Error('ACCOUNT_SOURCE_UNAVAILABLE');
  return r.data;
}

// Aggregate-only endpoint. Company authorization is resolved on the server.
r.get('/marketing/spend-coverage', async (req, res) => {
  const company = String(req.query.company_id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company)) return res.status(400).json({ status: 'UNKNOWN', reason: 'SELECT_COMPANY', spendVnd: null });
  try {
    const permitted = marketingCompanyScope(req);
    if (permitted && !permitted.includes(company)) return res.status(403).json({ status: 'UNKNOWN', reason: 'COMPANY_DENIED', spendVnd: null });
    const { calendarDays } = require('../modules/marketingAutomation/facebookSpendSource');
    try { calendarDays(req.query.from, req.query.to); } catch { return res.status(400).json({ status: 'UNKNOWN', reason: 'INVALID_DATE_RANGE', spendVnd: null }); }
    const { readSpendCoverage } = require('../modules/marketingAutomation/spendCoverage');
    const { isFailoverEnabled, getActiveTarget } = require('../config/supabaseRouter');
    const result = await readSpendCoverage({ client: supabase, companyId: company, since: req.query.from, until: req.query.to,
      sourceAllowed: process.env.VPT_CERTIFIED_FACEBOOK_SPEND === '1' && !isFailoverEnabled() && getActiveTarget() === 'primary' });
    res.json(result);
  } catch { res.status(503).json({ status: 'UNKNOWN', reason: 'SPEND_SOURCE_UNAVAILABLE', spendVnd: null }); }
});

// ─── Marketing API: khai báo tài khoản, kiểm tra, đồng bộ ────────────────────

r.get('/marketing/status', async (req, res) => {
  try {
    res.json(await daCauHinh({ companyIds: marketingCompanyScope(req) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/marketing/test', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được nối Marketing API' });
    const scope = marketingCompanyScope(req);
    const id = chuanHoaActId(req.body?.ad_account_id);
    if (!id || !/^act_[0-9]+$/.test(id)) return res.status(400).json({ error: 'Ad Account ID không hợp lệ' });
    const existing = await storedAccount(id);
    if (existing && !accountAllowed(scope, existing.company_id)) return res.status(403).json({ error: 'Tài khoản nằm ngoài phạm vi công ty' });
    const company = existing ? existing.company_id : req.body?.company_id;
    if (!accountAllowed(scope, company)) return res.status(403).json({ error: 'Tài khoản nằm ngoài phạm vi công ty' });
    const token = req.body?.access_token || existing?.access_token;
    const result = await kiemTraKetNoi(id, token);
    res.json({ ok: true, ...result });
  } catch { res.status(400).json({ ok: false, error: 'Chưa kiểm tra được kết nối tài khoản.' }); }
});

r.put('/marketing/account', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được nối Marketing API' });
    const scope = marketingCompanyScope(req), id = chuanHoaActId(req.body?.ad_account_id);
    if (!id || !/^act_[0-9]+$/.test(id)) return res.status(400).json({ error: 'Ad Account ID không hợp lệ' });
    const existing = await storedAccount(id);
    if (existing && !accountAllowed(scope, existing.company_id)) return res.status(403).json({ error: 'Tài khoản nằm ngoài phạm vi công ty' });
    const company = req.body?.company_id || existing?.company_id;
    if (!company || !accountAllowed(scope, company)) return res.status(403).json({ error: 'Chọn công ty trong phạm vi được phép' });
    const owner = await supabase.from('companies').select('id,tenant_id').eq('id', company).maybeSingle();
    if (owner.error || !owner.data) return res.status(400).json({ error: 'Chưa xác minh được công ty' });
    if (req.body?.tenant_id !== undefined && req.body.tenant_id !== owner.data.tenant_id) return res.status(403).json({ error: 'Phạm vi hệ sinh thái không khớp công ty' });
    const record = { ad_account_id: id, company_id: company, tenant_id: owner.data.tenant_id, updated_at: new Date().toISOString() };
    if (req.body?.ten !== undefined) record.ten = req.body.ten == null ? null : String(req.body.ten).trim().slice(0,200) || null;
    if (req.body?.bat !== undefined) {
      if (typeof req.body.bat !== 'boolean') return res.status(400).json({ error: 'Trạng thái tài khoản không hợp lệ' });
      record.bat = req.body.bat;
    }
    const token = String(req.body?.access_token || '').trim(); if (token) record.access_token = token;
    // Scope checked against current owner again in the write predicate. Insert
    // never upserts an account another company created concurrently.
    let q = supabase.from('fb_ad_accounts');
    if (existing) {
      q = q.update(record).eq('ad_account_id',id);
      q = existing.company_id ? q.eq('company_id',existing.company_id) : q.is('company_id',null);
    } else q = q.insert(record);
    const result = await q.select('ad_account_id,ten,tenant_id,company_id,bat,lan_dong_bo_cuoi').maybeSingle();
    if (result.error || !result.data) return res.status(409).json({ error: 'Tài khoản đã thay đổi; vui lòng tải lại.' });
    res.json({ ok: true, tai_khoan: result.data });
  } catch { res.status(503).json({ error: 'Chưa lưu được cấu hình tài khoản.' }); }
});

r.post('/marketing/sync', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được chạy đồng bộ' });
    const companyIds = marketingCompanyScope(req);
    if (companyIds && !companyIds.length) return res.status(403).json({ error: 'Chưa xác định được phạm vi công ty' });
    const ngay = Math.min(90, Math.max(1, Math.floor(Number(req.body?.ngay) || 30)));
    const result = await dongBoTatCa({ ngay, companyIds });
    // Do not launch the global analysis writer from a company-scoped request.
    res.json({ ok: result.ket_qua.every(x => x.ok === true), ...result, phan_tich_lai: null });
  } catch { res.status(503).json({ error: 'Chưa đồng bộ được dữ liệu quảng cáo.' }); }
});

module.exports = r;
