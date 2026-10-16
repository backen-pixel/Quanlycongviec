/**
 * MCP channel bridge — bộ công cụ scope 'channels_read': đọc dữ liệu hai kênh
 * chat Facebook Messenger và Zalo OA.
 *
 * Phạm vi công ty lấy từ chính API key (giaiPhamVi), giống ads bridge — kênh
 * nào không thuộc công ty của khoá thì không thấy, và mọi truy vấn liên hệ /
 * tin nhắn đều chặn hai lớp: lọc kênh hợp lệ trước, rồi lọc lại kết quả.
 *
 * KHÔNG bao giờ trả access_token / secret_key / refresh_token / webhook token.
 */
const { supabase } = require('../config/supabase');

/**
 * Công ty khoá được xem. null = không giới hạn ở tầng này (gateway vẫn lọc lại kết quả).
 * Cố ý KHÔNG dùng giaiPhamVi của partnerScope: hàm đó bắt buộc có tenant_id — đúng cho
 * khoá đối tác quảng cáo, nhưng khoá MCP nội bộ thường để trống tenant và chỉ khai
 * allowed_company_ids, nên sẽ rơi vào "khong_xac_dinh_he_sinh_thai" và không thấy gì.
 */
function congTyChoPhep(apiKey) {
  if (apiKey?.company_id) return [String(apiKey.company_id)];
  const ds = Array.isArray(apiKey?.allowed_company_ids)
    ? apiKey.allowed_company_ids.map(String).filter(Boolean)
    : [];
  if (ds.length) return ds;
  const tenantDs = Array.isArray(apiKey?.tenant_company_ids)
    ? apiKey.tenant_company_ids.map(String).filter(Boolean)
    : [];
  return tenantDs.length ? tenantDs : null;
}

const GIOI_HAN_MAC_DINH = 50;
const GIOI_HAN_TOI_DA = 200;
const TIN_TOI_DA = 300;

const SCHEMA_KY = {
  date_from: { type: 'string', description: 'YYYY-MM-DD — đầu kỳ' },
  date_to: { type: 'string', description: 'YYYY-MM-DD — cuối kỳ' },
};

const MCP_CHANNEL_TOOLS = [
  {
    name: 'list_chat_channels',
    description:
      'Liệt kê các kênh chat trong phạm vi khoá: page Facebook và Official Account Zalo. '
      + 'Kèm số liên hệ, số tin, trạng thái hoạt động và tình trạng token (còn hạn / hết hạn / lỗi). '
      + 'Không trả về giá trị token.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['facebook', 'zalo', 'all'], description: 'Mặc định all' },
      },
    },
  },
  {
    name: 'get_chat_overview',
    description:
      'Số liệu tổng hợp hai kênh chat trong kỳ: liên hệ mới, tin nhận/gửi, liên hệ chưa đọc, '
      + 'số liên hệ đã thành lead. Tách theo từng page/OA. Không kèm nội dung tin.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['facebook', 'zalo', 'all'] },
        ...SCHEMA_KY,
      },
    },
  },
  {
    name: 'search_chat_contacts',
    description:
      'Tìm liên hệ trong hộp thư Facebook / Zalo theo tên, số điện thoại, hoặc theo kênh. '
      + 'Trả về tên, SĐT, kênh, lead đã gắn, thời điểm nhắn cuối. Không kèm nội dung tin.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['facebook', 'zalo', 'all'] },
        search: { type: 'string', description: 'Tên hoặc số điện thoại' },
        channel_ref: { type: 'string', description: 'Lọc đúng một page_id (FB) hoặc oa_id (Zalo)' },
        has_lead: { type: 'boolean', description: 'true = chỉ liên hệ đã gắn lead; false = chưa gắn' },
        limit: { type: 'integer', description: `Mặc định ${GIOI_HAN_MAC_DINH}, tối đa ${GIOI_HAN_TOI_DA}` },
      },
    },
  },
  {
    name: 'get_chat_conversation',
    description:
      'Nội dung hội thoại của MỘT liên hệ cụ thể. Phải có contact_id lấy từ search_chat_contacts. '
      + 'Dùng khi cần đọc khách đã trao đổi những gì. Đây là hội thoại riêng của khách hàng.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['facebook', 'zalo'], description: 'Bắt buộc' },
        contact_id: { type: 'string', description: 'id liên hệ (UUID)' },
        limit: { type: 'integer', description: `Số tin gần nhất, mặc định 100, tối đa ${TIN_TOI_DA}` },
      },
      required: ['channel', 'contact_id'],
    },
  },
];

const MCP_CHANNEL_TOOL_SET = new Set(MCP_CHANNEL_TOOLS.map((t) => t.name));

function getMcpChannelTools() {
  return MCP_CHANNEL_TOOLS.map((t) => ({ ...t }));
}

function chuan(n, macDinh, toiDa) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return macDinh;
  return Math.min(Math.floor(v), toiDa);
}

function khoangNgay({ date_from, date_to } = {}) {
  const tu = date_from ? `${date_from}T00:00:00.000Z` : null;
  const den = date_to ? `${date_to}T23:59:59.999Z` : null;
  return { tu, den };
}

function tinhTrangToken(oa) {
  if (!oa.access_token) return 'chưa có token';
  const now = Date.now();
  const ae = oa.access_token_expires_at ? new Date(oa.access_token_expires_at).getTime() : null;
  const re = oa.refresh_token_expires_at ? new Date(oa.refresh_token_expires_at).getTime() : null;
  if (re != null && re < now) return 'refresh_token HẾT HẠN — phải lấy lại token thủ công';
  if (ae != null && ae < now) return 'access_token hết hạn — chờ gia hạn tự động';
  if (oa.last_token_error) return `gia hạn gần nhất lỗi: ${oa.last_token_error}`;
  if (ae != null) return `còn ${Math.round((ae - now) / 3600000)}h`;
  return 'không rõ hạn';
}

/** Kênh trong phạm vi khoá. Trả { pages: [...], oas: [...] } — đã khử token. */
async function kenhTrongPhamVi(apiKey, channel = 'all') {
  const cids = congTyChoPhep(apiKey);
  const out = { pages: [], oas: [], companies: [], ly_do: null };

  if (cids) {
    const { data: ct } = await supabase.from('companies').select('id, name').in('id', cids);
    out.companies = (ct || []).map((c) => ({ id: String(c.id), name: c.name }));
    if (!out.companies.length) return { ...out, ly_do: 'khoa_khong_co_cong_ty_hop_le' };
  }

  if (channel === 'all' || channel === 'facebook') {
    let q = supabase.from('facebook_pages')
      .select('page_id, page_name, is_active, default_company_id, auto_create_lead');
    if (cids) q = q.in('default_company_id', cids);
    const { data } = await q;
    // allowed_page_ids: nếu khoá khai tay thì chỉ thấy đúng page đó.
    const khaiTay = Array.isArray(apiKey?.allowed_page_ids) && apiKey.allowed_page_ids.length
      ? new Set(apiKey.allowed_page_ids.map(String))
      : null;
    out.pages = (data || [])
      .filter((p) => !khaiTay || khaiTay.has(String(p.page_id)))
      .map((p) => ({
        channel: 'facebook',
        ref: String(p.page_id),
        name: p.page_name || null,
        company_id: p.default_company_id ? String(p.default_company_id) : null,
        is_active: p.is_active !== false,
        auto_create_lead: p.auto_create_lead !== false,
      }));
  }

  if (channel === 'all' || channel === 'zalo') {
    let q = supabase.from('zalo_oa_accounts')
      .select('oa_id, oa_name, is_active, default_company_id, auto_create_lead, access_token, access_token_expires_at, refresh_token_expires_at, last_token_error');
    if (cids) q = q.in('default_company_id', cids);
    const { data } = await q;
    out.oas = (data || []).map((o) => ({
      channel: 'zalo',
      ref: String(o.oa_id),
      name: o.oa_name || null,
      company_id: o.default_company_id ? String(o.default_company_id) : null,
      is_active: o.is_active !== false,
      auto_create_lead: o.auto_create_lead !== false,
      tinh_trang_token: tinhTrangToken(o),
    }));
  }
  return out;
}

async function toolListChatChannels(apiKey, args = {}) {
  const channel = args.channel || 'all';
  const k = await kenhTrongPhamVi(apiKey, channel);
  if (k.ly_do) return { channels: [], ly_do: k.ly_do };

  const ra = [];
  for (const p of k.pages) {
    const { count: lh } = await supabase.from('facebook_contacts')
      .select('*', { count: 'exact', head: true }).eq('page_id', p.ref);
    ra.push({ ...p, so_lien_he: lh || 0 });
  }
  for (const o of k.oas) {
    const { count: lh } = await supabase.from('zalo_contacts')
      .select('*', { count: 'exact', head: true }).eq('oa_id', o.ref);
    ra.push({ ...o, so_lien_he: lh || 0 });
  }
  return { companies: k.companies, channels: ra };
}

/** Lấy ĐỦ id liên hệ của một kênh. PostgREST cắt ngầm ở 1000 dòng nên phải phân trang. */
async function layDuIdLienHe(bang, cotRef, ref, tranAnToan = 20000) {
  const ids = [];
  const BUOC = 1000;
  for (let tu = 0; tu < tranAnToan; tu += BUOC) {
    const { data, error } = await supabase.from(bang)
      .select('id').eq(cotRef, ref).order('id').range(tu, tu + BUOC - 1);
    if (error || !data?.length) break;
    for (const r of data) ids.push(r.id);
    if (data.length < BUOC) break;
  }
  return ids;
}

/** Đếm tin theo lô contact_id. Dùng count chứ không tải nội dung. */
async function demTinTheoLienHe(bang, contactIds, tu, den) {
  let tong = 0; let vao = 0; let ra = 0;
  for (let i = 0; i < contactIds.length; i += 100) {
    const lo = contactIds.slice(i, i + 100);
    const dem = async (huong) => {
      let q = supabase.from(bang).select('*', { count: 'exact', head: true }).in('contact_id', lo);
      if (tu) q = q.gte('created_at', tu);
      if (den) q = q.lte('created_at', den);
      if (huong) q = q.in('direction', huong);
      const { count } = await q;
      return count || 0;
    };
    const [t, v] = await Promise.all([dem(null), dem(['in', 'inbound'])]);
    tong += t; vao += v; ra += (t - v);
  }
  return { tong, vao, ra };
}

async function toolGetChatOverview(apiKey, args = {}) {
  const channel = args.channel || 'all';
  const { tu, den } = khoangNgay(args);
  const k = await kenhTrongPhamVi(apiKey, channel);
  if (k.ly_do) return { ly_do: k.ly_do, kenh: [] };

  const kenh = [];
  const dong = async (ten, bangLH, bangTin, cotRef, ref, meta) => {
    // Đếm bằng count — KHÔNG tải mảng rồi .length, vì PostgREST cắt ngầm ở 1000 dòng.
    const dem = (apDung) => {
      let q = supabase.from(bangLH).select('*', { count: 'exact', head: true }).eq(cotRef, ref);
      if (apDung) q = apDung(q);
      return q.then((r) => r.count || 0);
    };
    const [tong, trongKy, thanhLead, chuaDoc] = await Promise.all([
      dem(null),
      dem((q) => {
        let x = q;
        if (tu) x = x.gte('created_at', tu);
        if (den) x = x.lte('created_at', den);
        return x;
      }),
      dem((q) => q.not('lead_id', 'is', null)),
      dem((q) => q.gt('unread_count', 0)),
    ]);

    const ids = await layDuIdLienHe(bangLH, cotRef, ref);
    const tin = await demTinTheoLienHe(bangTin, ids, tu, den);
    kenh.push({
      ...meta,
      ten,
      lien_he_tong: tong,
      lien_he_moi_trong_ky: trongKy,
      lien_he_da_thanh_lead: thanhLead,
      lien_he_chua_doc: chuaDoc,
      tin_trong_ky: tin.tong,
      tin_khach_gui: tin.vao,
      tin_minh_gui: tin.ra,
      ...(ids.length < tong ? { luu_y: `tin chỉ tính trên ${ids.length}/${tong} liên hệ (chạm trần an toàn)` } : {}),
    });
  };

  for (const p of k.pages) await dong(p.name, 'facebook_contacts', 'facebook_messages', 'page_id', p.ref, { channel: 'facebook', ref: p.ref });
  for (const o of k.oas) await dong(o.name, 'zalo_contacts', 'zalo_messages', 'oa_id', o.ref, { channel: 'zalo', ref: o.ref, tinh_trang_token: o.tinh_trang_token });

  const cong = (f) => kenh.reduce((s, x) => s + (x[f] || 0), 0);
  return {
    ky: { tu: args.date_from || null, den: args.date_to || null },
    tong: {
      lien_he_tong: cong('lien_he_tong'),
      lien_he_moi_trong_ky: cong('lien_he_moi_trong_ky'),
      lien_he_da_thanh_lead: cong('lien_he_da_thanh_lead'),
      lien_he_chua_doc: cong('lien_he_chua_doc'),
      tin_trong_ky: cong('tin_trong_ky'),
    },
    kenh,
  };
}

async function toolSearchChatContacts(apiKey, args = {}) {
  const channel = args.channel || 'all';
  const limit = chuan(args.limit, GIOI_HAN_MAC_DINH, GIOI_HAN_TOI_DA);
  const k = await kenhTrongPhamVi(apiKey, channel);
  if (k.ly_do) return { ly_do: k.ly_do, contacts: [] };

  const loc = args.channel_ref ? String(args.channel_ref) : null;
  const s = args.search ? String(args.search).trim().replace(/[%_]/g, '') : null;
  const ra = [];

  const refsFb = k.pages.map((p) => p.ref).filter((r) => !loc || r === loc);
  if (refsFb.length) {
    let q = supabase.from('facebook_contacts')
      .select('id, page_id, fb_name, phone, lead_id, customer_id, unread_count, last_message_at')
      .in('page_id', refsFb);
    if (s) q = q.or(`fb_name.ilike.%${s}%,phone.ilike.%${s}%`);
    if (args.has_lead === true) q = q.not('lead_id', 'is', null);
    if (args.has_lead === false) q = q.is('lead_id', null);
    const { data } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(limit);
    for (const c of data || []) {
      ra.push({
        channel: 'facebook',
        contact_id: c.id,
        ten: c.fb_name || null,
        phone: c.phone || null,
        kenh_ref: String(c.page_id),
        kenh_ten: k.pages.find((p) => p.ref === String(c.page_id))?.name || null,
        lead_id: c.lead_id || null,
        chua_doc: c.unread_count || 0,
        nhan_cuoi: c.last_message_at || null,
      });
    }
  }

  const refsZl = k.oas.map((o) => o.ref).filter((r) => !loc || r === loc);
  if (refsZl.length) {
    let q = supabase.from('zalo_contacts')
      .select('id, oa_id, display_name, phone, lead_id, customer_id, unread_count, last_message_at')
      .in('oa_id', refsZl);
    if (s) q = q.or(`display_name.ilike.%${s}%,phone.ilike.%${s}%`);
    if (args.has_lead === true) q = q.not('lead_id', 'is', null);
    if (args.has_lead === false) q = q.is('lead_id', null);
    const { data } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(limit);
    for (const c of data || []) {
      ra.push({
        channel: 'zalo',
        contact_id: c.id,
        ten: c.display_name || null,
        phone: c.phone || null,
        kenh_ref: String(c.oa_id),
        kenh_ten: k.oas.find((o) => o.ref === String(c.oa_id))?.name || null,
        lead_id: c.lead_id || null,
        chua_doc: c.unread_count || 0,
        nhan_cuoi: c.last_message_at || null,
      });
    }
  }

  ra.sort((a, b) => String(b.nhan_cuoi || '').localeCompare(String(a.nhan_cuoi || '')));
  return { tong: ra.length, contacts: ra.slice(0, limit) };
}

async function toolGetChatConversation(apiKey, args = {}) {
  const channel = String(args.channel || '').toLowerCase();
  if (channel !== 'facebook' && channel !== 'zalo') {
    return { error: 'channel phải là facebook hoặc zalo' };
  }
  if (!args.contact_id) return { error: 'thiếu contact_id' };
  const limit = chuan(args.limit, 100, TIN_TOI_DA);

  const k = await kenhTrongPhamVi(apiKey, channel);
  if (k.ly_do) return { ly_do: k.ly_do, messages: [] };

  const bangLH = channel === 'facebook' ? 'facebook_contacts' : 'zalo_contacts';
  const cotRef = channel === 'facebook' ? 'page_id' : 'oa_id';
  const cotTen = channel === 'facebook' ? 'fb_name' : 'display_name';

  const { data: ct } = await supabase.from(bangLH)
    .select(`id, ${cotRef}, ${cotTen}, phone, lead_id`)
    .eq('id', String(args.contact_id)).maybeSingle();
  if (!ct) return { error: 'không tìm thấy liên hệ', messages: [] };

  // Lớp chặn thứ hai: liên hệ phải thuộc kênh trong phạm vi khoá.
  const refsOk = new Set((channel === 'facebook' ? k.pages : k.oas).map((x) => x.ref));
  if (!refsOk.has(String(ct[cotRef]))) {
    return { error: 'liên hệ nằm ngoài phạm vi khoá', messages: [] };
  }

  const bangTin = channel === 'facebook' ? 'facebook_messages' : 'zalo_messages';
  const { data: tin } = await supabase.from(bangTin)
    .select('id, direction, message_type, content, attachment_url, created_at')
    .eq('contact_id', ct.id).order('created_at', { ascending: false }).limit(limit);

  const ds = (tin || []).reverse().map((m) => ({
    luc: m.created_at,
    huong: (m.direction === 'in' || m.direction === 'inbound') ? 'khách gửi' : 'mình gửi',
    loai: m.message_type || 'text',
    noi_dung: m.content || null,
    co_dinh_kem: !!m.attachment_url,
  }));

  return {
    lien_he: {
      channel,
      contact_id: ct.id,
      ten: ct[cotTen] || null,
      phone: ct.phone || null,
      kenh_ten: (channel === 'facebook' ? k.pages : k.oas).find((x) => x.ref === String(ct[cotRef]))?.name || null,
      lead_id: ct.lead_id || null,
    },
    so_tin: ds.length,
    messages: ds,
  };
}

async function callMcpChannelTool(name, apiKey, args = {}) {
  switch (name) {
    case 'list_chat_channels': return toolListChatChannels(apiKey, args);
    case 'get_chat_overview': return toolGetChatOverview(apiKey, args);
    case 'search_chat_contacts': return toolSearchChatContacts(apiKey, args);
    case 'get_chat_conversation': return toolGetChatConversation(apiKey, args);
    default: throw new Error(`Tool kênh chat không tồn tại: ${name}`);
  }
}

module.exports = {
  MCP_CHANNEL_TOOLS,
  MCP_CHANNEL_TOOL_SET,
  getMcpChannelTools,
  callMcpChannelTool,
};
