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
 *   GET  /pages-profile      hồ sơ từng page cho màn hình thẻ
 *   GET  /page-ads           quảng cáo của một page cho màn chi tiết
 *   GET  /page-posts         gom theo BÀI VIẾT — một bài có thể chạy bằng nhiều quảng cáo
 *   GET  /post-leads         từng lead/deal/đơn chốt + dự án của một bài viết
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
const { layTheoLo, layTheoLoMem } = require('../helpers/supabaseLo');
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
/**
 * @param {boolean} chiQuangCao — chỉ nạp dòng CÓ ad_id.
 *   Mặc định nạp hết ~6.800 dòng quy kết, trong đó chỉ ~300 dòng có ad_id.
 *   Nếu máy chủ giới hạn số dòng trả về (PostgREST có ngưỡng riêng, không phải
 *   cứ .limit() to là được), phần bị cắt gần như toàn là dòng không có ad_id,
 *   và màn hình quảng cáo sẽ thiếu dữ liệu một cách âm thầm.
 *   Màn nào chỉ quan tâm quảng cáo thì lọc ngay từ máy chủ cho chắc.
 */
async function napDuLieu(req, { chiQuangCao = false } = {}) {
  const tu = isoNgay(req.query.from);
  const den = isoNgay(req.query.to, true);
  const pageId = req.query.page_id ? String(req.query.page_id) : null;

  let qa = supabase.from('lead_attribution')
    .select('lead_id, fb_page_id, fb_ad_id, fb_adset_id, fb_campaign_id, fb_ad_title, fb_post_id, fb_source, kenh, cham_dau_luc')
    .not('lead_id', 'is', null)
    .order('cham_dau_luc', { ascending: false })
    .limit(20000);
  if (chiQuangCao) qa = qa.not('fb_ad_id', 'is', null);
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
    layTheoLo('crm_leads', 'id', ids,
      'id, type, actual_close_date, estimated_value, company_id, created_at'),
    layTheoLo('lead_quality_scores', 'lead_id', ids, 'lead_id, diem, nhan'),
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

/**
 * Đếm LƯỢT CHẠM QUẢNG CÁO CHƯA THÀNH LEAD, gom theo page / bài / quảng cáo.
 *
 * Quy kết được ghi ngay khi khách nhắn (mức contact), lead chỉ sinh ra sau khi
 * được duyệt. Mọi màn phân tích đều lọc `lead_id is not null` nên số người thật
 * sự nhắn về bị đếm thiếu — đo ngày 04/10/2026 là 156/512 lượt, tức 30%.
 *
 * Không đếm thiếu nữa, nhưng cũng KHÔNG cộng vào cột lead: đây là hai thứ khác
 * nhau. Lead là người đã vào quy trình, lượt chạm là người mới nhắn. Gộp lại thì
 * tỉ lệ chốt sẽ bị pha loãng và mọi so sánh cũ hoá sai.
 *
 * Không cắt được theo công ty: chưa có lead thì chưa có công ty. Bù lại, nơi gọi
 * chỉ gắn số vào những khoá ĐÃ nằm trong nhóm đã lọc quyền, nên không lộ chéo.
 */
async function demChuaThanhLead({ tu, den, pageId } = {}) {
  const rong = { page: new Map(), bai: new Map(), qc: new Map(), tong: 0 };
  let q = supabase.from('lead_attribution')
    .select('fb_page_id, fb_ad_id, fb_post_id')
    .not('fb_ad_id', 'is', null)
    .is('lead_id', null)
    .limit(20000);
  if (tu) q = q.gte('cham_dau_luc', tu);
  if (den) q = q.lte('cham_dau_luc', den);
  if (pageId) q = q.eq('fb_page_id', pageId);

  const { data, error } = await q;
  if (error) {
    console.warn('[ad-analytics/chua-thanh-lead]', error.message);
    return rong;
  }
  const cong = (m, k) => { if (k) m.set(String(k), (m.get(String(k)) || 0) + 1); };
  for (const x of data || []) {
    cong(rong.page, x.fb_page_id);
    cong(rong.bai, x.fb_post_id);
    cong(rong.qc, x.fb_ad_id);
    rong.tong += 1;
  }
  return rong;
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
    roas: spend > 0 ? Math.round((o.revenue / spend) * 100) / 100 : null,
  };
}

function oTrong() {
  return {
    leads: 0,
    by_label: { rac: 0, lanh: 0, am: 0, nong: 0, da_chot: 0 },
    _sum: 0, _n: 0, deals: 0, closed: 0, revenue: 0,
  };
}

function chot(g) {
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
}

function congDon(g, l, d) {
  g.leads += 1;
  if (d) {
    g.by_label[d.nhan] = (g.by_label[d.nhan] || 0) + 1;
    g._sum += Number(d.diem) || 0;
    g._n += 1;
  }
  if (l.type === 'deal') g.deals += 1;
  if (l.actual_close_date) { g.closed += 1; g.revenue += Number(l.estimated_value) || 0; }
}

r.get('/summary', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mChiTieu } = await napDuLieu(req);
    const tong = oTrong();
    const tuQC = oTrong();
    const adSet = new Set();
    const pageSet = new Set();
    let donChuaCoGia = 0;
    const daDem = new Set();
    for (const a of rows) {
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const d = mDiem.get(String(a.lead_id));
      congDon(tong, l, d);
      if (a.fb_ad_id) {
        congDon(tuQC, l, d);
        adSet.add(String(a.fb_ad_id));
        if (a.fb_page_id) pageSet.add(String(a.fb_page_id));
        // Đơn chốt mà để giá 0 thì mọi con số về tiền sau này đều sai.
        const k = String(a.lead_id);
        if (l.actual_close_date && !daDem.has(k)) {
          daDem.add(k);
          if (!(Number(l.estimated_value) > 0)) donChuaCoGia += 1;
        }
      }
    }
    const coChiTieu = mChiTieu.size > 0;
    res.json({
      tat_ca: themChiTieu(chot(tong), adSet, mChiTieu),
      tu_quang_cao: themChiTieu(chot(tuQC), adSet, mChiTieu),
      so_quang_cao: adSet.size,
      so_page: pageSet.size,
      don_chua_co_gia: donChuaCoGia,
      ti_le_biet_quang_cao: tong.leads ? Math.round((tuQC.leads / tong.leads) * 100) : 0,
      co_chi_tieu: coChiTieu,
      ghi_chu_chi_tieu: coChiTieu
        ? 'Chi tiêu lấy từ Marketing API. ROAS tính trên giá trị đơn đã chốt, đơn nào để giá 0 thì không vào ROAS.'
        : 'Chi tiêu và ROAS chưa có — cần khai báo tài khoản quảng cáo và token Marketing API.',
    });
  } catch (e) {
    console.error('[ad-analytics/summary]', e);
    res.status(500).json({ error: e.message });
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
    console.error('[ad-analytics/ads]', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/campaigns', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mCat, mChiTieu } = await napDuLieu(req);
    const gom = new Map();
    let chuaDatTen = 0;
    for (const a of rows) {
      if (!a.fb_ad_id) continue;
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const c = mCat.get(String(a.fb_ad_id)) || {};
      const ten = c.campaign_name || null;
      const k = ten || `__chua_dat_ten__${a.fb_ad_id}`;
      if (!ten) chuaDatTen += 1;
      if (!gom.has(k)) {
        gom.set(k, {
          campaign_id: c.campaign_id || null,
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
    res.json({ data, total: data.length, lead_chua_dat_ten_chien_dich: chuaDatTen });
  } catch (e) {
    console.error('[ad-analytics/campaigns]', e);
    res.status(500).json({ error: e.message });
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
      if (a.fb_ad_id) { g.co_ad_id += 1; g.ad_ids.add(String(a.fb_ad_id)); }
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    const data = [...gom.values()]
      .map((g) => themChiTieu(chot(g), g.ad_ids, mChiTieu))
      .map(({ ad_ids, ...rest }) => rest)
      .sort((x, y) => y.leads - x.leads);
    res.json({ data, total: data.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    let rows = data || [];
    if (dsCT) rows = rows.filter((x) => dsCT.includes(String(x.so_lieu?.company_id || '')));
    if (pageId) rows = rows.filter((x) => String(x.so_lieu?.page_id || '') === pageId);

    const nen = rows.length
      ? (() => {
        const leads = rows.reduce((a, x) => a + (x.so_lieu?.leads || 0), 0);
        const closed = rows.reduce((a, x) => a + (x.so_lieu?.closed || 0), 0);
        const revenue = rows.reduce((a, x) => a + (x.so_lieu?.revenue || 0), 0);
        return {
          so_quang_cao: rows.length,
          leads,
          closed,
          revenue,
          ti_le_chot: leads ? Math.round((closed / leads) * 100) : 0,
          doanh_thu_moi_lead: leads ? Math.round(revenue / leads) : 0,
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

    // Đếm lead CÓ ad_id theo page. Chỉ vài trăm dòng vì đã lọc ad_id, không nặng.
    // Mục đích: ô chọn phải nói trước page nào không bao giờ có dữ liệu quảng cáo,
    // thay vì để người dùng chọn rồi nhận một màn hình trống không hiểu vì sao.
    const demQC = new Map();
    try {
      const { data: qc } = await supabase.from('lead_attribution')
        .select('fb_page_id')
        .not('fb_ad_id', 'is', null)
        .limit(20000);
      for (const r of qc || []) {
        const k = String(r.fb_page_id || '');
        demQC.set(k, (demQC.get(k) || 0) + 1);
      }
    } catch { /* không đếm được thì thôi, ô chọn vẫn dùng được */ }

    // Page không gắn công ty chỉ hiện cho tài khoản không bị giới hạn công ty.
    const pages = pageRows
      .filter((p) => !dsCT || idCty.includes(String(p.default_company_id || '')))
      .map((p) => ({
        page_id: String(p.page_id),
        page_name: p.page_name || String(p.page_id),
        company_id: p.default_company_id ? String(p.default_company_id) : null,
        lead_quang_cao: demQC.get(String(p.page_id)) || 0,
      }));

    const demTheoCty = new Map();
    for (const p of pages) {
      const k = String(p.company_id || '');
      demTheoCty.set(k, (demTheoCty.get(k) || 0) + p.lead_quang_cao);
    }

    res.json({
      he_sinh_thai: tenantRow ? { id: String(tenantRow.id), ten: tenantRow.name } : null,
      khoa_theo_he_sinh_thai: isTenantScopeEnforced(req),
      cong_ty: (cty || []).map((c) => ({
        id: String(c.id),
        ten: c.short_name || c.name,
        lead_quang_cao: demTheoCty.get(String(c.id)) || 0,
      })),
      pages,
    });
  } catch (e) {
    console.error('[ad-analytics/bo-loc]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Hồ sơ từng Page cho màn hình đầu của trang chiến dịch.
 * Mỗi page một thẻ: công ty, số liệu, dải mẫu quảng cáo, trạng thái kết nối.
 */
r.get('/pages-profile', async (req, res) => {
  try {
    const { rows, mLead, mDiem, mPage, mChiTieu } = await napDuLieu(req, { chiQuangCao: true });

    const gom = new Map();
    for (const a of rows) {
      if (!a.fb_ad_id) continue;                 // thẻ này nói về quảng cáo
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const k = String(a.fb_page_id || 'khong-ro');
      if (!gom.has(k)) {
        const p = mPage.get(k) || {};
        gom.set(k, {
          page_id: a.fb_page_id || null,
          page_name: p.page_name || null,
          company_id: p.default_company_id ? String(p.default_company_id) : null,
          ad_ids: new Set(),
          lan_cuoi: a.cham_dau_luc,
          lead_7_ngay: 0,
          ...oTrong(),
        });
      }
      const g = gom.get(k);
      g.ad_ids.add(String(a.fb_ad_id));
      if (a.cham_dau_luc > g.lan_cuoi) g.lan_cuoi = a.cham_dau_luc;
      if (new Date(a.cham_dau_luc).getTime() >= Date.now() - 7 * 86400000) g.lead_7_ngay += 1;
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    if (!gom.size) return res.json({ data: [], tong: 0 });

    // Tên công ty + hệ sinh thái
    const idCty = [...new Set([...gom.values()].map((g) => g.company_id).filter(Boolean))];
    const cty = idCty.length
      ? await supabase.from('companies').select('id, name, short_name, tenant_id').in('id', idCty)
        .then((x) => x.data || [], () => [])
      : [];
    const idTenant = [...new Set(cty.map((c) => c.tenant_id).filter(Boolean))];
    const tenants = idTenant.length
      ? await supabase.from('tenants').select('id, name').in('id', idTenant)
        .then((x) => x.data || [], () => [])
      : [];
    const mTenant = new Map(tenants.map((t) => [String(t.id), t.name]));
    const mCty = new Map(cty.map((c) => [String(c.id), {
      ten: c.short_name || c.name,
      he_sinh_thai: mTenant.get(String(c.tenant_id)) || null,
    }]));

    // Dải mẫu quảng cáo — lấy mới nhất, lọc trùng theo khoá ổn định.
    // URL Facebook là link ký có hạn nên mẫu cũ sẽ không hiện được nữa; đó là
    // lý do chỉ lấy mẫu gần đây chứ không lấy toàn bộ lịch sử.
    const creatives = await supabase.from('lead_attribution')
      .select('fb_page_id, fb_ad_id, fb_post_id, fb_creative_url, fb_creative_type, fb_creative_key, cham_dau_luc')
      .not('fb_creative_url', 'is', null)
      .order('cham_dau_luc', { ascending: false })
      .limit(1500)
      .then((x) => x.data || [], () => []);

    const mCre = new Map();
    for (const c of creatives) {
      const k = String(c.fb_page_id || '');
      if (!gom.has(k)) continue;
      if (!mCre.has(k)) mCre.set(k, { ds: [], khoa: new Set() });
      const o = mCre.get(k);
      const khoa = c.fb_creative_key || c.fb_creative_url;
      if (o.khoa.has(khoa)) continue;
      // Đếm HẾT số mẫu khác nhau, nhưng chỉ trả về 8 ảnh đầu. Nếu cắt luôn phần
      // đếm thì huy hiệu "+N" trên thẻ sẽ nói dối: page có 45 mẫu mà báo +3.
      o.khoa.add(khoa);
      if (o.ds.length < 8) {
        // post_id đi kèm TỪNG mẫu: một page chạy nhiều bài, nên link "Mở bài viết"
        // phải bám theo đúng ảnh đang xem chứ không dùng chung một bài cho cả page.
        o.ds.push({
          url: c.fb_creative_url,
          loai: c.fb_creative_type,
          ad_id: c.fb_ad_id,
          post_id: c.fb_post_id || null,
        });
      }
    }

    const chuaLead = await demChuaThanhLead({
      tu: isoNgay(req.query.from),
      den: isoNgay(req.query.to, true),
      pageId: req.query.page_id ? String(req.query.page_id) : null,
    });

    const bayGio = Date.now();
    const data = [...gom.values()].map((g) => {
      const o = themChiTieu(chot(g), g.ad_ids, mChiTieu);
      const imLang = Math.max(0, Math.round((bayGio - new Date(g.lan_cuoi).getTime()) / 86400000));
      const ct = mCty.get(String(g.company_id)) || {};
      const cre = mCre.get(String(g.page_id)) || { ds: [], khoa: new Set() };
      return {
        page_id: g.page_id,
        page_name: g.page_name || g.page_id,
        cong_ty: ct.ten || null,
        he_sinh_thai: ct.he_sinh_thai || null,
        so_quang_cao: g.ad_ids.size,
        leads: o.leads,
        quality_leads: o.quality_leads,
        quality_rate: o.quality_rate,
        by_label: o.by_label,      // để thẻ vẽ được dải phân bố chất lượng
        junk_rate: o.junk_rate,
        closed: o.closed,
        close_rate: o.close_rate,
        revenue: o.revenue,
        spend: o.spend ?? null,
        cost_per_lead: o.cost_per_lead ?? null,
        roas: o.roas ?? null,
        lead_7_ngay: g.lead_7_ngay,
        lan_cuoi: g.lan_cuoi,
        im_lang_ngay: imLang,
        // Im lặng quá 7 ngày mà trước đó có lead đều → đáng nghi, không khẳng định hỏng.
        canh_bao: imLang >= 7 ? 'im_lang' : null,
        mau_quang_cao: cre.ds,              // tối đa 8 ảnh để hiện
        so_mau: cre.khoa ? cre.khoa.size : cre.ds.length,   // tổng số mẫu khác nhau
        chua_thanh_lead: chuaLead.page.get(String(g.page_id)) || 0,
      };
    }).sort((x, y) => y.leads - x.leads);

    res.json({ data, tong: data.length, co_chi_tieu: mChiTieu.size > 0 });
  } catch (e) {
    console.error('[ad-analytics/pages-profile]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Danh sách quảng cáo của một page — cho màn chi tiết.
 *
 * Dẫn đầu mỗi quảng cáo là ẢNH MẪU chứ không phải tiêu đề: đo trên dữ liệu thật,
 * cả 5 quảng cáo của NextGo đều mang đúng một tiêu đề "Quảng cáo Lượt tương tác mới",
 * nên tiêu đề không dùng để phân biệt được.
 */
r.get('/page-ads', async (req, res) => {
  try {
    const pid = String(req.query.page_id || '').trim();
    if (!pid) return res.status(400).json({ error: 'Thiếu page_id' });

    const { rows, mLead, mDiem, mCat, mPage, mChiTieu } = await napDuLieu(req, { chiQuangCao: true });

    const gom = new Map();
    for (const a of rows) {
      if (!a.fb_ad_id) continue;
      if (String(a.fb_page_id || '') !== pid) continue;
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const k = String(a.fb_ad_id);
      if (!gom.has(k)) {
        const c = mCat.get(k) || {};
        gom.set(k, {
          ad_id: k,
          ad_title: a.fb_ad_title || c.ad_name || null,
          campaign_name: c.campaign_name || null,
          post_id: a.fb_post_id || null,
          lan_cuoi: a.cham_dau_luc,
          ...oTrong(),
        });
      }
      const g = gom.get(k);
      if (!g.post_id && a.fb_post_id) g.post_id = a.fb_post_id;
      if (a.cham_dau_luc > g.lan_cuoi) g.lan_cuoi = a.cham_dau_luc;
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    if (!gom.size) return res.json({ page: null, data: [], tong: 0 });

    // Ảnh mẫu theo từng quảng cáo, lọc trùng bằng khoá ổn định.
    const cre = await supabase.from('lead_attribution')
      .select('fb_ad_id, fb_creative_url, fb_creative_type, fb_creative_key, cham_dau_luc')
      .eq('fb_page_id', pid)
      .not('fb_creative_url', 'is', null)
      .order('cham_dau_luc', { ascending: false })
      .limit(1500)
      .then((x) => x.data || [], () => []);

    const mCre = new Map();
    for (const c of cre) {
      const k = String(c.fb_ad_id || '');
      if (!gom.has(k)) continue;
      if (!mCre.has(k)) mCre.set(k, { ds: [], khoa: new Set() });
      const o = mCre.get(k);
      const khoa = c.fb_creative_key || c.fb_creative_url;
      if (o.khoa.has(khoa)) continue;
      o.khoa.add(khoa);
      // Giữ tới 12 ảnh để khung xem phóng to còn lật được, thẻ chỉ hiện 2 ảnh đầu.
      if (o.ds.length < 12) o.ds.push({ url: c.fb_creative_url, loai: c.fb_creative_type });
    }

    const chuaLead = await demChuaThanhLead({
      tu: isoNgay(req.query.from), den: isoNgay(req.query.to, true), pageId: pid,
    });

    const bayGio = Date.now();
    const p = mPage.get(pid) || {};
    const data = [...gom.values()].map((g) => {
      const o = themChiTieu(chot(g), [g.ad_id], mChiTieu);
      const c = mCre.get(g.ad_id) || { ds: [], khoa: new Set() };
      return {
        ad_id: g.ad_id,
        ad_title: g.ad_title,
        campaign_name: g.campaign_name,
        post_id: g.post_id,
        page_id: pid,
        leads: o.leads,
        deals: o.deals,
        closed: o.closed,
        close_rate: o.close_rate,
        revenue: o.revenue,
        quality_rate: o.quality_rate,
        junk_rate: o.junk_rate,
        by_label: o.by_label,
        spend: o.spend ?? null,
        cost_per_lead: o.cost_per_lead ?? null,
        roas: o.roas ?? null,
        lan_cuoi: g.lan_cuoi,
        im_lang_ngay: Math.max(0, Math.round((bayGio - new Date(g.lan_cuoi).getTime()) / 86400000)),
        mau_quang_cao: c.ds,
        so_mau: c.khoa.size,
        chua_thanh_lead: chuaLead.qc.get(String(g.ad_id)) || 0,
      };
    }).sort((x, y) => y.leads - x.leads);

    res.json({
      page: { page_id: pid, page_name: p.page_name || pid },
      data,
      tong: data.length,
      chua_thanh_lead_tong: chuaLead.tong,
    });
  } catch (e) {
    console.error('[ad-analytics/page-ads]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Phân tích theo BÀI VIẾT của một page.
 *
 * Khác hẳn gom theo quảng cáo, và đó là lý do nó tồn tại: đo trên dữ liệu thật
 * có 27 bài viết nhưng 43 quảng cáo — một bài đang được chạy bằng tới 10 quảng cáo.
 * Nhìn theo quảng cáo thì 90 lead của bài đó bị xé thành 10 mẩu, mẩu nào cũng
 * "chưa đủ dữ liệu"; gom lại theo bài mới thấy nó là nguồn lead lớn nhất hệ thống
 * mà chỉ chốt 2%.
 */
r.get('/page-posts', async (req, res) => {
  try {
    const pid = String(req.query.page_id || '').trim();
    if (!pid) return res.status(400).json({ error: 'Thiếu page_id' });

    const { rows, mLead, mDiem, mPage, mChiTieu } = await napDuLieu(req, { chiQuangCao: true });

    const gom = new Map();
    for (const a of rows) {
      if (!a.fb_ad_id || !a.fb_post_id) continue;
      if (String(a.fb_page_id || '') !== pid) continue;
      const l = mLead.get(String(a.lead_id));
      if (!l) continue;
      const k = String(a.fb_post_id);
      if (!gom.has(k)) {
        gom.set(k, {
          post_id: k,
          tieu_de: a.fb_ad_title || null,
          ad_ids: new Set(),
          lan_cuoi: a.cham_dau_luc,
          ...oTrong(),
        });
      }
      const g = gom.get(k);
      g.ad_ids.add(String(a.fb_ad_id));
      if (!g.tieu_de && a.fb_ad_title) g.tieu_de = a.fb_ad_title;
      if (a.cham_dau_luc > g.lan_cuoi) g.lan_cuoi = a.cham_dau_luc;
      congDon(g, l, mDiem.get(String(a.lead_id)));
    }
    if (!gom.size) return res.json({ page: null, data: [], tong: 0 });

    const cre = await supabase.from('lead_attribution')
      .select('fb_post_id, fb_creative_url, fb_creative_type, fb_creative_key, cham_dau_luc')
      .eq('fb_page_id', pid)
      .not('fb_creative_url', 'is', null)
      .order('cham_dau_luc', { ascending: false })
      .limit(1500)
      .then((x) => x.data || [], () => []);

    const mCre = new Map();
    for (const c of cre) {
      const k = String(c.fb_post_id || '');
      if (!gom.has(k)) continue;
      if (!mCre.has(k)) mCre.set(k, { ds: [], khoa: new Set() });
      const o = mCre.get(k);
      const khoa = c.fb_creative_key || c.fb_creative_url;
      if (o.khoa.has(khoa)) continue;
      o.khoa.add(khoa);
      if (o.ds.length < 12) o.ds.push({ url: c.fb_creative_url, loai: c.fb_creative_type });
    }

    const chuaLead = await demChuaThanhLead({
      tu: isoNgay(req.query.from), den: isoNgay(req.query.to, true), pageId: pid,
    });

    const bayGio = Date.now();
    const p = mPage.get(pid) || {};
    const data = [...gom.values()].map((g) => {
      const o = themChiTieu(chot(g), g.ad_ids, mChiTieu);
      const c = mCre.get(g.post_id) || { ds: [], khoa: new Set() };
      return {
        post_id: g.post_id,
        page_id: pid,
        tieu_de: g.tieu_de,
        so_quang_cao: g.ad_ids.size,
        ad_ids: [...g.ad_ids],
        leads: o.leads,
        deals: o.deals,
        closed: o.closed,
        close_rate: o.close_rate,
        revenue: o.revenue,
        quality_rate: o.quality_rate,
        junk_rate: o.junk_rate,
        by_label: o.by_label,
        spend: o.spend ?? null,
        cost_per_lead: o.cost_per_lead ?? null,
        roas: o.roas ?? null,
        lan_cuoi: g.lan_cuoi,
        im_lang_ngay: Math.max(0, Math.round((bayGio - new Date(g.lan_cuoi).getTime()) / 86400000)),
        mau_quang_cao: c.ds,
        so_mau: c.khoa.size,
        chua_thanh_lead: chuaLead.bai.get(String(g.post_id)) || 0,
      };
    }).sort((x, y) => y.leads - x.leads);

    res.json({
      page: { page_id: pid, page_name: p.page_name || pid },
      data,
      tong: data.length,
      chua_thanh_lead_tong: chuaLead.tong,
    });
  } catch (e) {
    console.error('[ad-analytics/page-posts]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * DANH SÁCH LEAD của một bài viết (hoặc của một quảng cáo).
 *
 * Màn gom (page / bài / quảng cáo) chỉ trả về con số; chỗ này trả về từng người
 * đứng sau con số đó, để kiểm chứng được: 181 lead mà 3 đơn thì 178 người kia
 * đang nằm ở giai đoạn nào, ai đang giữ, đơn nào đã có dự án.
 *
 * Dự án nối với lead qua HAI đường, và phải xét cả hai:
 *   1. crm_leads.project_id — đường trực tiếp.
 *   2. projects.customer_id — đường qua khách hàng, vì nhiều dự án được tạo
 *      thẳng từ khách chứ không gắn ngược lại vào lead.
 * Đo ngày 02/10/2026: 0/308 lead từ quảng cáo có dự án theo cả hai đường, nên
 * cột này hiện sẽ trống — đó là sự thật của dữ liệu, không phải lỗi màn hình.
 */
r.get('/post-leads', async (req, res) => {
  try {
    const pid = String(req.query.page_id || '').trim();
    const postId = String(req.query.post_id || '').trim();
    const adId = String(req.query.ad_id || '').trim();
    if (!pid) return res.status(400).json({ error: 'Thiếu page_id' });
    if (!postId && !adId) return res.status(400).json({ error: 'Thiếu post_id hoặc ad_id' });

    const { rows, mLead, mDiem, mCat, mPage } = await napDuLieu(req, { chiQuangCao: true });

    // Một lead có thể có nhiều dòng quy kết (nhắn lại nhiều lần). rows đã sắp
    // giảm dần theo thời gian chạm, nên dòng gặp ĐẦU TIÊN là lần chạm mới nhất.
    const canh = new Map();
    for (const a of rows) {
      if (String(a.fb_page_id || '') !== pid) continue;
      if (postId && String(a.fb_post_id || '') !== postId) continue;
      if (adId && String(a.fb_ad_id || '') !== adId) continue;
      const k = String(a.lead_id);
      if (!mLead.has(k)) continue;              // ngoài quyền công ty → không trả
      if (!canh.has(k)) canh.set(k, a);
    }

    const p = mPage.get(pid) || {};
    const bai = {
      page_id: pid,
      page_name: p.page_name || pid,
      post_id: postId || null,
      ad_id: adId || null,
      tieu_de: null,
      so_quang_cao: 0,
    };
    if (!canh.size) {
      return res.json({ bai, data: [], tong: 0, tom_tat: null });
    }

    const dsQC = new Set();
    for (const a of canh.values()) {
      if (a.fb_ad_id) dsQC.add(String(a.fb_ad_id));
      if (!bai.tieu_de && a.fb_ad_title) bai.tieu_de = a.fb_ad_title;
      if (!bai.post_id && a.fb_post_id) bai.post_id = String(a.fb_post_id);
    }
    bai.so_quang_cao = dsQC.size;

    const ids = [...canh.keys()];
    const chiTiet = await layTheoLo('crm_leads', 'id', ids,
      'id, code, title, type, stage_id, customer_id, project_id, assigned_to, '
      + 'estimated_value, actual_close_date, created_at, lead_temperature');

    const idKhach = [...new Set(chiTiet.map((l) => l.customer_id).filter(Boolean).map(String))];
    const idNguoi = [...new Set(chiTiet.map((l) => l.assigned_to).filter(Boolean).map(String))];
    const idGD = [...new Set(chiTiet.map((l) => l.stage_id).filter(Boolean).map(String))];
    const idDA = [...new Set(chiTiet.map((l) => l.project_id).filter(Boolean).map(String))];

    const CHON_DA = 'id, code, name, status, customer_id, estimated_value, final_value';
    const [khach, nguoi, giaiDoan, daTheoKhach, daTrucTiep] = await Promise.all([
      layTheoLoMem('customers', 'id', idKhach, 'id, full_name, phone'),
      layTheoLoMem('users', 'id', idNguoi, 'id, full_name'),
      layTheoLoMem('crm_pipeline_stages', 'id', idGD, 'id, name'),
      layTheoLoMem('projects', 'customer_id', idKhach, CHON_DA),
      layTheoLoMem('projects', 'id', idDA, CHON_DA),
    ]);

    const mKhach = new Map(khach.map((x) => [String(x.id), x]));
    const mNguoi = new Map(nguoi.map((x) => [String(x.id), x.full_name || null]));
    const mGD = new Map(giaiDoan.map((x) => [String(x.id), x.name || null]));
    const mDAId = new Map(daTrucTiep.map((x) => [String(x.id), x]));
    const mDAKhach = new Map();
    for (const d of daTheoKhach) {
      const k = String(d.customer_id || '');
      if (!mDAKhach.has(k)) mDAKhach.set(k, []);
      mDAKhach.get(k).push(d);
    }

    const goiDA = (d) => ({
      id: d.id,
      ma: d.code || null,
      ten: d.name || null,
      trang_thai: d.status || null,
      gia_tri: Number(d.final_value) || Number(d.estimated_value) || 0,
    });

    const data = chiTiet.map((l) => {
      const k = String(l.id);
      const a = canh.get(k);
      const diem = mDiem.get(k);
      const kh = l.customer_id ? mKhach.get(String(l.customer_id)) : null;
      const cat = a?.fb_ad_id ? mCat.get(String(a.fb_ad_id)) : null;

      // Gộp hai đường ra dự án, bỏ trùng theo id.
      const duAn = new Map();
      if (l.project_id && mDAId.has(String(l.project_id))) {
        duAn.set(String(l.project_id), goiDA(mDAId.get(String(l.project_id))));
      }
      for (const d of (l.customer_id ? mDAKhach.get(String(l.customer_id)) || [] : [])) {
        if (!duAn.has(String(d.id))) duAn.set(String(d.id), goiDA(d));
      }

      return {
        lead_id: k,
        ma: l.code || null,
        ten: l.title || kh?.full_name || '— chưa có tên —',
        dien_thoai: kh?.phone || null,
        ngay_vao: a?.cham_dau_luc || l.created_at || null,
        nhan: diem?.nhan || null,
        diem: diem?.diem ?? null,
        nhiet: l.lead_temperature || null,
        loai: l.type === 'deal' ? 'deal' : 'lead',
        da_chot: !!l.actual_close_date,
        ngay_chot: l.actual_close_date || null,
        giai_doan: l.stage_id ? mGD.get(String(l.stage_id)) || null : null,
        gia_tri: Number(l.estimated_value) || 0,
        phu_trach: l.assigned_to ? mNguoi.get(String(l.assigned_to)) || null : null,
        ad_id: a?.fb_ad_id || null,
        ad_ten: cat?.ad_name || cat?.campaign_name || a?.fb_ad_title || null,
        du_an: [...duAn.values()],
      };
    }).sort((x, y) => {
      // Đơn đã chốt lên trước, rồi tới deal, rồi theo ngày vào mới nhất.
      if (x.da_chot !== y.da_chot) return x.da_chot ? -1 : 1;
      if ((x.loai === 'deal') !== (y.loai === 'deal')) return x.loai === 'deal' ? -1 : 1;
      return String(y.ngay_vao || '').localeCompare(String(x.ngay_vao || ''));
    });

    const idDAHet = new Set();
    for (const x of data) for (const d of x.du_an) idDAHet.add(String(d.id));
    const tom_tat = {
      leads: data.length,
      deals: data.filter((x) => x.loai === 'deal').length,
      closed: data.filter((x) => x.da_chot).length,
      revenue: data.filter((x) => x.da_chot).reduce((s, x) => s + x.gia_tri, 0),
      // Đơn đã chốt mà để giá 0 thì mọi con số doanh thu phía trên đều thiếu.
      don_chua_co_gia: data.filter((x) => x.da_chot && !(x.gia_tri > 0)).length,
      so_du_an: idDAHet.size,
    };

    res.json({ bai, data, tong: data.length, tom_tat });
  } catch (e) {
    console.error('[ad-analytics/post-leads]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Marketing API: khai báo tài khoản, kiểm tra, đồng bộ ────────────────────

r.get('/marketing/status', async (req, res) => {
  try {
    res.json(await daCauHinh());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/marketing/test', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được nối Marketing API' });
    const id = req.body?.ad_account_id;
    let token = req.body?.access_token || null;
    if (!token && id) {
      const { data } = await supabase.from('fb_ad_accounts')
        .select('access_token').eq('ad_account_id', chuanHoaActId(id)).maybeSingle();
      token = data?.access_token || null;
    }
    const kq = await kiemTraKetNoi(id, token);
    res.json({ ok: true, ...kq });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

r.put('/marketing/account', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được nối Marketing API' });
    const id = chuanHoaActId(req.body?.ad_account_id);
    if (!id) return res.status(400).json({ error: 'Thiếu Ad Account ID' });

    const bo = { ad_account_id: id, updated_at: new Date().toISOString() };
    for (const k of ['ten', 'tenant_id', 'company_id']) {
      if (req.body?.[k] !== undefined) bo[k] = req.body[k] || null;
    }
    if (req.body?.bat !== undefined) bo.bat = !!req.body.bat;
    // Token chỉ ghi khi người dùng nhập mới; để trống = giữ token cũ.
    const tokenMoi = String(req.body?.access_token || '').trim();
    if (tokenMoi) bo.access_token = tokenMoi;

    const { data, error } = await supabase.from('fb_ad_accounts')
      .upsert(bo, { onConflict: 'ad_account_id' })
      .select('ad_account_id, ten, tenant_id, company_id, bat, lan_dong_bo_cuoi')
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ ok: true, tai_khoan: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/marketing/sync', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được chạy đồng bộ' });
    const ngay = Math.min(90, Math.max(1, Number(req.body?.ngay) || 30));
    const kq = await dongBoTatCa({ ngay });
    // Đồng bộ xong thì phân tích lại ngay để trang khớp số.
    let phanTich = null;
    try { phanTich = await chayPhanTich({ ngay: 90 }); } catch { /* không chặn */ }
    res.json({ ok: true, ...kq, phan_tich_lai: phanTich?.da_phan_tich ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
