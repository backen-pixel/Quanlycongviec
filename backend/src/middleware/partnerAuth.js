/**
 * Xác thực cổng đối tác /api/partner/v1.
 *
 * Khác apiKeyAuth thường ở chỗ cộng thêm 4 tầng chặn:
 *   1. Hạn dùng khoá (expires_at)
 *   2. Danh sách IP được gọi (ip_allowlist) — BẮT BUỘC khi pii_level = 'full'
 *   3. Phạm vi partner_scopes phải có 'partner_read'
 *   4. Hạn mức bản ghi chứa thông tin cá nhân mỗi ngày
 *
 * Mọi lượt gọi đều ghi partner_api_audit khi response kết thúc.
 */
const { supabase } = require('../config/supabase');
const { extractApiKey, resolveKeyCredential } = require('./apiKeyAuth');
const { giaiPhamVi, xoaCachePhamVi } = require('../helpers/partnerScope');

const TRAN_PII_NGAY = 10000;     // bản ghi có PII / ngày / khoá
const CUA_SO_MS = 60_000;
const TRAN_MOI_PHUT = 120;

const _nhip = new Map();          // keyId:ip → { t, c }
const _cachePartner = new Map();  // keyId → { row, exp }
const CACHE_MS = 30_000;

function ipCuaRequest(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || '';
}

/** So khớp IP: bằng nhau, hoặc tiền tố kết thúc bằng '*' (vd "203.0.113.*"). */
function ipDuocPhep(ip, danhSach) {
  if (!Array.isArray(danhSach) || !danhSach.length) return true;
  const s = String(ip || '').replace(/^::ffff:/, '');
  return danhSach.some((m) => {
    const mau = String(m || '').trim().replace(/^::ffff:/, '');
    if (!mau) return false;
    if (mau.endsWith('*')) return s.startsWith(mau.slice(0, -1));
    return s === mau;
  });
}

function quaNhip(keyId, ip) {
  const k = `${keyId}:${ip}`;
  const now = Date.now();
  const cur = _nhip.get(k) || { t: now, c: 0 };
  if (now - cur.t > CUA_SO_MS) {
    _nhip.set(k, { t: now, c: 1 });
    return { ok: true, con_lai: TRAN_MOI_PHUT - 1, reset: now + CUA_SO_MS };
  }
  cur.c += 1;
  _nhip.set(k, cur);
  return {
    ok: cur.c <= TRAN_MOI_PHUT,
    con_lai: Math.max(0, TRAN_MOI_PHUT - cur.c),
    reset: cur.t + CUA_SO_MS,
  };
}

/** Cột phân quyền đối tác — tra riêng để không đụng SELECT_COLS dùng chung. */
async function layCotDoiTac(keyId) {
  const hit = _cachePartner.get(keyId);
  if (hit && Date.now() < hit.exp) return hit.row;
  let row = {
    pii_level: 'hashed', partner_scopes: [], ip_allowlist: null,
    expires_at: null, tenant_id: null, allowed_page_ids: null,
  };
  try {
    const { data, error } = await supabase
      .from('external_api_keys')
      .select('pii_level, partner_scopes, ip_allowlist, expires_at, tenant_id, allowed_page_ids')
      .eq('id', keyId)
      .maybeSingle();
    if (!error && data) row = { ...row, ...data };
  } catch (e) {
    console.warn('[partner-auth] cot doi tac:', e.message);
  }
  _cachePartner.set(keyId, { row, exp: Date.now() + CACHE_MS });
  return row;
}

function xoaCachePartner(keyId) {
  if (keyId) _cachePartner.delete(keyId);
  else _cachePartner.clear();
}

/** Đã lấy bao nhiêu bản ghi PII hôm nay. */
async function daLayPiiHomNay(keyId) {
  try {
    const dau = new Date();
    dau.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('partner_api_audit')
      .select('so_ban_ghi')
      .eq('api_key_id', keyId)
      .in('pii_level', ['full', 'masked'])
      .gte('created_at', dau.toISOString())
      .limit(5000);
    if (error) return 0;
    return (data || []).reduce((a, r) => a + (Number(r.so_ban_ghi) || 0), 0);
  } catch {
    return 0;
  }
}

function ghiAudit(req, res, batDau) {
  const p = req.partner;
  if (!p) return;
  const ms = Date.now() - batDau;
  const row = {
    api_key_id: p.key_id,
    key_name: p.ten || null,
    endpoint: req.baseUrl ? `${req.baseUrl}${req.path}` : req.path,
    method: req.method,
    ip: p.ip || null,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
    params: req.query && Object.keys(req.query).length ? req.query : null,
    so_ban_ghi: Number.isFinite(res.locals?.soBanGhi) ? res.locals.soBanGhi : null,
    pii_level: p.pii_level,
    tenant_id: p.scope?.tenant_id || null,
    company_ids: p.scope?.company_ids || null,
    page_ids: p.scope?.page_ids_khai_tay?.length ? p.scope.page_ids_khai_tay : null,
    status: res.statusCode,
    ms,
  };
  supabase.from('partner_api_audit').insert(row).then(
    () => {},
    (e) => console.warn('[partner-auth] audit:', e?.message),
  );
  supabase.from('external_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', p.key_id)
    .then(() => {}, () => {});
}

async function partnerAuth(req, res, next) {
  const batDau = Date.now();
  const key = extractApiKey(req);
  if (!key) {
    return res.status(401).json({
      type: 'about:blank',
      title: 'Thiếu khoá truy cập',
      status: 401,
      detail: 'Gửi khoá qua header X-Api-Key hoặc Authorization: Bearer.',
    });
  }

  try {
    const found = await resolveKeyCredential(key);
    if (!found || found.active === false) {
      return res.status(401).json({
        type: 'about:blank', title: 'Khoá không hợp lệ', status: 401,
        detail: 'Khoá sai hoặc đã bị thu hồi.',
      });
    }

    const dt = await layCotDoiTac(found.id);
    const scopes = Array.isArray(dt.partner_scopes) ? dt.partner_scopes.map(String) : [];
    const mcpScopes = Array.isArray(found.mcp_scopes) ? found.mcp_scopes.map(String) : [];

    if (!scopes.includes('partner_read') && !mcpScopes.includes('ads_read')) {
      return res.status(403).json({
        type: 'about:blank', title: 'Khoá chưa được cấp quyền đọc cổng đối tác', status: 403,
        detail: "Cần partner_scopes chứa 'partner_read' (hoặc mcp_scopes chứa 'ads_read').",
      });
    }

    if (dt.expires_at && new Date(dt.expires_at) <= new Date()) {
      return res.status(403).json({
        type: 'about:blank', title: 'Khoá đã hết hạn', status: 403,
        detail: `Hết hạn lúc ${dt.expires_at}. Liên hệ quản trị để cấp khoá mới.`,
      });
    }

    const ip = ipCuaRequest(req);
    const dsIp = Array.isArray(dt.ip_allowlist) ? dt.ip_allowlist.filter(Boolean) : [];
    const piiLevel = ['hashed', 'masked', 'full'].includes(dt.pii_level) ? dt.pii_level : 'hashed';

    // Mức đầy đủ BẮT BUỘC khai IP — chặn ngay, không có ngoại lệ.
    if (piiLevel === 'full' && !dsIp.length) {
      return res.status(403).json({
        type: 'about:blank', title: 'Khoá mức đầy đủ thiếu danh sách IP', status: 403,
        detail: 'Khoá đọc được thông tin cá nhân đầy đủ phải khai ip_allowlist. Liên hệ quản trị.',
      });
    }
    if (dsIp.length && !ipDuocPhep(ip, dsIp)) {
      return res.status(403).json({
        type: 'about:blank', title: 'IP không nằm trong danh sách cho phép', status: 403,
        detail: `IP ${ip} chưa được cấp quyền cho khoá này.`,
      });
    }

    const nhip = quaNhip(found.id, ip);
    res.set('X-RateLimit-Limit', String(TRAN_MOI_PHUT));
    res.set('X-RateLimit-Remaining', String(nhip.con_lai));
    res.set('X-RateLimit-Reset', String(Math.ceil(nhip.reset / 1000)));
    if (!nhip.ok) {
      return res.status(429).json({
        type: 'about:blank', title: 'Vượt hạn mức gọi', status: 429,
        detail: `Tối đa ${TRAN_MOI_PHUT} lượt mỗi phút.`,
      });
    }

    let conLaiPii = null;
    if (piiLevel !== 'hashed') {
      const daLay = await daLayPiiHomNay(found.id);
      conLaiPii = Math.max(0, TRAN_PII_NGAY - daLay);
      res.set('X-PII-Quota-Remaining', String(conLaiPii));
      if (conLaiPii <= 0) {
        return res.status(429).json({
          type: 'about:blank', title: 'Hết hạn mức bản ghi cá nhân trong ngày', status: 429,
          detail: `Tối đa ${TRAN_PII_NGAY} bản ghi mỗi ngày. Hạn mức đặt lại lúc 00:00.`,
        });
      }
    }

    // Phạm vi 3 tầng: hệ sinh thái → công ty → page. Fail-closed.
    const scope = await giaiPhamVi({
      id: found.id,
      company_id: found.company_id || null,
      allowed_company_ids: found.allowed_company_ids || null,
      created_by: found.created_by || null,
      default_assigned_to: found.default_assigned_to || null,
      tenant_id: dt.tenant_id || null,
      allowed_page_ids: dt.allowed_page_ids || null,
    });

    if (!scope.hop_le) {
      return res.status(403).json({
        type: 'about:blank',
        title: 'Khoá chưa được phân vùng dữ liệu',
        status: 403,
        detail: scope.ly_do === 'khong_xac_dinh_he_sinh_thai'
          ? 'Khoá không xác định được hệ sinh thái. Đặt tenant_id hoặc company_id cho khoá.'
          : 'Hệ sinh thái của khoá không có công ty nào hợp lệ.',
      });
    }

    req.partner = {
      key_id: found.id,
      ten: found.name || null,
      pii_level: piiLevel,
      scopes,
      scope,
      company_ids: scope.company_ids,
      ip,
      con_lai_pii: conLaiPii,
    };

    res.on('finish', () => ghiAudit(req, res, batDau));
    next();
  } catch (e) {
    console.error('[partner-auth] loi:', e.message);
    res.status(500).json({
      type: 'about:blank', title: 'Lỗi xác thực', status: 500, detail: e.message,
    });
  }
}

module.exports = {
  partnerAuth, ipDuocPhep, layCotDoiTac,
  xoaCachePartner: (id) => { xoaCachePartner(id); xoaCachePhamVi(id); },
  TRAN_PII_NGAY, TRAN_MOI_PHUT,
};
