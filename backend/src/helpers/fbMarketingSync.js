/**
 * Đồng bộ Facebook Marketing API.
 *
 * Kéo về hai thứ mà webhook Messenger KHÔNG BAO GIỜ gửi:
 *   1. TÊN chiến dịch / nhóm quảng cáo / quảng cáo — webhook chỉ có ad_id trần.
 *   2. CHI TIÊU theo từng ngày — thứ duy nhất cho phép nói về giá mỗi lead và ROAS.
 *
 * Ba nguyên tắc:
 *   - Tên do người đặt tay (nguon='thu_cong') KHÔNG bị ghi đè. Người biết rõ hơn API.
 *   - Không bao giờ in giá trị token ra log.
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

function ngayVietNam(t) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(t));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function maLoiMeta(code, status) {
  if (Number(code) === 190 || status === 401) return 'META_AUTH';
  if ([10, 200].includes(Number(code)) || status === 403) return 'META_PERMISSION';
  if ([4, 17, 32, 613].includes(Number(code)) || status === 429) return 'META_RATE_LIMIT';
  return 'META_ERROR';
}

function loiDaLoc(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function gioiHanTrang() {
  const n = Number(process.env.FB_MARKETING_MAX_PAGES);
  return Number.isSafeInteger(n) && n > 0 ? n : TOI_DA_TRANG;
}

function soKhongAm(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Gọi Graph API. Token đi trong header Authorization, không nhét vào URL. */
async function goiGraph(url, token) {
  const ctl = new AbortController();
  const hen = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    let resp;
    try {
      resp = await fetch(url, {
        signal: ctl.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw loiDaLoc('NETWORK');
    }
    const js = await resp.json().catch(() => null);
    if (!resp.ok || js?.error) {
      throw loiDaLoc(maLoiMeta(js?.error?.code, resp.status));
    }
    return js;
  } finally {
    clearTimeout(hen);
  }
}

/** Đi hết các trang phân trang của Graph API. */
async function keoTatCaTrang(urlDau, token) {
  const rows = [];
  let url = urlDau;
  let pages = 0;
  const limit = gioiHanTrang();
  while (url && pages < limit) {
    const js = await goiGraph(url, token);
    if (!Array.isArray(js?.data)) throw loiDaLoc('META_ERROR');
    pages += 1;
    rows.push(...js.data);
    url = js?.paging?.next || null;
  }
  return { rows, pages, truncated: !!url };
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
    const currency = typeof js?.currency === 'string' ? js.currency.trim() : '';
    if (currency) return currency;
  } catch {
    // Lỗi đọc tiền tệ không được phép biến thành số tiền VND.
  }
  throw loiDaLoc('CURRENCY_UNKNOWN');
}

/** Kéo tên chiến dịch / nhóm / quảng cáo về danh mục. */
async function keoTenQuangCao(tk) {
  const fields = 'id,name,status,adset{id,name},campaign{id,name,objective}';
  const url = `${GRAPH}/${tk.ad_account_id}/ads?fields=${encodeURIComponent(fields)}&limit=200`;
  const { rows: ads, pages, truncated } = await keoTatCaTrang(url, tk.access_token);
  if (!ads.length) return { so_ad: 0, giu_ten_tay: 0, pages, truncated };

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
  return { so_ad: rows.length, giu_ten_tay: giuTay, pages, truncated };
}

/** Kéo chi tiêu theo từng quảng cáo từng ngày. */
async function keoChiTieu(tk, { since, until }) {
  const fields = 'ad_id,campaign_id,adset_id,spend,impressions,clicks';
  const khoang = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${GRAPH}/${tk.ad_account_id}/insights?level=ad&time_increment=1&limit=500`
    + `&fields=${encodeURIComponent(fields)}&time_range=${khoang}`;
  const { rows, pages, truncated } = await keoTatCaTrang(url, tk.access_token);

  const bayGio = new Date().toISOString();
  const banGhi = [];
  let invalid_rows = 0;
  let skipped_rows = 0;
  for (const r of rows) {
    if (!r?.ad_id || !r?.date_start) { skipped_rows += 1; continue; }
    const spend = soKhongAm(r.spend);
    // Meta may omit count fields when they are zero; only a present, malformed count is invalid.
    const impressions = r.impressions == null ? 0 : soKhongAm(r.impressions);
    const clicks = r.clicks == null ? 0 : soKhongAm(r.clicks);
    if (spend === null || !Number.isSafeInteger(impressions) || !Number.isSafeInteger(clicks)) {
      invalid_rows += 1;
      continue;
    }
    banGhi.push({
      ad_id: String(r.ad_id),
      ngay: String(r.date_start),
      ad_account_id: tk.ad_account_id,
      campaign_id: r.campaign_id || null,
      adset_id: r.adset_id || null,
      chi_tieu: spend,
      hien_thi: impressions,
      nhap: clicks,
      tien_te: tk._tien_te,
      cap_nhat_luc: bayGio,
    });
  }

  for (let i = 0; i < banGhi.length; i += 300) {
    const { error } = await supabase.from('fb_ad_spend_daily')
      .upsert(banGhi.slice(i, i + 300), { onConflict: 'ad_id,ngay' });
    if (error) throw new Error(`Lưu chi tiêu: ${error.message}`);
  }
  const tong = banGhi.reduce((s, x) => s + x.chi_tieu, 0);
  return {
    so_dong_chi_tieu: banGhi.length, tong_chi_tieu: Math.round(tong),
    rows_written: banGhi.length, invalid_rows, skipped_rows, pages, truncated,
  };
}

/** Đồng bộ một tài khoản. Không ném lỗi ra ngoài — ghi lại vào ket_qua_cuoi. */
async function dongBoMot(tk, { ngay = 30 } = {}) {
  const batDau = Date.now();
  const until = ngayVietNam(batDau);
  const since = ngayVietNam(batDau - (Math.max(1, ngay) - 1) * 86400000);
  const kq = {
    ad_account_id: tk.ad_account_id, ok: false, complete: false, currency: null,
    since, until, pages: 0, rows_written: 0, invalid_rows: 0, skipped_rows: 0,
    truncated: false, error_code: null,
  };
  try {
    if (!tk.access_token) throw loiDaLoc('TOKEN_MISSING');
    tk._tien_te = await layTienTe(tk);
    kq.currency = tk._tien_te;
    kq.currency_mismatch = tk._tien_te !== 'VND';
    const ten = await keoTenQuangCao(tk);
    kq.pages += ten.pages;
    kq.truncated = ten.truncated;
    const chi = await keoChiTieu(tk, { since, until });
    Object.assign(kq, ten, chi, {
      ok: true,
      tien_te: tk._tien_te,
      giay: Math.round((Date.now() - batDau) / 1000),
    });
    kq.pages = ten.pages + chi.pages;
    kq.truncated = ten.truncated || chi.truncated;
    kq.complete = !kq.truncated && !kq.invalid_rows && !kq.skipped_rows
      && !kq.currency_mismatch;
    if (kq.truncated) console.warn(`[dong-bo-qc] ${tk.ad_account_id}: TRUNCATED (${kq.pages} trang)`);
    if (kq.invalid_rows || kq.skipped_rows) {
      console.warn(`[dong-bo-qc] ${tk.ad_account_id}: INVALID_ROWS=${kq.invalid_rows}, SKIPPED_ROWS=${kq.skipped_rows}`);
    }
  } catch (e) {
    kq.error_code = [
      'TOKEN_MISSING', 'CURRENCY_UNKNOWN', 'META_AUTH', 'META_PERMISSION',
      'META_RATE_LIMIT', 'META_ERROR', 'NETWORK',
    ].includes(e.code) ? e.code : 'SYNC_ERROR';
    kq.loi = kq.error_code;
    console.warn(`[dong-bo-qc] ${tk.ad_account_id}: ${kq.error_code}`);
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
