/**
 * Điều khiển các trường webhook Facebook của từng Page.
 *
 * Trước đây việc bật/tắt trường làm tay trong App Dashboard và hệ thống không đọc
 * lại, nên không ai biết chắc page nào đang nhận gì. File này đọc trạng thái THẬT
 * từ Facebook và cho bật/tắt ngay trong CRM.
 *
 * Không bao giờ in giá trị token — chỉ in độ dài khi báo lỗi.
 */
const { supabase } = require('../config/supabase');

const GRAPH = 'https://graph.facebook.com/v22.0';
const TIMEOUT_MS = 15000;

/**
 * Các trường hệ thống này biết xử lý. Trường nào không có ở đây thì bật cũng vô ích
 * vì webhook về sẽ không ai đọc.
 */
const TRUONG = [
  {
    ma: 'messages',
    ten: 'Tin nhắn',
    quyen: 'pages_messaging',
    giai_thich: 'Nội dung tin khách nhắn, kèm ảnh/video/file. Đây là trường xương sống.',
    nen_bat: true,
  },
  {
    ma: 'messaging_postbacks',
    ten: 'Bấm nút trong tin nhắn',
    quyen: 'pages_messaging',
    giai_thich: 'Khách bấm nút Bắt đầu hoặc nút trong kịch bản trả lời.',
    nen_bat: true,
  },
  {
    ma: 'messaging_referrals',
    ten: 'Nguồn quảng cáo',
    quyen: 'pages_messaging',
    giai_thich: 'Mang ad_id, tên quảng cáo, post_id và ảnh/video của mẫu. '
      + 'Tắt trường này là mất toàn bộ trang Hiệu quả quảng cáo.',
    nen_bat: true,
  },
  {
    ma: 'message_reactions',
    ten: 'Thả cảm xúc',
    quyen: 'pages_messaging',
    giai_thich: 'Khách thả tim/like vào tin nhắn. Tín hiệu tương tác, không tạo lead.',
    nen_bat: false,
  },
  {
    ma: 'feed',
    ten: 'Bình luận bài viết',
    quyen: 'pages_read_engagement + pages_manage_engagement',
    giai_thich: 'Bình luận dưới bài viết và bài quảng cáo. Nối được với post_id của quảng cáo.',
    nen_bat: true,
  },
  {
    ma: 'leadgen',
    ten: 'Form Lead Ads',
    quyen: 'leads_retrieval',
    giai_thich: 'Đường DUY NHẤT lấy được số điện thoại và email do Facebook xác thực, '
      + 'thay vì bóc từ chữ khách gõ.',
    nen_bat: true,
  },
];

/** Trường về rồi mà hệ thống không có code xử lý — bật chỉ tốn lưu lượng. */
const TRUONG_VO_ICH = ['message_deliveries', 'message_echoes', 'messaging_seen'];

async function goiGraph(url, token, init = {}) {
  const ctl = new AbortController();
  const hen = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
    const js = await resp.json().catch(() => null);
    if (!resp.ok || js?.error) {
      const e = js?.error || {};
      const ma = e.code ? ` (code ${e.code})` : '';
      const err = new Error(`FB ${resp.status}: ${e.message || 'không rõ lỗi'}${ma}`);
      err.fbCode = e.code;
      throw err;
    }
    return js;
  } finally {
    clearTimeout(hen);
  }
}

/** Đọc trạng thái subscribe THẬT của một page. Lỗi quyền cũng là thông tin hữu ích. */
async function docTrangThai(page) {
  const pid = String(page?.page_id || '').trim();
  if (!pid) return { page_id: null, ok: false, loi: 'Thiếu page_id' };
  if (!page?.access_token) {
    return { page_id: pid, ok: false, loi: 'Page chưa có access token' };
  }
  try {
    const js = await goiGraph(
      `${GRAPH}/${pid}/subscribed_apps?fields=subscribed_fields`,
      page.access_token,
    );
    // Facebook trả mảng app; chỉ có app của mình nên gộp hết lại.
    const dangBat = new Set();
    for (const app of js?.data || []) {
      for (const f of app.subscribed_fields || []) dangBat.add(String(f));
    }
    return {
      page_id: pid,
      ok: true,
      dang_bat: [...dangBat].sort(),
      thua: [...dangBat].filter((f) => TRUONG_VO_ICH.includes(f)),
      thieu: TRUONG.filter((t) => t.nen_bat && !dangBat.has(t.ma)).map((t) => t.ma),
    };
  } catch (e) {
    return {
      page_id: pid,
      ok: false,
      loi: e.message,
      // code 200/10 gần như luôn là thiếu quyền chứ không phải sai page
      thieu_quyen: e.fbCode === 200 || e.fbCode === 10,
    };
  }
}

/**
 * Đặt lại danh sách trường cho một page.
 * Facebook GHI ĐÈ toàn bộ danh sách, nên phải gửi đủ cả những trường đang bật
 * mà mình muốn giữ — gửi thiếu là tắt mất.
 */
async function datTruong(page, danhSach) {
  const pid = String(page?.page_id || '').trim();
  if (!pid) throw new Error('Thiếu page_id');
  if (!page?.access_token) throw new Error('Page chưa có access token');

  const hopLe = [...new Set((danhSach || []).map(String))]
    .filter((f) => TRUONG.some((t) => t.ma === f));
  if (!hopLe.length) throw new Error('Danh sách trường rỗng hoặc không có trường nào hệ thống xử lý được');

  const body = new URLSearchParams({ subscribed_fields: hopLe.join(',') });
  await goiGraph(`${GRAPH}/${pid}/subscribed_apps`, page.access_token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { page_id: pid, da_dat: hopLe };
}

/** Đếm gói webhook 7 ngày qua, phân theo loại — để thấy trường nào bật mà không có dữ liệu. */
async function demGoiGanDay(ngay = 7) {
  const tu = new Date(Date.now() - ngay * 86400000).toISOString();
  const { data } = await supabase
    .from('facebook_webhook_logs')
    .select('page_id, payload')
    .gte('processed_at', tu)
    .limit(20000)
    .then((x) => x, () => ({ data: [] }));

  const m = new Map();
  for (const r of data || []) {
    const k = String(r.page_id || '');
    if (!m.has(k)) {
      m.set(k, { tong: 0, messages: 0, messaging_referrals: 0, message_reactions: 0, feed: 0, leadgen: 0 });
    }
    const o = m.get(k);
    const t = JSON.stringify(r.payload || {});
    o.tong += 1;
    if (t.includes('"referral"')) o.messaging_referrals += 1;
    if (t.includes('"message"')) o.messages += 1;
    if (t.includes('"reaction"')) o.message_reactions += 1;
    if (t.includes('"item":"comment"')) o.feed += 1;
    if (t.includes('"leadgen_id"')) o.leadgen += 1;
  }
  return m;
}

/** Tổng hợp cho màn hình điều khiển: mọi page × trạng thái × lưu lượng thật. */
async function tongHop(dsCongTy) {
  let q = supabase.from('facebook_pages')
    .select('page_id, page_name, access_token, default_company_id, is_active')
    .order('page_name');
  if (dsCongTy) q = q.in('default_company_id', dsCongTy);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const pages = data || [];
  const [trangThai, dem] = await Promise.all([
    Promise.all(pages.map((p) => docTrangThai(p))),
    demGoiGanDay(7),
  ]);
  const mTT = new Map(trangThai.map((x) => [String(x.page_id), x]));

  return {
    truong: TRUONG,
    pages: pages.map((p) => {
      const tt = mTT.get(String(p.page_id)) || {};
      return {
        page_id: p.page_id,
        page_name: p.page_name,
        is_active: p.is_active,
        co_token: !!p.access_token,
        ok: !!tt.ok,
        loi: tt.loi || null,
        thieu_quyen: !!tt.thieu_quyen,
        dang_bat: tt.dang_bat || [],
        thieu: tt.thieu || [],
        thua: tt.thua || [],
        goi_7_ngay: dem.get(String(p.page_id)) || null,
      };
    }),
  };
}

module.exports = { TRUONG, TRUONG_VO_ICH, docTrangThai, datTruong, tongHop };
