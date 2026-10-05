/**
 * Cổng ĐỌC cho đối tác quảng cáo và web ngoài — /api/partner/v1
 *
 * Tách hẳn khỏi /api/external (vốn để GHI lead vào CRM).
 * Chỉ GET, phiên bản hoá, lỗi theo RFC 7807 (application/problem+json).
 *
 *   GET /leads                  danh sách lead + quy kết + điểm chất lượng
 *   GET /leads/:id              chi tiết một lead
 *   GET /campaigns              tổng hợp theo campaign
 *   GET /campaigns/:id/ads      bóc xuống từng quảng cáo
 *   GET /conversions            lead đã chốt trong kỳ + giá trị
 *   GET /meta                   danh mục kênh, nhãn, công ty
 *   GET /health                 trạng thái khoá, phạm vi, hạn mức
 *
 * Thông tin cá nhân trả ra theo pii_level của khoá: hashed | masked | full.
 */
const { Router } = require('express');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { partnerAuth, TRAN_PII_NGAY, TRAN_MOI_PHUT } = require('../middleware/partnerAuth');
const { locTheoCongTy, locTheoPage, locMangTheoPage } = require('../helpers/partnerScope');

const r = Router();
r.use(partnerAuth);

const TRAN_TRANG = 200;
const NHAN_HOP_LE = new Set(['rac', 'lanh', 'am', 'nong', 'da_chot']);
const KENH_HOP_LE = new Set(['messenger', 'lead_ads', 'comment', 'website', 'zalo', 'khac']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function loi(res, status, title, detail) {
  return res.status(status).type('application/problem+json').json({
    type: 'about:blank', title, status, detail,
  });
}

function bam(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Chuẩn hoá SĐT về E.164 rồi băm — đúng chuẩn Facebook Conversions API. */
function bamSdt(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 9) return null;
  let e164;
  if (d.startsWith('84')) e164 = `+${d}`;
  else if (d.startsWith('0')) e164 = `+84${d.slice(1)}`;
  else e164 = `+84${d}`;
  return crypto.createHash('sha256').update(e164).digest('hex');
}

function cheTen(ten) {
  const s = String(ten || '').trim();
  if (!s) return null;
  const phan = s.split(/\s+/);
  if (phan.length === 1) return `${phan[0][0]}***`;
  return phan.map((p, i) => (i === 0 || i === phan.length - 1 ? p : `${p[0]}.`)).join(' ');
}

function cheSdt(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 7) return null;
  return `${d.slice(0, 3)}***${d.slice(-4)}`;
}

/** Trả khối contact theo mức PII của khoá. */
function khoiContact(piiLevel, ten, sdt, email) {
  const base = {
    name_sha256: bam(ten),
    phone_sha256: bamSdt(sdt),
    email_sha256: bam(email),
  };
  if (piiLevel === 'full') return { ...base, name: ten || null, phone: sdt || null, email: email || null };
  if (piiLevel === 'masked') return { ...base, name: cheTen(ten), phone: cheSdt(sdt), email: null };
  return { ...base, name: null, phone: null, email: null };
}

function soNguyen(v, macDinh, toiDa) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return macDinh;
  return toiDa ? Math.min(n, toiDa) : n;
}

function ngayIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function giaiCursor(c) {
  if (!c) return null;
  try {
    const o = JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8'));
    return o?.t && o?.id ? o : null;
  } catch { return null; }
}

function taoCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ t: row.created_at, id: row.id }), 'utf8').toString('base64url');
}

/** Giới hạn theo công ty trong phạm vi khoá — phạm vi rỗng thì không trả gì. */
function locCongTy(q, req, cot = 'company_id') {
  return locTheoCongTy(q, req.partner?.scope, cot);
}

/** Tên page trong phạm vi khoá. */
function tenPage(req, pageId) {
  if (!pageId) return null;
  const p = (req.partner?.scope?.pages || []).find((x) => x.page_id === String(pageId));
  return p ? p.page_name : null;
}

/** Công ty sở hữu page. */
function congTyCuaPage(req, pageId) {
  if (!pageId) return null;
  const p = (req.partner?.scope?.pages || []).find((x) => x.page_id === String(pageId));
  return p ? p.company_id : null;
}

/** Page được yêu cầu có nằm trong phạm vi khoá không. */
function pageTrongPhamVi(req, pageId) {
  if (!pageId) return true;
  const sc = req.partner?.scope;
  return !!(sc && sc.page_ids && sc.page_ids.indexOf(String(pageId)) >= 0);
}

// ── GET /health ──────────────────────────────────────────────────────────────

r.get('/health', (req, res) => {
  res.json({
    ok: true,
    key: req.partner.ten,
    pii_level: req.partner.pii_level,
    scopes: req.partner.scopes,
    pham_vi: {
      he_sinh_thai: { id: req.partner.scope.tenant_id, ten: req.partner.scope.tenant_name },
      cong_ty: req.partner.scope.companies,
      page: req.partner.scope.pages.map((p) => ({ page_id: p.page_id, page_name: p.page_name, company_id: p.company_id })),
      khoa_page_cu_the: req.partner.scope.page_ids_khai_tay.length > 0,
    },
    limits: {
      requests_per_minute: TRAN_MOI_PHUT,
      pii_records_per_day: TRAN_PII_NGAY,
      pii_remaining_today: req.partner.con_lai_pii,
      max_page_size: TRAN_TRANG,
    },
    server_time: new Date().toISOString(),
  });
});

// ── GET /meta ────────────────────────────────────────────────────────────────

r.get('/meta', async (req, res) => {
  try {
    const sc = req.partner.scope;
    const pageTheoCT = new Map();
    for (const p of sc.pages) {
      const k = String(p.company_id || '');
      if (!pageTheoCT.has(k)) pageTheoCT.set(k, []);
      pageTheoCT.get(k).push({ page_id: p.page_id, page_name: p.page_name, is_active: p.is_active });
    }

    res.json({
      ecosystem: {
        id: sc.tenant_id,
        name: sc.tenant_name,
        companies: sc.companies.map((c) => ({
          id: c.id,
          name: c.name,
          pages: pageTheoCT.get(String(c.id)) || [],
        })),
      },
      channels: [...KENH_HOP_LE],
      score_meaning: 'Điểm đo ĐỘ ĐẦY ĐỦ THÔNG TIN và MỨC TƯƠNG TÁC của lead, '
        + 'KHÔNG phải xác suất chốt đơn. Đối chiếu trên dữ liệu lịch sử cho thấy điểm cao '
        + 'chưa tương quan với tỉ lệ thành đơn. Dùng để lọc lead rác, không dùng để dự báo doanh thu.',
      quality_labels: [
        { key: 'rac', range: '0–24', meaning: 'Không có liên hệ dùng được' },
        { key: 'lanh', range: '25–49', meaning: 'Có liên hệ, chưa tương tác' },
        { key: 'am', range: '50–74', meaning: 'Có trao đổi hai chiều' },
        { key: 'nong', range: '75–100', meaning: 'Đủ thông tin và tương tác nhiều' },
        { key: 'da_chot', range: '—', meaning: 'Đã chốt đơn (sự thật, không phải dự đoán)' },
      ],
      pii_level: req.partner.pii_level,
    });
  } catch (e) {
    loi(res, 500, 'Lỗi tải danh mục', e.message);
  }
});

// ── GET /leads ───────────────────────────────────────────────────────────────

r.get('/leads', async (req, res) => {
  try {
    const limit = soNguyen(req.query.limit, 50, TRAN_TRANG);
    const cur = giaiCursor(req.query.cursor);
    const tu = ngayIso(req.query.from);
    const den = ngayIso(req.query.to);
    const nhan = req.query.label ? String(req.query.label) : null;
    if (nhan && !NHAN_HOP_LE.has(nhan)) return loi(res, 400, 'Nhãn không hợp lệ', `label phải là một trong: ${[...NHAN_HOP_LE].join(', ')}`);
    const kenh = req.query.channel ? String(req.query.channel) : null;
    if (kenh && !KENH_HOP_LE.has(kenh)) return loi(res, 400, 'Kênh không hợp lệ', `channel phải là một trong: ${[...KENH_HOP_LE].join(', ')}`);

    const campaignId = req.query.campaign_id ? String(req.query.campaign_id) : null;
    const adId = req.query.ad_id ? String(req.query.ad_id) : null;
    const pageId = req.query.page_id ? String(req.query.page_id) : null;
    if (pageId && !pageTrongPhamVi(req, pageId)) {
      return loi(res, 403, 'Page ngoài phạm vi khoá', `Page ${pageId} không thuộc công ty nào khoá này được cấp.`);
    }

    // Lọc trước theo quy kết khi có điều kiện campaign/ad/kênh/page,
    // hoặc khi khoá bị ràng vào một số page cụ thể.
    const rangTheoPage = (req.partner.scope.page_ids_khai_tay || []).length > 0;
    let idTheoQuyKet = null;
    if (campaignId || adId || kenh || pageId || rangTheoPage) {
      let qa = supabase.from('lead_attribution').select('lead_id').not('lead_id', 'is', null).limit(5000);
      if (campaignId) qa = qa.eq('fb_campaign_id', campaignId);
      if (adId) qa = qa.eq('fb_ad_id', adId);
      if (kenh) qa = qa.eq('kenh', kenh);
      if (pageId) qa = qa.eq('fb_page_id', pageId);
      else qa = locTheoPage(qa, req.partner.scope);
      const { data } = await qa;
      idTheoQuyKet = (data || []).map((x) => x.lead_id);
      if (!idTheoQuyKet.length) return res.json({ data: [], next_cursor: null, meta: { returned: 0, pii: req.partner.pii_level } });
    }

    let q = supabase
      .from('crm_leads')
      .select('id, code, title, type, phone, customer_id, company_id, created_at, actual_close_date, estimated_value, stage_id')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    q = locCongTy(q, req);
    if (tu) q = q.gte('created_at', tu);
    if (den) q = q.lte('created_at', den);
    if (cur) q = q.lt('created_at', cur.t);
    if (idTheoQuyKet) q = q.in('id', idTheoQuyKet.slice(0, 5000));

    const { data: leads, error } = await q;
    if (error) throw new Error(error.message);

    let ds = leads || [];
    const con = ds.length > limit;
    if (con) ds = ds.slice(0, limit);
    if (!ds.length) return res.json({ data: [], next_cursor: null, meta: { returned: 0, pii: req.partner.pii_level } });

    const ids = ds.map((l) => l.id);
    const [diemRows, quyKetRows, khachRows, cotRows] = await Promise.all([
      supabase.from('lead_quality_scores').select('lead_id, diem, nhan, thanh_phan').in('lead_id', ids)
        .then((x) => x.data || [], () => []),
      supabase.from('lead_attribution')
        .select('lead_id, kenh, platform, fb_page_id, fb_ad_id, fb_adset_id, fb_campaign_id, fb_campaign_name, fb_ref, fb_source, utm_source, utm_medium, utm_campaign, gclid, fbclid, cham_dau_luc')
        .in('lead_id', ids).then((x) => x.data || [], () => []),
      supabase.from('customers').select('id, full_name, phone, email')
        .in('id', ds.map((l) => l.customer_id).filter(Boolean)).then((x) => x.data || [], () => []),
      supabase.from('crm_pipeline_stages').select('id, name')
        .in('id', ds.map((l) => l.stage_id).filter(Boolean)).then((x) => x.data || [], () => []),
    ]);

    const mDiem = new Map(diemRows.map((x) => [String(x.lead_id), x]));
    const mQK = new Map(quyKetRows.map((x) => [String(x.lead_id), x]));
    const mKhach = new Map(khachRows.map((x) => [String(x.id), x]));
    const mCot = new Map(cotRows.map((x) => [String(x.id), x.name]));

    const pii = req.partner.pii_level;
    const data = ds.map((l) => {
      const d = mDiem.get(String(l.id));
      const a = mQK.get(String(l.id));
      const k = mKhach.get(String(l.customer_id));
      return {
        id: l.id,
        code: l.code || null,
        created_at: l.created_at,
        channel: a?.kenh || null,
        attribution: a ? {
          platform: a.platform || null,
          page_id: a.fb_page_id || null,
          page_name: tenPage(req, a.fb_page_id),
          company_id: congTyCuaPage(req, a.fb_page_id),
          campaign_id: a.fb_campaign_id || null,
          campaign_name: a.fb_campaign_name || null,
          adset_id: a.fb_adset_id || null,
          ad_id: a.fb_ad_id || null,
          ref: a.fb_ref || null,
          source: a.fb_source || null,
          utm: { source: a.utm_source || null, medium: a.utm_medium || null, campaign: a.utm_campaign || null },
          gclid: a.gclid || null,
          fbclid: a.fbclid || null,
          first_touch_at: a.cham_dau_luc || null,
        } : null,
        quality: d ? { score: d.diem, label: d.nhan, components: d.thanh_phan || {} } : null,
        funnel: {
          stage: mCot.get(String(l.stage_id)) || null,
          is_deal: l.type === 'deal',
          closed_at: l.actual_close_date || null,
          value: l.estimated_value ?? null,
        },
        contact: khoiContact(pii, k?.full_name || l.title, l.phone || k?.phone, k?.email),
      };
    });

    res.locals.soBanGhi = data.length;
    res.json({
      data,
      next_cursor: con ? taoCursor(ds[ds.length - 1]) : null,
      meta: { returned: data.length, pii },
    });
  } catch (e) {
    console.error('[partner/leads]', e);
    loi(res, 500, 'Lỗi tải danh sách lead', e.message);
  }
});

// ── GET /leads/:id ───────────────────────────────────────────────────────────

r.get('/leads/:id', async (req, res) => {
  try {
    let q = supabase.from('crm_leads')
      .select('id, code, title, type, phone, customer_id, company_id, created_at, actual_close_date, estimated_value, stage_id, description')
      .eq('id', req.params.id);
    q = locCongTy(q, req);
    const { data: l } = await q.maybeSingle();
    if (!l) return loi(res, 404, 'Không tìm thấy lead', 'Lead không tồn tại hoặc ngoài phạm vi khoá.');

    const [d, a, k] = await Promise.all([
      supabase.from('lead_quality_scores').select('diem, nhan, thanh_phan').eq('lead_id', l.id).maybeSingle().then((x) => x.data, () => null),
      supabase.from('lead_attribution').select('*').eq('lead_id', l.id).maybeSingle().then((x) => x.data, () => null),
      l.customer_id
        ? supabase.from('customers').select('full_name, phone, email').eq('id', l.customer_id).maybeSingle().then((x) => x.data, () => null)
        : null,
    ]);

    res.locals.soBanGhi = 1;
    res.json({
      id: l.id,
      code: l.code || null,
      created_at: l.created_at,
      channel: a?.kenh || null,
      attribution: a ? {
        platform: a.platform, page_id: a.fb_page_id, campaign_id: a.fb_campaign_id,
        campaign_name: a.fb_campaign_name, adset_id: a.fb_adset_id, ad_id: a.fb_ad_id,
        ref: a.fb_ref, source: a.fb_source, form_id: a.fb_form_id,
        utm: { source: a.utm_source, medium: a.utm_medium, campaign: a.utm_campaign, content: a.utm_content, term: a.utm_term },
        gclid: a.gclid, fbclid: a.fbclid, landing_url: a.landing_url, first_touch_at: a.cham_dau_luc,
      } : null,
      quality: d ? { score: d.diem, label: d.nhan, components: d.thanh_phan || {} } : null,
      funnel: { is_deal: l.type === 'deal', closed_at: l.actual_close_date, value: l.estimated_value ?? null },
      contact: khoiContact(req.partner.pii_level, k?.full_name || l.title, l.phone || k?.phone, k?.email),
    });
  } catch (e) {
    loi(res, 500, 'Lỗi tải lead', e.message);
  }
});

// ── Tổng hợp campaign / ad ───────────────────────────────────────────────────

async function tongHop(req, { theoAd = false, theoPage = false, campaignId = null } = {}) {
  const tu = ngayIso(req.query.from);
  const den = ngayIso(req.query.to);
  const pageId = req.query.page_id ? String(req.query.page_id) : null;

  let qa = supabase.from('lead_attribution')
    .select('lead_id, fb_page_id, fb_campaign_id, fb_campaign_name, fb_adset_id, fb_ad_id, fb_ad_title, kenh, cham_dau_luc')
    .not('lead_id', 'is', null)
    .limit(20000);
  if (campaignId) qa = qa.eq('fb_campaign_id', campaignId);
  if (pageId) qa = qa.eq('fb_page_id', pageId);
  else qa = locTheoPage(qa, req.partner.scope);
  if (tu) qa = qa.gte('cham_dau_luc', tu);
  if (den) qa = qa.lte('cham_dau_luc', den);
  const { data: qk } = await qa;
  const rows = locMangTheoPage(qk || [], req.partner.scope);
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((x) => String(x.lead_id)))];
  const [leadRows, diemRows] = await Promise.all([
    supabase.from('crm_leads').select('id, type, actual_close_date, estimated_value, company_id')
      .in('id', ids.slice(0, 20000)).then((x) => x.data || [], () => []),
    supabase.from('lead_quality_scores').select('lead_id, diem, nhan')
      .in('lead_id', ids.slice(0, 20000)).then((x) => x.data || [], () => []),
  ]);

  const dsCongTy = req.partner?.scope?.company_ids || [];
  const mLead = new Map(leadRows
    .filter((l) => dsCongTy.includes(String(l.company_id)))
    .map((l) => [String(l.id), l]));
  const mDiem = new Map(diemRows.map((x) => [String(x.lead_id), x]));

  const gom = new Map();
  for (const a of rows) {
    const l = mLead.get(String(a.lead_id));
    if (!l) continue;
    let khoa;
    if (theoPage) khoa = String(a.fb_page_id || 'khong-ro');
    else if (theoAd) khoa = String(a.fb_ad_id || 'khong-ro');
    else khoa = String(a.fb_campaign_id || 'khong-ro');
    if (!gom.has(khoa)) {
      gom.set(khoa, {
        page_id: a.fb_page_id || null,
        page_name: tenPage(req, a.fb_page_id),
        company_id: congTyCuaPage(req, a.fb_page_id),
        campaign_id: theoPage ? undefined : a.fb_campaign_id || null,
        campaign_name: theoPage ? undefined : a.fb_campaign_name || null,
        adset_id: theoAd ? a.fb_adset_id || null : undefined,
        ad_id: theoAd ? a.fb_ad_id || null : undefined,
        ad_title: theoAd ? a.fb_ad_title || null : undefined,
        leads: 0,
        by_label: { rac: 0, lanh: 0, am: 0, nong: 0, da_chot: 0 },
        score_sum: 0,
        score_n: 0,
        deals: 0,
        closed: 0,
        revenue: 0,
      });
    }
    const g = gom.get(khoa);
    g.leads += 1;
    const d = mDiem.get(String(a.lead_id));
    if (d) {
      g.by_label[d.nhan] = (g.by_label[d.nhan] || 0) + 1;
      g.score_sum += Number(d.diem) || 0;
      g.score_n += 1;
    }
    if (l.type === 'deal') g.deals += 1;
    if (l.actual_close_date) {
      g.closed += 1;
      g.revenue += Number(l.estimated_value) || 0;
    }
  }

  return [...gom.values()].map((g) => {
    const chatLuong = (g.by_label.am || 0) + (g.by_label.nong || 0) + (g.by_label.da_chot || 0);
    return {
      ...g,
      avg_score: g.score_n ? Math.round(g.score_sum / g.score_n) : null,
      quality_leads: chatLuong,
      junk_rate: g.leads ? Math.round(((g.by_label.rac || 0) / g.leads) * 100) : 0,
      close_rate: g.leads ? Math.round((g.closed / g.leads) * 100) : 0,
      // Chi tiêu chưa nối Marketing API — để null thay vì đoán.
      spend: null,
      cost_per_lead: null,
      roas: null,
      score_sum: undefined,
      score_n: undefined,
    };
  }).sort((a, b) => b.leads - a.leads);
}

r.get('/pages', async (req, res) => {
  try {
    const ds = await tongHop(req, { theoPage: true });
    const trongPhamVi = req.partner.scope.pages;
    const coSo = new Map(ds.map((g) => [String(g.page_id || ''), g]));
    const data = trongPhamVi.map((p) => {
      const g = coSo.get(p.page_id);
      return {
        page_id: p.page_id,
        page_name: p.page_name,
        company_id: p.company_id,
        company_name: (req.partner.scope.companies.find((c) => c.id === p.company_id) || {}).name || null,
        is_active: p.is_active,
        leads: g ? g.leads : 0,
        by_label: g ? g.by_label : { rac: 0, lanh: 0, am: 0, nong: 0, da_chot: 0 },
        quality_leads: g ? g.quality_leads : 0,
        quality_rate: g ? g.quality_rate : 0,
        closed: g ? g.closed : 0,
        revenue: g ? g.revenue : 0,
        avg_score: g ? g.avg_score : null,
      };
    }).sort((a, b) => b.leads - a.leads);
    res.locals.soBanGhi = data.length;
    res.json({
      data,
      meta: {
        returned: data.length,
        ecosystem: { id: req.partner.scope.tenant_id, name: req.partner.scope.tenant_name },
      },
    });
  } catch (e) {
    console.error('[partner/pages]', e);
    loi(res, 500, 'Lỗi tổng hợp theo page', e.message);
  }
});

r.get('/campaigns', async (req, res) => {
  try {
    const ds = await tongHop(req, { theoAd: false });
    res.locals.soBanGhi = ds.length;
    res.json({
      data: ds,
      meta: {
        returned: ds.length,
        spend_available: false,
        note: 'Chi tiêu và ROAS trả null cho tới khi nối Marketing API (giai đoạn 5).',
      },
    });
  } catch (e) {
    console.error('[partner/campaigns]', e);
    loi(res, 500, 'Lỗi tổng hợp campaign', e.message);
  }
});

r.get('/campaigns/:id/ads', async (req, res) => {
  try {
    const ds = await tongHop(req, { theoAd: true, campaignId: String(req.params.id) });
    res.locals.soBanGhi = ds.length;
    res.json({ data: ds, meta: { returned: ds.length, campaign_id: req.params.id } });
  } catch (e) {
    loi(res, 500, 'Lỗi bóc quảng cáo', e.message);
  }
});

// ── GET /conversions ─────────────────────────────────────────────────────────

r.get('/conversions', async (req, res) => {
  try {
    const limit = soNguyen(req.query.limit, 100, TRAN_TRANG);
    const tu = ngayIso(req.query.from);
    const den = ngayIso(req.query.to);

    let q = supabase.from('crm_leads')
      .select('id, code, customer_id, phone, company_id, actual_close_date, estimated_value')
      .eq('type', 'deal')
      .not('actual_close_date', 'is', null)
      .order('actual_close_date', { ascending: false })
      .limit(limit);
    q = locCongTy(q, req);
    if (tu) q = q.gte('actual_close_date', tu);
    if (den) q = q.lte('actual_close_date', den);

    const { data: deals, error } = await q;
    if (error) throw new Error(error.message);
    let ds = deals || [];
    if (!ds.length) return res.json({ data: [], meta: { returned: 0 } });

    const ids = ds.map((d) => d.id);
    const [qkRows, khachRows] = await Promise.all([
      supabase.from('lead_attribution').select('lead_id, fb_page_id, fb_campaign_id, fb_campaign_name, fb_ad_id, kenh')
        .in('lead_id', ids).then((x) => x.data || [], () => []),
      supabase.from('customers').select('id, full_name, phone, email')
        .in('id', ds.map((d) => d.customer_id).filter(Boolean)).then((x) => x.data || [], () => []),
    ]);
    const mQK = new Map(qkRows.map((x) => [String(x.lead_id), x]));
    const mKhach = new Map(khachRows.map((x) => [String(x.id), x]));

    // Khoá ràng vào page cụ thể: chỉ trả đơn thuộc page đó.
    const dsPageRang = req.partner.scope.page_ids_khai_tay || [];
    if (dsPageRang.length) {
      const bo = new Set(dsPageRang);
      ds = ds.filter((d) => bo.has(String(mQK.get(String(d.id))?.fb_page_id || '')));
    }

    const data = ds.map((d) => {
      const a = mQK.get(String(d.id));
      const k = mKhach.get(String(d.customer_id));
      return {
        lead_id: d.id,
        code: d.code || null,
        event_name: 'Purchase',
        closed_at: d.actual_close_date,
        value: Number(d.estimated_value) || 0,
        currency: 'VND',
        channel: a?.kenh || null,
        page_id: a?.fb_page_id || null,
        page_name: tenPage(req, a?.fb_page_id),
        campaign_id: a?.fb_campaign_id || null,
        campaign_name: a?.fb_campaign_name || null,
        ad_id: a?.fb_ad_id || null,
        contact: khoiContact(req.partner.pii_level, k?.full_name, d.phone || k?.phone, k?.email),
      };
    });

    res.locals.soBanGhi = data.length;
    res.json({ data, meta: { returned: data.length, pii: req.partner.pii_level } });
  } catch (e) {
    console.error('[partner/conversions]', e);
    loi(res, 500, 'Lỗi tải chuyển đổi', e.message);
  }
});

r.use((req, res) => loi(res, 404, 'Không có đường dẫn này', `${req.method} ${req.path} không tồn tại trên /api/partner/v1.`));

module.exports = r;
