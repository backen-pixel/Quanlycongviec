/**
 * Quy kết lead — ghi lần chạm ĐẦU TIÊN vào lead_attribution.
 *
 * Nguyên tắc:
 *  - Chỉ ghi lần đầu. Lần sau chỉ bổ sung trường còn trống, không ghi đè.
 *  - Contact Messenger chưa thành lead thì giữ theo contact_id; khi thành lead
 *    gọi ganLeadVaoQuyKet() để nối lead_id vào đúng dòng đó.
 *  - Mọi lỗi đều nuốt và log — không được làm hỏng luồng webhook.
 */
const { supabase } = require('../config/supabase');
const { tachUrl } = require('./parseLandingUrl');

function chuoi(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/** Bảng chưa migrate (635) — bỏ qua im lặng thay vì làm hỏng webhook. */
function bangChuaCo(err) {
  const m = String(err?.message || '');
  return m.includes('lead_attribution') && /does not exist|schema cache|relation/i.test(m);
}

/**
 * Chuẩn hoá payload referral của Messenger.
 * FB gửi ở 3 chỗ: event.referral, event.postback.referral, event.message.referral
 */
/**
 * Khoá ổn định của một mẫu quảng cáo.
 *
 * URL Facebook gửi là link ký có hạn (oh=, oe=) nên vài ngày sau sẽ 404 và mỗi
 * lần gửi lại một khác — phải cắt query mới nhóm được theo mẫu.
 * NGOẠI LỆ: link dạng .../ads/image/ mang danh tính NGAY TRONG query, cắt query
 * là mọi mẫu dồn chung một khoá. Đo trên dữ liệu thật: 7 dòng bị dồn như vậy.
 */
function khoaCreative(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const duong = s.split('?')[0];
  if (/\/ads\/image\/?$/.test(duong)) return s;
  return duong;
}

function docReferralMessenger(event) {
  const ref = event?.referral || event?.postback?.referral || event?.message?.referral || null;
  if (!ref) return null;
  const ads = ref.ads_context_data || {};
  // Facebook gửi ảnh HOẶC video của chính mẫu quảng cáo. Đo trên 1.995 gói thật:
  // video_url 1.993 lần, photo_url 2 lần. Một ad_id có thể xoay nhiều mẫu —
  // thực tế có quảng cáo dùng tới 13 mẫu khác nhau.
  const video = chuoi(ads.video_url);
  const anh = chuoi(ads.photo_url);
  const creative = video || anh;
  return {
    fb_ref: chuoi(ref.ref),
    fb_source: chuoi(ref.source),          // ADS | SHORTLINK | CUSTOMER_CHAT_PLUGIN
    fb_ad_id: chuoi(ref.ad_id),
    fb_ad_title: chuoi(ads.ad_title),
    fb_post_id: chuoi(ads.post_id) || chuoi(ref.post_id),
    fb_creative_url: creative,
    fb_creative_type: creative ? (video ? 'video' : 'photo') : null,
    fb_creative_key: khoaCreative(creative),
    raw: ref,
  };
}

/** Có thông tin đáng lưu không — tránh tạo dòng rỗng. */
function dangLuu(row) {
  return !!(row.fb_ad_id || row.fb_ref || row.fb_campaign_id || row.fb_form_id
    || row.utm_source || row.utm_campaign || row.gclid || row.fbclid || row.fb_source
    || row.campaign_id || row.ad_id || row.gbraid || row.wbraid || row.landing_url);
}

// Read one complete snapshot, then fill missing fields in ONE guarded UPDATE.
// Every click/campaign identity is a touch boundary, not just the ad ID.
const ENRICHABLE_FIELDS = [
  'fb_ad_id', 'fb_adset_id', 'fb_campaign_id', 'fb_campaign_name',
  'fb_ref', 'fb_source', 'fb_ad_title', 'fb_post_id', 'fb_form_id', 'fb_leadgen_id',
  'fb_creative_url', 'fb_creative_type', 'fb_creative_key',
  'campaign_id', 'ad_id', 'adset_id', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid',
  'landing_url', 'referrer_url', 'fbp', 'fbc',
];
const TOUCH_IDENTITY_FIELDS = [
  'platform', 'fb_ad_id', 'fb_adset_id', 'fb_campaign_id', 'fb_form_id', 'fb_leadgen_id',
  'ad_id', 'adset_id', 'campaign_id', 'gclid', 'fbclid', 'gbraid', 'wbraid', 'landing_url',
];
const SNAPSHOT_FIELDS = ['company_id', 'platform', ...ENRICHABLE_FIELDS];
function readAttribution(row) {
  let q = supabase.from('lead_attribution')
    .select(['id', 'lead_id', 'contact_id', ...SNAPSHOT_FIELDS].join(',')).limit(1);
  q = row.lead_id ? q.eq('lead_id', row.lead_id) : q.eq('contact_id', row.contact_id);
  return q.maybeSingle();
}

/**
 * Ghi quy kết. Trả { ok, id, skipped } — không ném lỗi.
 * @param {object} row các trường của lead_attribution
 */
async function ghiQuyKet(row) {
  try {
    if (!row || (!row.lead_id && !row.contact_id && !row.customer_id)) {
      return { ok: false, skipped: 'thieu_doi_tuong' };
    }
    if (!dangLuu(row)) return { ok: false, skipped: 'khong_co_quy_ket' };

    let { data: cu, error: eCu } = await readAttribution(row);
    if (eCu) return { ok: false, skipped: bangChuaCo(eCu) ? 'chua_migrate' : 'loi' };

    if (cu?.id) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (row.company_id && cu.company_id !== row.company_id) return { ok: false, skipped: 'khac_cong_ty' };
        for (const key of TOUCH_IDENTITY_FIELDS) {
          if (cu[key] && row[key] && cu[key] !== row[key]) return { ok: false, skipped: 'khac_lan_cham' };
        }
        const patch = {};
        for (const key of ENRICHABLE_FIELDS) {
          if (cu[key] == null && row[key] != null && row[key] !== '') patch[key] = row[key];
        }
        if (!Object.keys(patch).length) return { ok: true, id: cu.id, skipped: 'khong_co_gi_moi' };

        let update = supabase.from('lead_attribution')
          .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', cu.id);
        // PostgreSQL rechecks the complete predicate after waiting for a concurrent
        // writer. No partial field writes can survive a lost snapshot comparison.
        for (const key of SNAPSHOT_FIELDS) {
          update = cu[key] == null ? update.is(key, null) : update.eq(key, cu[key]);
        }
        const { data: changed, error } = await update.select('id').maybeSingle();
        if (error) return { ok: false, skipped: 'loi' };
        if (changed?.id) return { ok: true, id: changed.id, skipped: 'da_co' };

        // Zero affected rows is a conflict, not success. Re-read before deciding
        // whether the same touch can safely fill anything else; bound contention.
        const fresh = await readAttribution(row);
        if (fresh.error) return { ok: false, skipped: 'loi' };
        if (!fresh.data || fresh.data.id !== cu.id) return { ok: false, skipped: 'xung_dot_dong_thoi' };
        cu = fresh.data;
      }
      return { ok: false, skipped: 'xung_dot_dong_thoi' };
    }

    const { data, error } = await supabase
      .from('lead_attribution')
      .insert({ ...row, cham_dau_luc: row.cham_dau_luc || new Date().toISOString() })
      .select('id')
      .maybeSingle();
    if (error) {
      if (bangChuaCo(error)) return { ok: false, skipped: 'chua_migrate' };
      // Trùng unique khi hai webhook vào cùng lúc — không phải lỗi
      if (String(error.message || '').includes('duplicate key')) return { ok: true, skipped: 'trung' };
      console.warn('[quy-ket] insert:', error.message);
      return { ok: false, skipped: 'loi' };
    }
    return { ok: true, id: data?.id || null };
  } catch (e) {
    console.warn('[quy-ket] ngoai le:', e.message);
    return { ok: false, skipped: 'ngoai_le' };
  }
}

/** Messenger: khách vào từ link quảng cáo / m.me có tham số ref. */
async function quyKetMessenger(pageId, contact, event, companyId = null) {
  const ref = docReferralMessenger(event);
  if (!ref) return { ok: false, skipped: 'khong_co_referral' };
  return ghiQuyKet({
    contact_id: contact?.id || null,
    lead_id: contact?.lead_id || null,
    customer_id: contact?.customer_id || null,
    company_id: companyId,
    kenh: 'messenger',
    platform: 'facebook',
    fb_page_id: chuoi(pageId),
    fb_ref: ref.fb_ref,
    fb_source: ref.fb_source,
    fb_ad_id: ref.fb_ad_id,
    fb_ad_title: ref.fb_ad_title,
    fb_post_id: ref.fb_post_id,
    fb_creative_url: ref.fb_creative_url,
    fb_creative_type: ref.fb_creative_type,
    fb_creative_key: ref.fb_creative_key,
    raw: ref.raw,
  });
}

/** Lead Ads: form quảng cáo. */
async function quyKetLeadAds(pageId, { leadgenId, formId, adId, adsetId, campaignId, campaignName, leadId, customerId, companyId, raw }) {
  return ghiQuyKet({
    lead_id: leadId || null,
    customer_id: customerId || null,
    company_id: companyId || null,
    kenh: 'lead_ads',
    platform: 'facebook',
    fb_page_id: chuoi(pageId),
    fb_leadgen_id: chuoi(leadgenId),
    fb_form_id: chuoi(formId),
    fb_ad_id: chuoi(adId),
    fb_adset_id: chuoi(adsetId),
    fb_campaign_id: chuoi(campaignId),
    fb_campaign_name: chuoi(campaignName),
    raw: raw || null,
  });
}

/** Web / landing page: tách UTM từ URL. */
async function quyKetWeb({ leadId, customerId, companyId, landingUrl, referrerUrl, fbp, fbc, clientIp, userAgent }) {
  const t = tachUrl(landingUrl);
  return ghiQuyKet({
    lead_id: leadId || null,
    customer_id: customerId || null,
    company_id: companyId || null,
    kenh: 'website',
    platform: t?.platform || 'direct',
    utm_source: t?.utm_source || null,
    utm_medium: t?.utm_medium || null,
    utm_campaign: t?.utm_campaign || null,
    utm_content: t?.utm_content || null,
    utm_term: t?.utm_term || null,
    gclid: t?.gclid || null,
    fbclid: t?.fbclid || null,
    gbraid: t?.gbraid || null,
    wbraid: t?.wbraid || null,
    landing_url: t?.landing_url || chuoi(landingUrl),
    referrer_url: chuoi(referrerUrl),
    fbp: chuoi(fbp),
    fbc: chuoi(fbc),
    client_ip: chuoi(clientIp),
    user_agent: chuoi(userAgent),
    raw: null,
  });
}

/**
 * Contact Messenger được chuyển thành lead → nối lead_id vào dòng quy kết đã có.
 */
async function ganLeadVaoQuyKet(contactId, leadId, customerId = null) {
  try {
    if (!contactId || !leadId) return { ok: false };
    const { data: cu, error: eCu } = await supabase
      .from('lead_attribution')
      .select('id, lead_id')
      .eq('contact_id', contactId)
      .maybeSingle();
    if (eCu && bangChuaCo(eCu)) return { ok: false, skipped: 'chua_migrate' };
    if (!cu?.id) return { ok: false, skipped: 'chua_co_quy_ket' };
    if (cu.lead_id) return { ok: true, skipped: 'da_gan' };

    const bo = { lead_id: leadId, updated_at: new Date().toISOString() };
    if (customerId) bo.customer_id = customerId;
    const { error } = await supabase.from('lead_attribution').update(bo).eq('id', cu.id);
    if (error) {
      console.warn('[quy-ket] gan lead:', error.message);
      return { ok: false };
    }
    return { ok: true, id: cu.id };
  } catch (e) {
    console.warn('[quy-ket] gan lead ngoai le:', e.message);
    return { ok: false };
  }
}

module.exports = {
  ghiQuyKet,
  docReferralMessenger,
  quyKetMessenger,
  quyKetLeadAds,
  quyKetWeb,
  ganLeadVaoQuyKet,
};
