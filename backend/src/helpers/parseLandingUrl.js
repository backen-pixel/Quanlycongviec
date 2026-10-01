/**
 * Tách tham số theo dõi khỏi URL landing page.
 * Dùng cho: dọn crm_sources bị nhét nguyên URL, và ghi lead_attribution từ web.
 */

const KHOA_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** Nhận diện chuỗi có phải URL không (kể cả khi thiếu scheme). */
function laUrl(s) {
  const raw = String(s || '').trim();
  if (!raw) return false;
  return /^https?:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+\//.test(raw);
}

/**
 * @param {string} input URL đầy đủ hoặc chuỗi có chứa URL
 * @returns {null|{host,path,landing_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,gbraid,wbraid,platform}}
 */
function tachUrl(input) {
  const raw = String(input || '').trim();
  if (!laUrl(raw)) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const q = u.searchParams;
  const lay = (k) => {
    const v = q.get(k);
    return v && v.trim() ? v.trim() : null;
  };

  const ra = {
    host: u.host || null,
    path: u.pathname && u.pathname !== '/' ? u.pathname : null,
    landing_url: `${u.origin}${u.pathname}`,
    gclid: lay('gclid'),
    fbclid: lay('fbclid'),
    gbraid: lay('gbraid'),
    wbraid: lay('wbraid'),
  };
  for (const k of KHOA_UTM) ra[k] = lay(k);

  // Suy ra nền tảng khi không có utm_source
  if (ra.fbclid) ra.platform = 'facebook';
  else if (ra.gclid || ra.gbraid || ra.wbraid) ra.platform = 'google';
  else if (ra.utm_source) ra.platform = String(ra.utm_source).toLowerCase();
  else ra.platform = 'direct';

  return ra;
}

/**
 * Tên nguồn chuẩn hoá để lưu vào crm_sources — KHÔNG bao giờ lấy nguyên URL.
 * @returns {string} ví dụ "Google Ads", "Facebook Ads", "Website — tubepinox"
 */
function tenNguonChuan(input, macDinh = 'Website') {
  const t = tachUrl(input);
  if (!t) {
    const raw = String(input || '').trim();
    return raw && raw.length <= 60 ? raw : macDinh;
  }
  if (t.gclid || t.gbraid || t.wbraid) return 'Google Ads';
  if (t.fbclid) return 'Facebook Ads';
  if (t.utm_source) {
    const s = String(t.utm_source).toLowerCase();
    if (s.includes('google')) return 'Google Ads';
    if (s.includes('facebook') || s === 'fb') return 'Facebook Ads';
    if (s.includes('zalo')) return 'Zalo';
    return `Website — ${t.utm_source}`;
  }
  const ten = String(t.host || '').replace(/^www\./, '').split('.')[0];
  return ten ? `Website — ${ten}` : macDinh;
}

module.exports = { tachUrl, laUrl, tenNguonChuan, KHOA_UTM };
