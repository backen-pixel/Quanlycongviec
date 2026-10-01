/**
 * Đồng bộ Facebook Marketing API.
 *
 * Kéo về hai thứ mà webhook Messenger KHÔNG BAO GIỜ gửi:
 *   1. TÊN chiến dịch / nhóm quảng cáo / quảng cáo — webhook chỉ có ad_id trần.
 *   2. CHI TIÊU theo từng ngày — thứ duy nhất cho phép nói về giá mỗi lead và ROAS.
 *
 * Ba nguyên tắc:
 *   - Tên do người đặt tay (nguon='thu_cong') KHÔNG bị ghi đè. Người biết rõ hơn API.
 *   - Không bao giờ in giá trị token ra log, chỉ in độ dài.
 *   - Lỗi của một tài khoản không làm hỏng các tài khoản còn lại.
 */
const { supabase } = require('../config/supabase');

const GRAPH = 'https://graph.facebook.com/v22.0';
const TIMEOUT_MS = 20000;
const TOI_DA_TRANG = 50;

function chuanHoaActId(x) {
  const s = String(x || '').trim();
  if (!s) return null;
  return s.startsWith('act_') ? s : `act_${s.replace(/^act/i, '')}`;
}

function ngayISO(t) {
  return new Date(t).toISOString().slice(0, 10);
}

/** Gọi Graph API. Token đi trong header Authorization, không nhét vào URL. */
async function goiGraph(url, token) {
  const ctl = new AbortController();
  const hen = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    const js = await resp.json().catch(() => null);
    if (!resp.ok || js?.error) {
      const e = js?.error || {};
      const ma = e.code ? ` (code ${e.code})` : '';
      throw new Error(`FB ${resp.status}: ${e.message || 'không rõ lỗi'}${ma}`);
    }
    return js;
  } finally {
    clearTimeout(hen);
  }
}

/** Đi hết các trang phân trang của Graph API. */
async function keoTatCaTrang(urlDau, token) {
  const ra = [];
  let url = urlDau;
  for (let i = 0; i < TOI_DA_TRANG && url; i += 1) {
    const js = await goiGraph(url, token);
    if (Array.isArray(js?.data)) ra.push(...js.data);
    url = js?.paging?.next || null;
  }
  return ra;
}

/** Kiểm tra một cặp (ad account, token) có dùng được không. */
async function kiemTraKetNoi(adAccountId, token) {
  const id = chuanHoaActId(adAccountId);
  if (!id) throw new Error('Thiếu Ad Account ID');
  if (!token) throw new Error('Thiếu access token');
  const js = await goiGraph(`${GRAPH}/${id}?fields=name,currency,account_status`, token);
  return {
    ad_account_id: id,
    ten: js?.name || null,
    tien_te: js?.currency || null,
    trang_thai_tk: js?.account_status ?? null,
  };
}

async function layTienTe(tk) {
  try {
    const js = await goiGraph(`${GRAPH}/${tk.ad_account_id}?fields=currency`, tk.access_token);
    return js?.currency || 'VND';
  } catch {
    return 'VND';
  }
}

/** Kéo tên chiến dịch / nhóm / quảng cáo về danh mục. */
async function keoTenQuangCao(tk) {
  const fields = 'id,name,status,adset{id,name},campaign{id,name,objective}';
  const url = `${GRAPH}/${tk.ad_account_id}/ads?fields=${encodeURIComponent(fields)}&limit=200`;
  const ads = await keoTatCaTrang(url, tk.access_token);
  if (!ads.length) return { so_ad: 0, giu_ten_tay: 0 };

  // Đọc trước những dòng đã có để biết cái nào người đã đặt tay.
  const ids = ads.map((a) => String(a.id));
  const cu = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from('fb_ad_catalog')
      .select('ad_id, nguon, campaign_name')
      .in('ad_id', ids.slice(i, i + 300));
    if (Array.isArray(data)) cu.push(...data);
  }
  const mCu = new Map(cu.map((x) => [String(x.ad_id), x]));

  const bayGio = new Date().toISOString();
  let giuTay = 0;
  const rows = ads.map((a) => {
    const truoc = mCu.get(String(a.id));
    const datTay = !!(truoc && truoc.nguon === 'thu_cong' && truoc.campaign_name);
    if (datTay) giuTay += 1;
    return {
      ad_id: String(a.id),
      ad_name: a.name || null,
      adset_id: a.adset?.id || null,
      adset_name: a.adset?.name || null,
      campaign_id: a.campaign?.id || null,
      campaign_name: datTay ? truoc.campaign_name : (a.campaign?.name || null),
      muc_tieu: a.campaign?.objective || null,
      trang_thai: a.status || null,
      ad_account_id: tk.ad_account_id,
      nguon: datTay ? 'thu_cong' : 'marketing_api',
      dong_bo_luc: bayGio,
      updated_at: bayGio,
    };
  });

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('fb_ad_catalog')
      .upsert(rows.slice(i, i + 200), { onConflict: 'ad_id' });
    if (error) throw new Error(`Lưu danh mục: ${error.message}`);
  }
  return { so_ad: rows.length, giu_ten_tay: giuTay };
}

/** Kéo chi tiêu theo từng quảng cáo từng ngày. */
async function keoChiTieu(tk, ngay) {
  const den = ngayISO(Date.now());
  const tu = ngayISO(Date.now() - (Math.max(1, ngay) - 1) * 86400000);
  const fields = 'ad_id,campaign_id,adset_id,spend,impressions,clicks';
  const khoang = encodeURIComponent(JSON.stringify({ since: tu, until: den }));
  const url = `${GRAPH}/${tk.ad_account_id}/insights?level=ad&time_increment=1&limit=500`
    + `&fields=${encodeURIComponent(fields)}&time_range=${khoang}`;
  const rows = await keoTatCaTrang(url, tk.access_token);
  if (!rows.length) return { so_dong_chi_tieu: 0, tong_chi_tieu: 0 };

  const bayGio = new Date().toISOString();
  const banGhi = rows
    .filter((r) => r.ad_id && r.date_start)
    .map((r) => ({
      ad_id: String(r.ad_id),
      ngay: String(r.date_start),
      ad_account_id: tk.ad_account_id,
      campaign_id: r.campaign_id || null,
      adset_id: r.adset_id || null,
      chi_tieu: Number(r.spend) || 0,
      hien_thi: Number(r.impressions) || 0,
      nhap: Number(r.clicks) || 0,
      tien_te: tk._tien_te || 'VND',
      cap_nhat_luc: bayGio,
    }));

  for (let i = 0; i < banGhi.length; i += 300) {
    const { error } = await supabase.from('fb_ad_spend_daily')
      .upsert(banGhi.slice(i, i + 300), { onConflict: 'ad_id,ngay' });
    if (error) throw new Error(`Lưu chi tiêu: ${error.message}`);
  }
  const tong = banGhi.reduce((s, x) => s + x.chi_tieu, 0);
  return { so_dong_chi_tieu: banGhi.length, tong_chi_tieu: Math.round(tong) };
}

/** Đồng bộ một tài khoản. Không ném lỗi ra ngoài — ghi lại vào ket_qua_cuoi. */
async function dongBoMot(tk, { ngay = 30 } = {}) {
  const batDau = Date.now();
  const kq = { ad_account_id: tk.ad_account_id, ok: false };
  try {
    if (!tk.access_token) throw new Error('Chưa có access token');
    tk._tien_te = await layTienTe(tk);
    const ten = await keoTenQuangCao(tk);
    const chi = await keoChiTieu(tk, ngay);
    Object.assign(kq, ten, chi, {
      ok: true,
      tien_te: tk._tien_te,
      giay: Math.round((Date.now() - batDau) / 1000),
    });
  } catch (e) {
    kq.loi = e.message;
    const doDai = String(tk.access_token || '').length;
    console.warn(`[dong-bo-qc] ${tk.ad_account_id}: ${e.message} (token ${doDai} ký tự)`);
  }
  try {
    await supabase.from('fb_ad_accounts').update({
      lan_dong_bo_cuoi: new Date().toISOString(),
      ket_qua_cuoi: kq,
      updated_at: new Date().toISOString(),
    }).eq('ad_account_id', tk.ad_account_id);
  } catch { /* không để việc ghi nhật ký làm hỏng đồng bộ */ }
  return kq;
}

/** Đồng bộ toàn bộ tài khoản đang bật. */
async function dongBoTatCa({ ngay = 30 } = {}) {
  const { data, error } = await supabase.from('fb_ad_accounts').select('*').eq('bat', true);
  if (error) throw new Error(error.message);
  const ds = data || [];
  if (!ds.length) {
    return { so_tai_khoan: 0, ket_qua: [], ghi_chu: 'Chưa khai báo tài khoản quảng cáo nào.' };
  }
  const ket = [];
  for (const tk of ds) {
    ket.push(await dongBoMot(tk, { ngay }));
  }
  return { so_tai_khoan: ds.length, ket_qua: ket };
}

/** Đã nối Marketing API chưa — dùng cho trang hiển thị trạng thái. */
async function daCauHinh() {
  const { data } = await supabase.from('fb_ad_accounts')
    .select('ad_account_id, ten, bat, lan_dong_bo_cuoi, ket_qua_cuoi, access_token');
  const ds = data || [];
  return {
    da_noi: ds.some((x) => x.bat && x.access_token),
    tai_khoan: ds.map((x) => ({
      ad_account_id: x.ad_account_id,
      ten: x.ten,
      bat: x.bat,
      co_token: !!x.access_token,
      do_dai_token: String(x.access_token || '').length,
      lan_dong_bo_cuoi: x.lan_dong_bo_cuoi,
      ket_qua_cuoi: x.ket_qua_cuoi,
    })),
  };
}

module.exports = { dongBoTatCa, dongBoMot, kiemTraKetNoi, daCauHinh, chuanHoaActId };
