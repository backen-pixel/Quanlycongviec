/**
 * Tổng hợp hành vi & khó khăn người dùng — nối user_activity_log + guide_chat_log + unified_tasks_v
 * thành 1 báo cáo theo user. KHÔNG tạo bảng mới, không cron — tính on-the-fly khi có người mở báo
 * cáo. Xem docs/architecture/ke-hoach-thu-thap-hanh-vi-nguoi-dung.md.
 */
const { supabase } = require('../config/supabase');

const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // > 2 phút không có event mới = đang chờ màn hình
const IDLE_GAP_CAP_MS = 15 * 60 * 1000; // gap dài hơn 15 phút = hết phiên, không tính là "chờ"
const REPEAT_QUESTION_TURN = 3; // hỏi lại từ lượt 3 trở đi trong cùng thread = chưa rõ thao tác
const ROW_LIMIT = 60000; // trần an toàn; vượt thì báo truncated chứ không im lặng cắt
// PostgREST của dự án chặn cứng 1000 dòng/request (db-max-rows) — đo thật, không đoán: xin 5000
// vẫn chỉ trả về 1000. Đặt đúng 1000 để biết "trang đầy" nghĩa là còn dữ liệu.
const PAGE_SIZE = 1000;
const DEFAULT_WINDOW_DAYS = 7; // không truyền date_from = quét cả lịch sử -> statement timeout

/**
 * Đọc hết theo trang. Tiến con trỏ theo SỐ DÒNG THỰC NHẬN chứ không theo PAGE_SIZE — nếu dự án
 * đặt `db-max-rows` nhỏ hơn thì vẫn chạy đúng, chỉ là nhiều vòng hơn.
 * Trả { rows, truncated } — truncated = còn dữ liệu nhưng đã chạm trần ROW_LIMIT.
 */
async function fetchAllPaged(buildQuery) {
  const rows = [];
  let from = 0;
  let pageSize = PAGE_SIZE;
  for (;;) {
    const to = Math.min(from + pageSize, ROW_LIMIT) - 1;
    if (to < from) return { rows, truncated: true };
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw new Error(error.message);
    const got = data || [];
    rows.push(...got);
    if (!got.length) return { rows, truncated: false };
    // Trang đầu bị server cắt nhỏ hơn yêu cầu -> đó mới là page size thật, dùng nó cho vòng sau.
    if (from === 0 && got.length < pageSize) pageSize = got.length;
    else if (got.length < pageSize) return { rows, truncated: false };
    from += got.length;
    if (from >= ROW_LIMIT) return { rows, truncated: true };
  }
}

/** Không có date_from thì mặc định 7 ngày gần nhất, tránh quét toàn bảng log. */
function resolveWindow({ dateFrom, dateTo } = {}) {
  if (dateFrom) return { dateFrom, dateTo: dateTo || null };
  const from = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: dateTo || null };
}

/**
 * user_activity_log không có company_id — phải lấy danh sách user_id của công ty trước.
 * Lấy kèm công ty + phòng ban để báo cáo nhóm được theo tổ chức (hiện tên ngắn nếu có).
 */
async function fetchCompanyUsers(companyId) {
  const full = 'id, full_name, email, role, position, department_id, company_id,'
    + ' departments:department_id(id, name), companies:company_id(id, name, short_name)';
  let q = supabase.from('users').select(full);
  if (companyId) q = q.eq('company_id', companyId);
  let { data, error } = await q.limit(2000);
  if (error) {
    // DB thiếu cột/quan hệ (vd position chưa migrate) — hạ xuống bộ cột chắc chắn có, còn hơn
    // để cả báo cáo chết vì một cột phụ dùng để nhóm.
    let q2 = supabase.from('users').select('id, full_name, email, role, company_id');
    if (companyId) q2 = q2.eq('company_id', companyId);
    ({ data, error } = await q2.limit(2000));
    if (error) throw new Error(error.message);
  }
  return data || [];
}

/**
 * Module mà nhân viên được gán — bảng `user_module_roles` (database/505_user_module_roles.sql).
 * Không JOIN được qua PostgREST vì bảng này không có FK cứng tới users, nên truy vấn riêng.
 * User chưa có dòng nào thì suy từ `users.role` (bảng dưới), không đoán bừa thì xếp "Chưa gán".
 */
const ROLE_TO_MODULE = {
  production_staff: 'production',
  production_admin: 'production',
  crm_production_staff: 'production',
  crm_production_admin: 'production',
  accounting: 'accounting',
  accountant: 'accounting',
  purchasing: 'purchasing',
  sales: 'crm',
  sales_admin: 'crm',
};

const MODULE_LABEL_VI = {
  crm: 'CRM', production: 'Sản xuất', logistics: 'Vận chuyển',
  accounting: 'Kế toán', purchasing: 'Mua hàng', tinhtoan: 'Tính toán',
};

async function fetchUserModules(userIds) {
  if (!userIds.length) return new Map();
  const byUser = new Map();
  try {
    for (const part of chunk(userIds)) {
      const { data, error } = await supabase
        .from('user_module_roles').select('user_id, module_key').in('user_id', part);
      if (error) throw error;
      for (const r of data || []) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
        byUser.get(r.user_id).add(r.module_key);
      }
    }
  } catch {
    // Bảng chưa migrate -> trả rỗng, phần gọi sẽ fallback sang role.
  }
  return byUser;
}

/** Nhãn module của 1 user: ưu tiên bảng gán, không có thì suy từ role. */
function resolveUserModules(userId, role, moduleMap) {
  const keys = moduleMap.get(userId);
  if (keys && keys.size) return [...keys].map((k) => MODULE_LABEL_VI[k] || k);
  const fromRole = ROLE_TO_MODULE[String(role || '').toLowerCase()];
  return fromRole ? [MODULE_LABEL_VI[fromRole] || fromRole] : [];
}

async function fetchActivityRows(userIds, { dateFrom, dateTo }) {
  if (!userIds.length) return { rows: [], truncated: false };
  const build = () => {
    let q = supabase
      .from('user_activity_log')
      // Lấy luôn taxonomy có sẵn (action_type/module/feature/entity_type/session_id/importance) —
      // cùng 1 lần quét, đủ dựng chi tiết thói quen mà không query thêm lần nào.
      .select('user_id, path, created_at, action_type, module, feature, entity_type, session_id, importance, label')
      .in('user_id', userIds)
      // Chỉ sắp xếp theo created_at DESC — đúng chiều index idx_user_activity_user_time
      // (user_id, created_at DESC). Thêm ORDER BY user_id phía trước buộc Postgres sort toàn bộ
      // kết quả trước khi LIMIT -> statement timeout.
      .order('created_at', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lt('created_at', dateTo);
    return q;
  };
  const { rows, truncated } = await fetchAllPaged(build);
  // computeIdleByUser cần thứ tự (user_id, created_at tăng dần) — sắp lại ở Node, rẻ hơn ở DB.
  rows.sort(
    (a, b) =>
      (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0) ||
      new Date(a.created_at) - new Date(b.created_at)
  );
  return { rows, truncated };
}

/**
 * CRUD THẬT phía server — `activity_logs` do backend tự ghi khi dữ liệu đổi (action +
 * entity_type + old_values/new_values). Khác `user_activity_log` ở chỗ kia chỉ là ý định trên UI.
 * Bảng không có company_id -> lọc theo tập user. Lưu lượng nhỏ (~100 dòng/7 ngày).
 */
async function fetchAuditRows(userIds, { dateFrom, dateTo }) {
  if (!userIds.length) return [];
  const build = () => {
    let q = supabase
      .from('activity_logs')
      .select('user_id, action, entity_type, entity_id, description, old_values, new_values, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lt('created_at', dateTo);
    return q;
  };
  const { rows } = await fetchAllPaged(build);
  return rows;
}


/** Tên tiếng Việt của các trường hay bị sửa — đo trên 1.000 bản ghi gần nhất. */
const AUDIT_FIELD_LABEL = {
  production_deadline: 'Hạn sản xuất',
  install_date: 'Ngày lắp đặt',
  delivery_date: 'Ngày giao hàng',
  production_person_id: 'Người phụ trách SX',
  name: 'Tên',
  title: 'Tiêu đề',
  status: 'Trạng thái',
  stage: 'Giai đoạn',
  priority: 'Ưu tiên',
  assignee_id: 'Người thực hiện',
  due_date: 'Hạn chót',
  description: 'Mô tả',
};
// Cột nhiễu: đổi theo mọi lần ghi, nêu ra chỉ tổ che mất thay đổi thật.
const AUDIT_FIELD_SKIP = new Set(['updated_at', 'created_at', 'updated_by', 'id']);

/** Giá trị gọn để hiển thị — cắt chuỗi dài, rút ngày ISO về dd/mm/yyyy. */
function auditValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'có' : 'không';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  const str = String(v);
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return str.length > 60 ? `${str.slice(0, 60)}…` : str;
}

/** So old_values với new_values ra danh sách "trường: cũ → mới". */
function diffAudit(oldV, newV) {
  const o = oldV && typeof oldV === 'object' ? oldV : {};
  const n = newV && typeof newV === 'object' ? newV : {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !AUDIT_FIELD_SKIP.has(k));
  const out = [];
  for (const k of keys) {
    const from = auditValue(o[k]);
    const to = auditValue(n[k]);
    if (from === to) continue; // ghi lại y nguyên thì không phải thay đổi
    out.push({ field: AUDIT_FIELD_LABEL[k] || k, from, to });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Bù tên đối tượng cho nhật ký máy chủ: `activity_logs` chỉ lưu `entity_id`, người đọc cần thấy
 * "TB-2026-938 · TỦ INOX 3 LỚP" chứ không phải một chuỗi uuid.
 */
async function resolveAuditEntities(rows) {
  const projectIds = new Set();
  const taskIds = new Set();
  for (const r of rows) {
    if (!r.entity_id) continue;
    if (r.entity_type === 'project') projectIds.add(r.entity_id);
    else if (r.entity_type === 'task') taskIds.add(r.entity_id);
  }

  const projects = new Map();
  const tasks = new Map();
  try {
    for (const part of chunk([...taskIds])) {
      const { data } = await supabase.from('tasks').select('id, title, project_id').in('id', part);
      for (const t of data || []) {
        tasks.set(t.id, t);
        if (t.project_id) projectIds.add(t.project_id);
      }
    }
    for (const part of chunk([...projectIds])) {
      const { data } = await supabase.from('projects').select('id, code, name').in('id', part);
      for (const pr of data || []) projects.set(pr.id, pr);
    }
  } catch {
    // Thiếu tên thì vẫn trả nhật ký, chỉ là không có nhãn — không để hỏng cả báo cáo.
  }

  return rows.map((r) => {
    let project = null;
    let label = null;
    if (r.entity_type === 'project') {
      project = projects.get(r.entity_id) || null;
      label = project ? [project.code, project.name].filter(Boolean).join(' · ') : null;
    } else if (r.entity_type === 'task') {
      const t = tasks.get(r.entity_id);
      project = t?.project_id ? projects.get(t.project_id) || null : null;
      label = t?.title || null;
    }
    return {
      ...r,
      entity_label: label,
      project: project ? { id: project.id, code: project.code, name: project.name } : null,
      changes: diffAudit(r.old_values, r.new_values),
    };
  });
}

/**
 * 3 nguồn bình luận đang dùng thật. Cột nội dung và cột đối tượng khác tên nhau nên khai báo
 * thành bảng. `ref` dùng để đếm "chạm bao nhiêu đối tượng"; chỉ bình luận Lead/Deal mới là KHÁCH.
 */
const COMMENT_SOURCES = [
  { table: 'crm_lead_comments', body: 'body', label: 'Lead/Deal', soft: true, ref: 'lead_id', isCustomer: true, group: 'customer' },
  { table: 'project_comments', body: 'content', label: 'Dự án', soft: true, ref: 'project_id', group: 'internal' },
  { table: 'crm_assignment_comments', body: 'content', label: 'Phân công', soft: false, ref: 'assignment_id', group: 'internal' },
];

/** `.in()` quá 300 id bị query-guard của dự án chặn — chia nhỏ khi buộc phải lọc theo danh sách. */
function chunk(arr, size = 200) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Tương tác với KHÁCH qua Facebook Messenger và Zalo OA.
 *
 * Hai bảng tin nhắn KHÔNG có company_id (xem 42_facebook_integration.sql, 290_zalo_oa_inbox.sql)
 * nên phạm vi công ty suy ra từ `sent_by` thuộc tập user của công ty. Cũng không lọc `.in(sent_by,
 * …)` vì danh sách user có thể vượt 300 id — đọc theo cửa sổ thời gian rồi lọc ở Node.
 *
 * GIỚI HẠN THẬT: chỉ tin nhắn gửi TỪ app này mới có `sent_by`. Nhánh echo từ webhook (nhân viên
 * trả lời bằng app Facebook/Zalo gốc) không gắn người gửi — những tin đó đếm vào `unattributed`,
 * không chia cho ai, để không khen nhầm người này và bỏ sót người kia.
 */
async function fetchChannelTouches(userIds, companyId, { dateFrom, dateTo }) {
  const userSet = new Set(userIds);
  const empty = { byUser: new Map(), unattributed: { facebook: 0, zalo: 0 }, failed: [] };
  if (!userIds.length) return empty;

  const readMessages = async (table, { dateFrom: df, dateTo: dt }) => {
    const build = () => {
      let q = supabase
        .from(table)
        .select('contact_id, lead_id, sent_by, direction, metadata, created_at')
        .order('created_at', { ascending: false });
      if (df) q = q.gte('created_at', df);
      if (dt) q = q.lt('created_at', dt);
      return q;
    };
    const { rows } = await fetchAllPaged(build);
    return rows;
  };

  const readContacts = async (table, ids, ownerCol) => {
    const map = new Map();
    for (const part of chunk([...ids])) {
      const { data, error } = await supabase.from(table).select(`id, ${ownerCol}, lead_id`).in('id', part);
      if (error) throw new Error(error.message);
      for (const c of data || []) map.set(c.id, { owner: c[ownerCol], leadId: c.lead_id });
    }
    return map;
  };

  const byUser = new Map();
  const unattributed = { facebook: 0, zalo: 0 };
  // Tin gửi đi đến từ đâu — `metadata.sent_via` do routes/facebook.js ghi từ 17/10/2026. Tin cũ
  // hơn không có cờ này nên rơi vào '(chưa ghi nguồn)'; con số đó phải tự co lại theo thời gian.
  const byVia = {};
  const failed = [];
  // Thống kê mức CÔNG TY theo từng fanpage / OA — phần này không phụ thuộc `sent_by` nên luôn
  // đúng, kể cả khi nhân viên trả lời bằng app Facebook/Zalo gốc.
  const pageStats = new Map();

  const touch = (userId, channel, ownerName, customerKey) => {
    if (!byUser.has(userId)) byUser.set(userId, { customers: new Set(), channels: new Map() });
    const u = byUser.get(userId);
    const key = `${channel}::${ownerName}`;
    if (!u.channels.has(key)) u.channels.set(key, { channel, name: ownerName, messages: 0, customers: new Set() });
    const c = u.channels.get(key);
    c.messages += 1;
    if (customerKey) {
      c.customers.add(customerKey);
      u.customers.add(customerKey);
    }
  };

  // `${channel}::${tên page/OA}` -> user_id được cấu hình phụ trách kênh đó.
  const channelOwnerOf = new Map();
  // Thời gian phản hồi khách, theo nhân viên thực sự bấm trả lời.
  const replyByUser = new Map();
  let pendingReplies = 0;

  const sources = [
    { channel: 'Facebook', msg: 'facebook_messages', contact: 'facebook_contacts', ownerCol: 'page_id', pageTable: 'facebook_pages', pageKey: 'page_id', pageName: 'page_name' },
    { channel: 'Zalo', msg: 'zalo_messages', contact: 'zalo_contacts', ownerCol: 'oa_id', pageTable: 'zalo_oa_accounts', pageKey: 'oa_id', pageName: 'oa_name' },
  ];

  for (const src of sources) {
    try {
      const msgs = await readMessages(src.msg, { dateFrom, dateTo });
      const outbound = msgs.filter((m) => m.direction === 'outbound');
      const mine = outbound.filter((m) => m.sent_by && userSet.has(m.sent_by));
      unattributed[src.channel.toLowerCase()] = outbound.length - mine.length;

      const contactMap = await readContacts(src.contact, new Set(msgs.map((m) => m.contact_id).filter(Boolean)), src.ownerCol);

      // `default_lead_owner_id` = nhân viên được CẤU HÌNH phụ trách page/OA này (dùng để gán chủ
      // lead mới — xem routes/facebook.js và database/290_zalo_oa_inbox.sql). Đây là TRÁCH NHIỆM
      // theo cấu hình, KHÔNG phải bằng chứng người đó bấm gửi từng tin — giữ riêng khỏi `channels`
      // (đo hành động thật qua sent_by), không trộn vào nhau.
      const { data: pages } = await supabase
        .from(src.pageTable).select(`${src.pageKey}, ${src.pageName}, default_lead_owner_id, default_company_id`);
      const pageName = new Map((pages || []).map((p) => [p[src.pageKey], p[src.pageName]]));
      for (const p of pages || []) {
        if (p.default_lead_owner_id) {
          channelOwnerOf.set(`${src.channel}::${p[src.pageName] || p[src.pageKey]}`, p.default_lead_owner_id);
        }
      }
      /**
       * Bảng tin nhắn KHÔNG có company_id nên trước đây phần "khách đổ về theo kênh" gom cả page
       * của công ty khác — đo trên dữ liệu thật: xem báo cáo công ty HCB lại thấy page của Phúc Đạt
       * và NextGo. Lọc theo `default_company_id` của page. Page chưa gán công ty thì vẫn giữ (không
       * biết của ai, bỏ đi sẽ giấu mất dữ liệu).
       */
      const pageAllowed = (pid) => {
        if (!companyId) return true;
        const p = (pages || []).find((x) => x[src.pageKey] === pid);
        return !p || !p.default_company_id || p.default_company_id === companyId;
      };

      // Khách = lead nếu đã nối, không thì chính cuộc hội thoại (1 contact = 1 khách).
      const customerOf = (m, c) => m.lead_id || c.leadId || (m.contact_id ? `contact:${m.contact_id}` : null);

      for (const m of msgs) {
        const c = contactMap.get(m.contact_id) || {};
        if (!pageAllowed(c.owner)) continue;
        const owner = pageName.get(c.owner) || c.owner || '(không rõ trang)';
        const key = `${src.channel}::${owner}`;
        if (!pageStats.has(key)) {
          pageStats.set(key, {
            channel: src.channel, name: owner,
            inbound: 0, outbound: 0, customers: new Set(), leads: new Set(),
          });
        }
        const st = pageStats.get(key);
        if (m.direction === 'inbound') {
          st.inbound += 1;
        } else {
          st.outbound += 1;
          const via = m.metadata?.sent_via || (m.sent_by ? 'app' : '(chưa ghi nguồn)');
          byVia[via] = (byVia[via] || 0) + 1;
        }
        const ck = customerOf(m, c);
        if (ck) st.customers.add(ck);
        if (m.lead_id || c.leadId) st.leads.add(m.lead_id || c.leadId);
      }

      for (const m of mine) {
        const c = contactMap.get(m.contact_id) || {};
        touch(m.sent_by, src.channel, pageName.get(c.owner) || c.owner || '(không rõ trang)', customerOf(m, c));
      }

      /**
       * THỜI GIAN PHẢN HỒI KHÁCH: với mỗi tin khách gửi đến, tìm tin nhân viên trả lời KẾ TIẾP
       * trong cùng hội thoại; khoảng cách đó là thời gian chờ của khách. Chỉ tính cho tin trả lời
       * có `sent_by` (trả lời trong phần mềm) — trả lời bằng app Facebook/Zalo gốc không biết ai
       * nên không quy cho ai, đếm riêng vào `no_reply`/không tính.
       * Nhiều tin khách liên tiếp trước 1 lần trả lời: chỉ tính từ tin ĐẦU của chuỗi, vì đó mới là
       * lúc khách bắt đầu chờ.
       */
      const byContact = new Map();
      for (const m of msgs) {
        if (!pageAllowed((contactMap.get(m.contact_id) || {}).owner)) continue;
        if (!byContact.has(m.contact_id)) byContact.set(m.contact_id, []);
        byContact.get(m.contact_id).push(m);
      }
      for (const list of byContact.values()) {
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let waitingSince = null;
        for (const m of list) {
          if (m.direction === 'inbound') {
            if (waitingSince == null) waitingSince = new Date(m.created_at).getTime();
            continue;
          }
          if (waitingSince == null) continue; // tin đi chủ động, không phải trả lời
          const ms = new Date(m.created_at).getTime() - waitingSince;
          waitingSince = null;
          if (ms < 0) continue;
          if (m.sent_by && userSet.has(m.sent_by)) {
            if (!replyByUser.has(m.sent_by)) replyByUser.set(m.sent_by, { count: 0, totalMs: 0, maxMs: 0, slowCount: 0 });
            const r = replyByUser.get(m.sent_by);
            r.count += 1;
            r.totalMs += ms;
            if (ms > r.maxMs) r.maxMs = ms;
            if (ms > SLOW_REPLY_MS) r.slowCount += 1;
          }
        }
        // Chuỗi kết thúc mà vẫn còn khách đang chờ = chưa ai trả lời tới thời điểm đọc báo cáo.
        if (waitingSince != null) pendingReplies += 1;
      }
    } catch (e) {
      failed.push({ source: src.channel, reason: e.message });
    }
  }

  /**
   * Tên người phụ trách kênh — tra RIÊNG, không lấy từ danh sách nhân viên công ty. Đo trên dữ
   * liệu thật: mọi page của Phúc Đạt đều do một người có `company_id = NULL` phụ trách, nếu chỉ
   * tra trong tập user của công ty thì cột "Người phụ trách" trống trơn dù đã gán đầy đủ.
   */
  const ownerNames = new Map();
  const ownerIds = [...new Set([...channelOwnerOf.values()])].filter(Boolean);
  if (ownerIds.length) {
    try {
      for (const part of chunk(ownerIds)) {
        const { data } = await supabase.from('users').select('id, full_name, email').in('id', part);
        for (const u of data || []) ownerNames.set(u.id, u.full_name || u.email);
      }
    } catch { /* thiếu tên thì UI hiện id, không làm hỏng báo cáo */ }
  }

  const channels = [...pageStats.values()]
    .map((st) => ({
      channel: st.channel,
      name: st.name,
      inbound: st.inbound,
      outbound: st.outbound,
      customers: st.customers.size,
      leads: st.leads.size, // đã nối được sang crm_leads
      // Ai được cấu hình phụ trách kênh này (có thể null nếu chưa đặt trong trang thiết lập).
      owner_user_id: channelOwnerOf.get(`${st.channel}::${st.name}`) || null,
      owner_name: ownerNames.get(channelOwnerOf.get(`${st.channel}::${st.name}`)) || null,
    }))
    .sort((a, b) => b.customers - a.customers);

  /**
   * Kênh mà user được CẤU HÌNH phụ trách, kèm lưu lượng của kênh đó. Khác `byUser` (đo hành động
   * thật qua `sent_by`): ở đây một người có thể "phụ trách 1.200 khách" mà chưa tự tay gửi tin nào
   * — con số nói về phạm vi trách nhiệm, không phải khối lượng đã làm.
   */
  const ownedByUser = new Map();
  for (const ch of channels) {
    if (!ch.owner_user_id || !userSet.has(ch.owner_user_id)) continue;
    if (!ownedByUser.has(ch.owner_user_id)) ownedByUser.set(ch.owner_user_id, []);
    ownedByUser.get(ch.owner_user_id).push(ch);
  }

  return { byUser, unattributed, failed, channels, byVia, ownedByUser, replyByUser, pendingReplies };
}

/**
 * Bình luận CÔNG KHAI trên Facebook (post/quảng cáo) — khác hẳn tin nhắn Messenger riêng đã đọc ở
 * fetchChannelTouches phía trên. `facebook_comments` không có company_id -> suy qua
 * `facebook_pages.page_id`. Zalo OA KHÔNG có khái niệm bình luận công khai (chỉ chat riêng, đã
 * đọc ở fetchChannelTouches) nên không có nhánh tương ứng ở đây.
 *
 * GIỚI HẠN THẬT: cột `replied_by` chỉ có từ migration 725 trở đi (xem file đó + route
 * POST /comments/:id/reply trong routes/facebook.js). Bình luận đã `replied=true` TRƯỚC migration
 * này không biết nhân viên nào bấm — đếm vào `company.attributed` chứ không gán cho ai, để không
 * suy đoán ngược và không khen nhầm người này bỏ sót người kia.
 */
async function fetchFacebookCommentStats(userIds, companyId, { dateFrom, dateTo }) {
  const userSet = new Set(userIds);
  const empty = { byUser: new Map(), company: { total: 0, replied: 0, unreplied: 0, attributed: 0, by_page: [] }, failed: null };

  const build = () => {
    let q = supabase
      .from('facebook_comments')
      .select('page_id, replied, replied_by, is_from_page, created_at')
      .order('created_at', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lt('created_at', dateTo);
    return q;
  };

  try {
    const { rows } = await fetchAllPaged(build);
    // Bình luận do chính page viết (is_from_page) là OUTPUT, không phải khách chạm vào — loại khỏi tổng.
    const customerRows = rows.filter((r) => !r.is_from_page);

    const { data: pages } = await supabase.from('facebook_pages').select('page_id, page_name, default_company_id');
    const pageInfo = new Map((pages || []).map((p) => [p.page_id, p]));
    const scoped = companyId
      ? customerRows.filter((r) => pageInfo.get(r.page_id)?.default_company_id === companyId)
      : customerRows;

    const byUser = new Map();
    const byPage = new Map();
    let replied = 0;
    let attributed = 0;
    for (const r of scoped) {
      if (r.replied) replied += 1;
      const pname = pageInfo.get(r.page_id)?.page_name || r.page_id;
      byPage.set(pname, (byPage.get(pname) || 0) + 1);
      if (r.replied_by && userSet.has(r.replied_by)) {
        attributed += 1;
        byUser.set(r.replied_by, (byUser.get(r.replied_by) || 0) + 1);
      }
    }

    return {
      byUser,
      company: {
        total: scoped.length,
        replied,
        unreplied: scoped.length - replied,
        attributed,
        by_page: [...byPage.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      },
      failed: null,
    };
  } catch (e) {
    return { ...empty, failed: e.message };
  }
}

/**
 * Đóng gói tương tác khách của 1 user cho UI.
 * `channels` = kênh người này THỰC SỰ gửi tin (theo `sent_by`).
 * `owned_channels` = kênh người này được CẤU HÌNH phụ trách (page/OA `default_lead_owner_id`) —
 * hai thứ khác nhau, cố ý để riêng để không biến "được giao phụ trách" thành "đã làm".
 */
function packCustomers(t, leadCommentCustomers, ownedChannels) {
  const customers = new Set(t ? t.customers : []);
  for (const id of leadCommentCustomers || []) customers.add(id);
  const channels = t
    ? [...t.channels.values()]
        .map((c) => ({ channel: c.channel, name: c.name, messages: c.messages, customers: c.customers.size }))
        .sort((a, b) => b.messages - a.messages)
    : [];
  const owned = ownedChannels || [];
  return {
    total: customers.size,
    messages: channels.reduce((s, c) => s + c.messages, 0),
    comment_customers: (leadCommentCustomers || new Set()).size,
    channels,
    owned_channels: owned,
    owned_customers: owned.reduce((s, c) => s + c.customers, 0),
    owned_inbound: owned.reduce((s, c) => s + c.inbound, 0),
    owned_outbound: owned.reduce((s, c) => s + c.outbound, 0),
  };
}

async function fetchCommentRows(userIds, { dateFrom, dateTo }) {
  if (!userIds.length) return { rows: [], failed: [] };
  const failed = [];
  const all = await Promise.all(
    COMMENT_SOURCES.map(async (src) => {
      // `parent_id` chỉ có sau migration 172/195/248, `deleted_at` sau 248 — DB chưa chạy đủ thì
      // select đầy đủ sẽ lỗi. Thử bản đầy đủ trước, hỏng thì hạ xuống bộ cột chắc chắn tồn tại,
      // KHÔNG nuốt lỗi thành 0 bình luận (số 0 giả còn nguy hiểm hơn thiếu cột).
      const build = (full) => () => {
        let q = supabase
          .from(src.table)
          .select(full
            ? `user_id, created_at, parent_id, ${src.ref}, ${src.body}`
            : `user_id, created_at, ${src.ref}, ${src.body}`)
          .in('user_id', userIds)
          .order('created_at', { ascending: false });
        if (full && src.soft) q = q.is('deleted_at', null);
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lt('created_at', dateTo);
        return q;
      };
      const pack = (rows, degraded) =>
        rows.map((r) => ({
          user_id: r.user_id,
          created_at: r.created_at,
          is_reply: degraded ? false : r.parent_id != null,
          length: (r[src.body] || '').length,
          source: src.label,
          ref: r[src.ref] || null,
          is_customer: !!src.isCustomer,
          group: src.group, // 'internal' (Dự án/Phân công) | 'customer' (Lead/Deal) — tách rạch ròi 2 việc khác nhau
        }));
      try {
        const { rows } = await fetchAllPaged(build(true));
        return pack(rows, false);
      } catch (e1) {
        try {
          const { rows } = await fetchAllPaged(build(false));
          failed.push({ source: src.label, reason: `thiếu cột (${e1.message}) — bỏ lọc đã xoá & cờ trả lời` });
          return pack(rows, true);
        } catch (e2) {
          failed.push({ source: src.label, reason: e2.message });
          return [];
        }
      }
    })
  );
  return { rows: all.flat(), failed };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOW_REPLY_MS = 60 * 60 * 1000; // trả lời khách sau hơn 1 giờ = chậm

/**
 * Việc đã hoàn thành trong kỳ — đối trọng với `overdue_tasks` để không chỉ nhìn mặt xấu. Kèm
 * THỜI GIAN hoàn thành so với hạn: sớm hay trễ bao nhiêu ngày. Việc không có `deadline` thì không
 * tính sớm/trễ (không có mốc để so), vẫn cộng vào tổng đã xong.
 */
async function fetchDoneByAssignee(userIds, companyId, { dateFrom, dateTo }) {
  if (!userIds.length) return {};
  const userSet = new Set(userIds);
  // Phải phân trang: `.limit(60000)` vô nghĩa vì PostgREST chặn 1000 dòng/request — công ty có
  // hơn 1000 việc xong trong kỳ sẽ bị đếm thiếu mà không báo gì.
  const build = () => {
    let q = supabase
      .from('unified_tasks_v')
      .select('assignee_id, completed_at, deadline, created_at')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    else q = q.in('assignee_id', userIds);
    if (dateFrom) q = q.gte('completed_at', dateFrom);
    if (dateTo) q = q.lt('completed_at', dateTo);
    return q;
  };
  const { rows } = await fetchAllPaged(build);
  const byUser = {};
  const ensure = (uid) => {
    if (!byUser[uid]) {
      byUser[uid] = {
        total: 0, on_time: 0, late: 0, no_deadline: 0, late_days_sum: 0, early_days_sum: 0,
        // Thời gian XỬ LÝ: từ lúc tạo việc đến lúc xong — khác với sớm/trễ hạn (so với deadline).
        handle_count: 0, handle_hours_sum: 0,
      };
    }
    return byUser[uid];
  };
  for (const row of rows) {
    if (!userSet.has(row.assignee_id)) continue;
    const u = ensure(row.assignee_id);
    u.total += 1;
    if (row.created_at) {
      const h = (new Date(row.completed_at).getTime() - new Date(row.created_at).getTime()) / 3600000;
      if (h >= 0) { u.handle_count += 1; u.handle_hours_sum += h; }
    }
    if (!row.deadline) { u.no_deadline += 1; continue; }
    const diffDays = (new Date(row.completed_at).getTime() - new Date(row.deadline).getTime()) / DAY_MS;
    if (diffDays > 0) { u.late += 1; u.late_days_sum += diffDays; }
    else { u.on_time += 1; u.early_days_sum += -diffDays; }
  }
  return byUser;
}

/**
 * NHIỆM VỤ PHÁT SINH — nằm ở `crm_assignments` có `phat_sinh_kind` (không null), KHÔNG lấy được
 * qua `unified_tasks_v`: view đó gộp crm_assignments nhưng bỏ cột `phat_sinh_kind` và gán cứng
 * `task_kind='Giao việc'`, nên nhìn trên view không phân biệt được phát sinh với giao việc thường.
 * Vì vậy phải truy vấn thẳng bảng gốc.
 *
 * `phat_sinh_kind` lưu UUID của `shared_workspace_phat_sinh_kinds` HOẶC slug cũ (tempered_glass…)
 * — tra bảng danh mục để đổi sang tên tiếng Việt, không khớp thì giữ nguyên giá trị thô.
 */
async function fetchPhatSinhByAssignee(userIds, companyId, { dateFrom, dateTo }) {
  if (!userIds.length) return { byUser: new Map(), failed: null };
  const userSet = new Set(userIds);
  const now = Date.now();

  try {
    const build = () => {
      let q = supabase
        .from('crm_assignments')
        .select('assignee_id, status, deadline, completed_at, created_at, phat_sinh_kind')
        .not('phat_sinh_kind', 'is', null)
        .order('created_at', { ascending: false });
      if (companyId) q = q.eq('company_id', companyId);
      else q = q.in('assignee_id', userIds);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lt('created_at', dateTo);
      return q;
    };
    const { rows } = await fetchAllPaged(build);

    // Danh mục loại phát sinh -> tên hiển thị (gồm cả loại dùng chung company_id IS NULL).
    const kindName = new Map();
    try {
      let kq = supabase.from('shared_workspace_phat_sinh_kinds').select('id, slug, name');
      if (companyId) kq = kq.or(`company_id.is.null,company_id.eq.${companyId}`);
      const { data: kinds } = await kq;
      for (const k of kinds || []) {
        if (k.id) kindName.set(String(k.id), k.name);
        if (k.slug) kindName.set(String(k.slug).toLowerCase(), k.name);
      }
    } catch { /* thiếu bảng danh mục thì hiện giá trị thô, không làm hỏng cả báo cáo */ }

    const byUser = new Map();
    for (const r of rows) {
      if (!userSet.has(r.assignee_id)) continue;
      if (!byUser.has(r.assignee_id)) {
        byUser.set(r.assignee_id, { total: 0, open: 0, overdue: 0, done: 0, byKind: new Map() });
      }
      const u = byUser.get(r.assignee_id);
      const st = String(r.status || '').toLowerCase();
      const closed = st === 'completed' || st === 'cancelled';
      u.total += 1;
      if (closed) u.done += 1;
      else {
        u.open += 1;
        if (r.deadline && new Date(r.deadline).getTime() < now) u.overdue += 1;
      }
      const raw = String(r.phat_sinh_kind || '');
      bump(u.byKind, kindName.get(raw) || kindName.get(raw.toLowerCase()) || raw || '(không rõ loại)');
    }
    return { byUser, failed: null };
  } catch (e) {
    return { byUser: new Map(), failed: e.message };
  }
}

/**
 * THỜI GIAN XỬ LÝ LEAD/DEAL — `crm_lead_stage_history` (database/145) ghi mỗi lần đổi giai đoạn
 * kèm `duration_seconds` của giai đoạn vừa rời và `changed_by` (ai bấm chuyển). Quy cho người
 * BẤM CHUYỂN, nghĩa là "người này đẩy lead qua giai đoạn sau bao lâu", không phải "ai sở hữu lead".
 * Chỉ tính dòng đã đóng (`exited_at` có giá trị) vì dòng đang mở chưa biết tổng thời gian.
 */
async function fetchLeadStageTimeByUser(userIds, { dateFrom, dateTo }) {
  if (!userIds.length) return { byUser: new Map(), failed: null };
  const userSet = new Set(userIds);
  try {
    const build = () => {
      let q = supabase
        .from('crm_lead_stage_history')
        .select('changed_by, duration_seconds, exited_at')
        .not('changed_by', 'is', null)
        .not('duration_seconds', 'is', null)
        .order('exited_at', { ascending: false });
      if (dateFrom) q = q.gte('exited_at', dateFrom);
      if (dateTo) q = q.lt('exited_at', dateTo);
      return q;
    };
    const { rows } = await fetchAllPaged(build);
    const byUser = new Map();
    for (const r of rows) {
      if (!userSet.has(r.changed_by)) continue;
      if (!byUser.has(r.changed_by)) byUser.set(r.changed_by, { count: 0, hoursSum: 0, maxHours: 0 });
      const u = byUser.get(r.changed_by);
      const h = Number(r.duration_seconds) / 3600;
      if (!Number.isFinite(h) || h < 0) continue;
      u.count += 1;
      u.hoursSum += h;
      if (h > u.maxHours) u.maxHours = h;
    }
    return { byUser, failed: null };
  } catch (e) {
    return { byUser: new Map(), failed: e.message };
  }
}

/** Gộp 4 nhóm chỉ số thời gian thành payload phẳng cho UI. */
function packTiming2(reply, leadStage, done, habit) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const perDay = habit && habit.days_active ? habit.active_minutes / habit.days_active : 0;
  return {
    // 1. Phản hồi khách (phút)
    reply_count: reply?.count || 0,
    reply_avg_min: reply?.count ? r1(reply.totalMs / reply.count / 60000) : 0,
    reply_max_min: reply?.maxMs ? r1(reply.maxMs / 60000) : 0,
    reply_slow_count: reply?.slowCount || 0,
    // 2. Làm việc thực tế: phút thao tác trung bình mỗi ngày có mặt
    work_minutes_per_day: Math.round(perDay),
    // 3. Xử lý công việc: từ lúc tạo tới lúc xong (giờ)
    handle_count: done?.handle_count || 0,
    handle_hours_avg: done?.handle_count ? r1(done.handle_hours_sum / done.handle_count) : 0,
    // 4. Xử lý lead/deal: thời gian ở 1 giai đoạn trước khi đẩy sang giai đoạn sau (giờ)
    stage_moves: leadStage?.count || 0,
    stage_hours_avg: leadStage?.count ? r1(leadStage.hoursSum / leadStage.count) : 0,
    stage_hours_max: leadStage?.maxHours ? r1(leadStage.maxHours) : 0,
  };
}

function packPhatSinh(p) {
  if (!p) return { total: 0, open: 0, overdue: 0, done: 0, by_kind: [] };
  return {
    total: p.total,
    open: p.open,
    overdue: p.overdue,
    done: p.done,
    by_kind: topEntries(p.byKind, 8, 'kind'),
  };
}

/**
 * guide_chat_log có sẵn company_id — lọc thẳng theo công ty, KHÔNG kèm danh sách user_id
 * (IN hàng trăm uuid làm planner bỏ index). Lọc lại theo tập user ở Node.
 */
async function fetchGuideRows(userIds, companyId, { dateFrom, dateTo }) {
  if (!userIds.length) return [];
  const userSet = new Set(userIds);
  const build = () => {
    let q = supabase
      .from('guide_chat_log')
      .select('user_id, path, question, turn_no, thread_id, has_failed_step, created_at')
      .order('created_at', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    else q = q.in('user_id', userIds);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lt('created_at', dateTo);
    return q;
  };
  const { rows } = await fetchAllPaged(build);
  return rows.filter((r) => userSet.has(r.user_id));
}

/**
 * unified_tasks_v là view gộp 3 nhánh — mỗi điều kiện thừa đều nhân lên 3 lần. Lọc theo
 * company_id + deadline (cột có sẵn trên view), lọc assignee ở Node.
 */
/** Kèm THỜI GIAN quá hạn — trễ bao nhiêu ngày rồi, không chỉ đếm số việc. */
async function fetchOverdueByAssignee(userIds, companyId) {
  if (!userIds.length) return {};
  const userSet = new Set(userIds);
  const now = Date.now();
  const build = () => {
    let q = supabase
      .from('unified_tasks_v')
      .select('assignee_id, status, deadline')
      .not('status', 'in', '(done,completed,cancelled)')
      .not('deadline', 'is', null)
      .lt('deadline', new Date().toISOString())
      .order('deadline', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    else q = q.in('assignee_id', userIds);
    return q;
  };
  const { rows } = await fetchAllPaged(build);
  const byUser = {};
  /**
   * Việc quá hạn CỦA CÔNG TY nhưng người thực hiện không nằm trong danh sách nhân viên công ty
   * (chưa giao ai, hoặc giao cho người không gắn company_id / người công ty khác). Đo trên dữ
   * liệu thật: công ty HCB có 210 việc quá hạn mà TẤT CẢ đều rơi vào nhóm này — nếu chỉ cộng
   * theo nhân viên thì báo cáo hiện 0, người đọc tưởng không còn việc trễ nào. Phải nói ra.
   */
  let unassigned = 0;
  for (const row of rows) {
    if (!userSet.has(row.assignee_id)) { unassigned += 1; continue; }
    if (!byUser[row.assignee_id]) byUser[row.assignee_id] = { count: 0, days_sum: 0 };
    const u = byUser[row.assignee_id];
    u.count += 1;
    u.days_sum += (now - new Date(row.deadline).getTime()) / DAY_MS;
  }
  return { byUser, unassigned, total: rows.length };
}

/**
 * Bỏ query string trước khi gộp nhóm theo path — `user_activity_log.path` lưu kèm
 * `?filter=...` (window.location.search), còn `guide_chat_log.path` chỉ lưu pathname. Không chuẩn
 * hoá thì cùng 1 màn hình nhưng đổi filter/trang sẽ bị tính thành nhiều path khác nhau, loãng số
 * liệu idle và không gộp được với path của guide_chat_log sau này.
 */
function normalizePath(path) {
  if (!path) return '(không rõ)';
  const idx = path.indexOf('?');
  return idx === -1 ? path : path.slice(0, idx);
}

/** Idle theo path: cộng dồn khoảng cách > ngưỡng giữa 2 event liên tiếp của cùng user, có trần. */
function computeIdleByUser(activityRows) {
  const byUser = new Map();
  let prevUser = null;
  let prevAt = null;
  for (const row of activityRows) {
    const at = new Date(row.created_at).getTime();
    if (row.user_id === prevUser && prevAt != null) {
      const gap = at - prevAt;
      if (gap > IDLE_THRESHOLD_MS) {
        const counted = Math.min(gap, IDLE_GAP_CAP_MS);
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, { totalMs: 0, byPath: new Map() });
        const entry = byUser.get(row.user_id);
        entry.totalMs += counted;
        const path = normalizePath(row.path);
        entry.byPath.set(path, (entry.byPath.get(path) || 0) + counted);
      }
    }
    prevUser = row.user_id;
    prevAt = at;
  }
  return byUser;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // log lưu timestamptz UTC, báo cáo đọc theo giờ VN
const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'submit_form', 'export']);
const SESSION_BREAK_MS = 30 * 60 * 1000; // không có session_id thì 30 phút im lặng = phiên mới

/** Trả về {date:'YYYY-MM-DD', hour:0-23} theo giờ VN từ 1 mốc ISO. */
function vnParts(iso) {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

function bump(map, key, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function topEntries(map, limit, keyName = 'key') {
  return [...map.entries()]
    .map(([k, v]) => ({ [keyName]: k, events: v }))
    .sort((a, b) => b.events - a.events)
    .slice(0, limit);
}

/**
 * Chi tiết thói quen theo từng user — tất cả suy ra từ 1 lần quét activityRows đã sắp xếp
 * (user_id, created_at tăng dần). Không query thêm, không bảng mới.
 */
function computeHabitByUser(activityRows) {
  const byUser = new Map();
  let prevUser = null;
  let prevAt = null;

  for (const row of activityRows) {
    const at = new Date(row.created_at).getTime();
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        actions: new Map(),
        modules: new Map(),
        features: new Map(),
        screens: new Map(),
        entities: new Map(),
        // Màn hình của các dòng KHÔNG có module — để trả lời thẳng "(không rõ) là ở đâu?" ngay
        // trên báo cáo, thay vì bắt người xem bấm vào mới biết. Các dòng này là log cũ ghi trước
        // khi ROUTE_LABELS được mở rộng (xem useActivityRouteTracker.js).
        unknownPaths: new Map(),
        recent: [],
        sessionIds: new Set(),
        days: new Map(),
        hours: new Array(24).fill(0),
        activeMs: 0,
        sessionBreaks: 1,
        writeEvents: 0,
        importantEvents: 0,
        firstAt: row.created_at,
        lastAt: row.created_at,
      });
    }
    const h = byUser.get(row.user_id);
    const { date, hour } = vnParts(row.created_at);

    bump(h.actions, row.action_type || '(không rõ)');
    bump(h.modules, row.module || '(không rõ)');
    if (row.feature) bump(h.features, `${row.module || '?'} · ${row.feature}`);
    bump(h.screens, normalizePath(row.path));
    if (!row.module) bump(h.unknownPaths, normalizePath(row.path));
    if (row.entity_type) bump(h.entities, row.entity_type);
    bump(h.days, date);
    // rows đã sắp tăng dần theo thời gian -> giữ 15 bản ghi cuối = mới nhất, cho khung log tail.
    h.recent.push({
      at: row.created_at,
      action: row.action_type,
      module: row.module || null,
      path: normalizePath(row.path),
      label: row.label || null,
    });
    if (h.recent.length > 15) h.recent.shift();
    h.hours[hour] += 1;
    if (row.session_id) h.sessionIds.add(row.session_id);
    if (WRITE_ACTIONS.has(row.action_type)) h.writeEvents += 1;
    if (Number(row.importance) >= 2) h.importantEvents += 1;
    if (row.created_at < h.firstAt) h.firstAt = row.created_at;
    if (row.created_at > h.lastAt) h.lastAt = row.created_at;

    if (row.user_id === prevUser && prevAt != null) {
      const gap = at - prevAt;
      if (gap <= IDLE_THRESHOLD_MS) h.activeMs += gap; // thao tác liên tục = đang làm thật
      else if (gap > SESSION_BREAK_MS) h.sessionBreaks += 1;
    }
    prevUser = row.user_id;
    prevAt = at;
  }
  return byUser;
}

/** CRUD thật theo user: gộp action × entity_type từ activity_logs. */
function computeCrudByUser(auditRows) {
  const byUser = new Map();
  for (const row of auditRows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { total: 0, byAction: new Map(), byEntity: new Map(), matrix: new Map(), recent: [] });
    }
    const c = byUser.get(row.user_id);
    const action = (row.action || 'other').toLowerCase();
    const entity = row.entity_type || '(không rõ)';
    c.total += 1;
    bump(c.byAction, action);
    bump(c.byEntity, entity);
    bump(c.matrix, `${action}::${entity}`);
    if (c.recent.length < 12) {
      c.recent.push({
        at: row.created_at,
        action,
        entity,
        description: row.description || null,
        entity_id: row.entity_id || null,
        entity_label: row.entity_label || null,
        project: row.project || null,
        changes: row.changes || [],
      });
    }
  }
  return byUser;
}

function emptyCommentBucket() {
  return { total: 0, replies: 0, chars: 0, bySource: new Map(), hours: new Array(24).fill(0) };
}

/**
 * Bình luận theo user, tách riêng theo Ý NGHĨA chứ không chỉ theo bảng nguồn:
 *   - 'internal' = Dự án + Phân công — trao đổi nội bộ giữa nhân viên, không liên quan khách hàng
 *   - 'customer' = Lead/Deal — trao đổi gắn với khách hàng cụ thể (có thể đi kèm việc chốt đơn)
 * Gộp chung 2 nhóm này vào 1 con số (như trước) sẽ khiến "giao tiếp nội bộ" và "giao tiếp khách
 * hàng" nhìn như cùng một việc — đây là lý do tách bucket theo `row.group` thay vì chỉ theo label.
 */
function computeCommentByUser(commentRows) {
  const byUser = new Map();
  for (const row of commentRows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { internal: emptyCommentBucket(), customer: emptyCommentBucket() });
    }
    const c = byUser.get(row.user_id)[row.group] || byUser.get(row.user_id).internal;
    c.total += 1;
    if (row.is_reply) c.replies += 1;
    c.chars += row.length || 0;
    bump(c.bySource, row.source);
    c.hours[vnParts(row.created_at).hour] += 1;
  }
  return byUser;
}

function packCrud(c) {
  if (!c) return { total: 0, by_action: [], by_entity: [], matrix: [], recent: [] };
  return {
    total: c.total,
    by_action: topEntries(c.byAction, 12, 'action'),
    by_entity: topEntries(c.byEntity, 12, 'entity'),
    matrix: [...c.matrix.entries()]
      .map(([k, events]) => ({ action: k.split('::')[0], entity: k.split('::')[1], events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 40),
    recent: c.recent,
  };
}

function packCommentBucket(c) {
  if (!c) return { total: 0, replies: 0, avg_chars: 0, by_source: [], hours: new Array(24).fill(0) };
  return {
    total: c.total,
    replies: c.replies,
    avg_chars: c.total ? Math.round(c.chars / c.total) : 0,
    by_source: topEntries(c.bySource, 6, 'source'),
    hours: c.hours,
  };
}

/** Trả về 2 nhóm riêng — xem computeCommentByUser để biết vì sao tách theo ý nghĩa thay vì gộp. */
function packComments(byGroup) {
  return {
    internal: packCommentBucket(byGroup?.internal),
    customer: packCommentBucket(byGroup?.customer),
  };
}

/** Đóng gói thói quen 1 user thành payload gọn cho UI. */
function packHabit(h) {
  if (!h) {
    return {
      sessions: 0, days_active: 0, active_minutes: 0, write_events: 0, important_events: 0,
      actions: [], modules: [], features: [], top_screens: [], unknown_paths: [], entities: [], recent: [],
      hours: new Array(24).fill(0), by_day: [], peak_hour: null, first_at: null, last_at: null,
    };
  }
  const peakHour = h.hours.reduce((best, v, i) => (v > h.hours[best] ? i : best), 0);
  return {
    sessions: h.sessionIds.size || h.sessionBreaks,
    days_active: h.days.size,
    active_minutes: Math.round(h.activeMs / 60000),
    write_events: h.writeEvents,
    important_events: h.importantEvents,
    actions: topEntries(h.actions, 20, 'action_type'),
    modules: topEntries(h.modules, 10, 'module'),
    features: topEntries(h.features, 8, 'feature'),
    top_screens: topEntries(h.screens, 8, 'path'),
    unknown_paths: topEntries(h.unknownPaths, 6, 'path'),
    entities: topEntries(h.entities, 10, 'entity'),
    recent: [...h.recent].reverse(), // mới nhất lên đầu
    hours: h.hours,
    by_day: [...h.days.entries()].map(([date, events]) => ({ date, events })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    peak_hour: h.hours[peakHour] ? peakHour : null,
    first_at: h.firstAt,
    last_at: h.lastAt,
  };
}

/** Gộp 2 object thô (overdue/done theo user) thành field phẳng cho UI — làm tròn 1 chữ số thập phân. */
function packTiming(overdue, done) {
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    overdue_tasks: overdue?.count || 0,
    overdue_days_avg: overdue?.count ? round1(overdue.days_sum / overdue.count) : 0,
    done_tasks: done?.total || 0,
    done_on_time: done?.on_time || 0,
    done_late: done?.late || 0,
    done_no_deadline: done?.no_deadline || 0,
    late_days_avg: done?.late ? round1(done.late_days_sum / done.late) : 0,
    early_days_avg: done?.on_time ? round1(done.early_days_sum / done.on_time) : 0,
  };
}

function countActiveEvents(activityRows) {
  const byUser = new Map();
  for (const row of activityRows) {
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + 1);
  }
  return byUser;
}

/** Khó khăn: bước trợ lý bị hỏng, hoặc hỏi lại nhiều lần cùng 1 thread (coi là cùng 1 việc). */
function computeDifficultySignals(guideRows) {
  const byUser = new Map();
  const maxTurnByThread = new Map();
  for (const row of guideRows) {
    const prevMax = maxTurnByThread.get(row.thread_id) || 0;
    maxTurnByThread.set(row.thread_id, Math.max(prevMax, Number(row.turn_no) || 0));
  }

  for (const row of guideRows) {
    const signals = [];
    if (row.has_failed_step) signals.push('failed_step');
    const threadMaxTurn = maxTurnByThread.get(row.thread_id) || 0;
    if (threadMaxTurn >= REPEAT_QUESTION_TURN && Number(row.turn_no) === threadMaxTurn) {
      signals.push('repeated_question');
    }
    if (!signals.length) continue;

    if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map());
    const byPath = byUser.get(row.user_id);
    const path = normalizePath(row.path);
    for (const kind of signals) {
      const key = `${path}::${kind}`;
      if (!byPath.has(key)) byPath.set(key, { path, kind, count: 0, sample_question: row.question });
      byPath.get(key).count += 1;
    }
  }
  return byUser;
}

async function getUserBehaviorInsight({ companyId, dateFrom, dateTo } = {}) {
  const win = resolveWindow({ dateFrom, dateTo });
  const users = await fetchCompanyUsers(companyId);
  const userIds = users.map((u) => u.id);

  const [activity, guideRows, overdue, auditRows, comments, doneByUser, touches, fbComments, phatSinh,
    moduleMap, leadStage] = await Promise.all([
    fetchActivityRows(userIds, win),
    fetchGuideRows(userIds, companyId, win),
    fetchOverdueByAssignee(userIds, companyId),
    fetchAuditRows(userIds, win),
    fetchCommentRows(userIds, win),
    fetchDoneByAssignee(userIds, companyId, win),
    fetchChannelTouches(userIds, companyId, win),
    fetchFacebookCommentStats(userIds, companyId, win),
    fetchPhatSinhByAssignee(userIds, companyId, win),
    fetchUserModules(userIds),
    fetchLeadStageTimeByUser(userIds, win),
  ]);
  const activityRows = activity.rows;
  const commentRows = comments.rows;
  // Bu ten du an/cong viec + liet ke truong da sua cho nhat ky may chu.
  const auditRich = await resolveAuditEntities(auditRows);

  const idleByUser = computeIdleByUser(activityRows);
  const activeEventsByUser = countActiveEvents(activityRows);
  const difficultyByUser = computeDifficultySignals(guideRows);
  const habitByUser = computeHabitByUser(activityRows);
  const crudByUser = computeCrudByUser(auditRich);
  const commentByUser = computeCommentByUser(commentRows);
  const guideCountByUser = new Map();
  for (const row of guideRows) bump(guideCountByUser, row.user_id);

  // Khách chạm qua bình luận Lead/Deal — gộp chung với khách chạm qua Facebook/Zalo.
  const leadCustomersByUser = new Map();
  for (const row of commentRows) {
    if (!row.is_customer || !row.ref) continue;
    if (!leadCustomersByUser.has(row.user_id)) leadCustomersByUser.set(row.user_id, new Set());
    leadCustomersByUser.get(row.user_id).add(row.ref);
  }

  const items = users
    .map((u) => {
      const idle = idleByUser.get(u.id);
      const topIdlePaths = idle
        ? [...idle.byPath.entries()]
            .map(([path, ms]) => ({ path, minutes: Math.round(ms / 60000) }))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 5)
        : [];
      const difficultySignals = difficultyByUser.has(u.id)
        ? [...difficultyByUser.get(u.id).values()].sort((a, b) => b.count - a.count)
        : [];

      const habit = packHabit(habitByUser.get(u.id));
      const co = Array.isArray(u.companies) ? u.companies[0] : u.companies;
      const dept = Array.isArray(u.departments) ? u.departments[0] : u.departments;

      return {
        user_id: u.id,
        name: u.full_name || u.email || u.id,
        email: u.email || null,
        role: u.role || null,
        position: u.position || null,
        // Nhóm theo tổ chức — company_id có thể null (admin hệ thống), khi đó hiện "Chưa gán công ty".
        company_id: u.company_id || null,
        company_name: co?.short_name || co?.name || null,
        department_name: dept?.name || null,
        modules: resolveUserModules(u.id, u.role, moduleMap),
        timing: packTiming2(touches.replyByUser?.get(u.id), leadStage.byUser.get(u.id), doneByUser[u.id], habit),
        active_events: activeEventsByUser.get(u.id) || 0,
        idle_minutes: idle ? Math.round(idle.totalMs / 60000) : 0,
        top_idle_paths: topIdlePaths,
        difficulty_signals: difficultySignals,
        guide_questions: guideCountByUser.get(u.id) || 0,
        ...packTiming(overdue.byUser[u.id], doneByUser[u.id]),
        habit,
        crud: packCrud(crudByUser.get(u.id)),
        comments: packComments(commentByUser.get(u.id)),
        customers: packCustomers(touches.byUser.get(u.id), leadCustomersByUser.get(u.id), touches.ownedByUser?.get(u.id)),
        // Chỉ có từ migration 725 trở đi — xem fetchFacebookCommentStats để biết vì sao không suy
        // đoán ngược người trả lời cho bình luận cũ hơn.
        fb_comments_replied: fbComments.byUser.get(u.id) || 0,
        phat_sinh: packPhatSinh(phatSinh.byUser.get(u.id)),
      };
    })
    .filter(
      (r) =>
        r.active_events > 0 ||
        r.difficulty_signals.length > 0 ||
        r.overdue_tasks > 0 ||
        r.crud.total > 0 ||
        r.comments.internal.total > 0 ||
        r.comments.customer.total > 0 ||
        r.customers.total > 0 ||
        // Người được giao phụ trách page/OA vẫn phải hiện ra, kể cả khi chưa tự tay gửi tin nào —
        // đó chính là trường hợp cần nhìn thấy nhất (có trách nhiệm nhưng không có hoạt động).
        r.customers.owned_channels.length > 0 ||
        r.phat_sinh.total > 0
    )
    .sort((a, b) => b.active_events - a.active_events);

  return {
    range: { from: win.dateFrom, to: win.dateTo },
    sources: {
      activity_rows: activityRows.length,
      audit_rows: auditRows.length,
      comment_rows: commentRows.length,
      guide_rows: guideRows.length,
      // true = chạm trần ROW_LIMIT, số liệu thiếu phần cũ nhất -> UI phải cảnh báo, không giấu.
      truncated: activity.truncated,
      row_limit: ROW_LIMIT,
      // Nguồn bình luận đọc không trọn vẹn — để UI nói rõ thay vì hiện 0 như thể không ai viết.
      comment_issues: comments.failed,
      channel_issues: touches.failed,
      // Khách đổ về theo từng fanpage / Zalo OA — mức công ty, không phụ thuộc `sent_by`.
      channels: touches.channels || [],
      // Tin nhắn gửi đi KHÔNG gắn người gửi (trả lời bằng app Facebook/Zalo gốc) — nói thẳng số
      // này ra, vì nó là phần công việc không quy được cho ai.
      unattributed_messages: touches.unattributed,
      // Tin gửi đi tách theo nguồn: app (có người bấm) · meta_inbox (trả lời bằng app Facebook
      // gốc) · auto_reply · tool · sync_unknown · (chưa ghi nguồn) = tin trước bản vá 17/10.
      outbound_by_via: touches.byVia || {},
      // Đếm distinct toàn công ty: cộng số khách của từng người sẽ nhân đôi khách chung.
      customers_total: (() => {
        const all = new Set();
        for (const t of touches.byUser.values()) for (const k of t.customers) all.add(k);
        for (const set of leadCustomersByUser.values()) for (const k of set) all.add(k);
        return all.size;
      })(),
      // Bình luận công khai Facebook (post/quảng cáo) — KHÁC tin nhắn Messenger ở trên. Zalo OA
      // không có khái niệm bình luận công khai nên không có mục tương ứng.
      facebook_comments: fbComments.company,
      facebook_comments_issue: fbComments.failed,
      phat_sinh_issue: phatSinh.failed,
      lead_stage_issue: leadStage.failed,
      // Khách còn đang chờ, chưa ai trả lời tính tới lúc mở báo cáo.
      pending_replies: touches.pendingReplies || 0,
      /**
       * Việc quá hạn của công ty KHÔNG quy được cho nhân viên nào trong danh sách (chưa giao, hoặc
       * giao cho người không gắn công ty). Cộng số theo từng người sẽ bỏ sót đúng phần này — phải
       * hiện riêng, nếu không người đọc thấy tổng 0 lại tưởng không còn việc trễ.
       */
      overdue_total: overdue.total || 0,
      overdue_unassigned: overdue.unassigned || 0,
    },
    items,
  };
}

/**
 * Dòng thô đứng sau một con số trên báo cáo — dùng khi người xem bấm vào một hạng mục để hỏi
 * "1.087 lần lọc đó là những lần nào?". Chỉ đọc, giới hạn cứng số dòng trả về.
 *
 * KHÔNG trả nội dung bình luận: người xem cần biết ai trao đổi lúc nào, không cần đọc nội dung
 * khách hàng. Câu hỏi gửi trợ lý thì có trả vì bản thân nó là tín hiệu khó khăn cần đọc.
 */
async function getUserBehaviorEvents({
  companyId, userId, source = 'activity', actionType, module: moduleKey, path,
  channel, channelName, contactId,
  dateFrom, dateTo, limit = 200,
} = {}) {
  // Xem khách / hội thoại của một KÊNH thì phạm vi là page/OA, không phải một nhân viên — bảng
  // kênh mức công ty không gắn với ai cả. Các nguồn còn lại vẫn bắt buộc có user_id.
  const channelScoped = source === 'channel_customers' || source === 'chat';
  if (!userId && !channelScoped) throw new Error('Thiếu user_id');
  const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const win = resolveWindow({ dateFrom, dateTo });

  // Chỉ cho xem người thuộc phạm vi công ty của người gọi — không để đoán user_id của công ty khác.
  if (companyId && userId) {
    const { data: u, error } = await supabase
      .from('users').select('id').eq('id', userId).eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!u) throw new Error('Người dùng không thuộc công ty này');
  }

  const applyWindow = (q, col = 'created_at') => {
    if (win.dateFrom) q = q.gte(col, win.dateFrom);
    if (win.dateTo) q = q.lt(col, win.dateTo);
    return q;
  };

  /**
   * Danh sách KHÁCH của một page/OA — mở ra khi bấm vào một kênh trên báo cáo. Không lọc theo
   * `userId` vì khách thuộc về KÊNH, không thuộc về nhân viên; người phụ trách kênh là ai đã được
   * xác định ở tầng trên (`owned_channels`).
   */
  if (source === 'channel_customers') {
    const cfg = channel === 'Zalo'
      ? { msg: 'zalo_messages', contact: 'zalo_contacts', ownerCol: 'oa_id', nameCol: 'display_name', pageTable: 'zalo_oa_accounts', pageKey: 'oa_id', pageName: 'oa_name' }
      : { msg: 'facebook_messages', contact: 'facebook_contacts', ownerCol: 'page_id', nameCol: 'fb_name', pageTable: 'facebook_pages', pageKey: 'page_id', pageName: 'page_name' };

    // Tên trang -> id trang (UI chỉ có tên hiển thị trong tay). Lấy kèm default_company_id để
    // chặn người công ty A đoán tên page của công ty B.
    const { data: pages, error: pErr } = await supabase
      .from(cfg.pageTable).select(`${cfg.pageKey}, ${cfg.pageName}, default_company_id`);
    if (pErr) throw new Error(pErr.message);
    const match = (pages || []).find((p) => (p[cfg.pageName] || p[cfg.pageKey]) === channelName);
    if (!match) return { source, rows: [] };
    if (companyId && match.default_company_id && match.default_company_id !== companyId) {
      throw new Error('Kênh này không thuộc công ty của bạn');
    }

    const { data: contacts, error: cErr } = await supabase
      .from(cfg.contact)
      .select(`id, ${cfg.nameCol}, phone, lead_id, last_message_at, unread_count`)
      .eq(cfg.ownerCol, match[cfg.pageKey])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(take);
    if (cErr) throw new Error(cErr.message);

    // Đếm tin theo từng khách trong kỳ — 1 truy vấn cho cả trang, lọc ở Node.
    const ids = (contacts || []).map((c) => c.id);
    const counts = new Map();
    if (ids.length) {
      for (const part of chunk(ids)) {
        let mq = supabase.from(cfg.msg).select('contact_id, direction').in('contact_id', part).limit(5000);
        mq = applyWindow(mq);
        const { data: msgs } = await mq;
        for (const m of msgs || []) {
          if (!counts.has(m.contact_id)) counts.set(m.contact_id, { inbound: 0, outbound: 0 });
          counts.get(m.contact_id)[m.direction === 'inbound' ? 'inbound' : 'outbound'] += 1;
        }
      }
    }

    return {
      source,
      rows: (contacts || []).map((c) => ({
        contact_id: c.id,
        channel: channel === 'Zalo' ? 'Zalo' : 'Facebook',
        name: c[cfg.nameCol] || '(không rõ tên)',
        phone: c.phone || null,
        lead_id: c.lead_id || null,
        at: c.last_message_at,
        inbound: counts.get(c.id)?.inbound || 0,
        outbound: counts.get(c.id)?.outbound || 0,
        unread: c.unread_count || 0,
      })),
    };
  }

  /**
   * Nội dung chat của MỘT khách — mở ra khi bấm vào tên khách. Trả nguyên văn tin nhắn để quản lý
   * đọc được nhân viên đã trả lời khách thế nào; đây là dữ liệu hội thoại của chính công ty, cùng
   * loại với trang Facebook/Zalo inbox sẵn có, nhưng chỉ người có quyền quản lý mới mở được (route
   * đã chặn bằng `isManagerLike`).
   */
  if (source === 'chat') {
    if (!contactId) throw new Error('Thiếu contact_id');
    const isZalo = channel === 'Zalo';
    const table = isZalo ? 'zalo_messages' : 'facebook_messages';

    // Khách này thuộc page/OA nào, page đó của công ty nào — chặn đọc hội thoại công ty khác
    // bằng cách đoán contact_id.
    if (companyId) {
      const cTable = isZalo ? 'zalo_contacts' : 'facebook_contacts';
      const ownerCol = isZalo ? 'oa_id' : 'page_id';
      const pTable = isZalo ? 'zalo_oa_accounts' : 'facebook_pages';
      const { data: ct } = await supabase.from(cTable).select(ownerCol).eq('id', contactId).maybeSingle();
      if (!ct) throw new Error('Không tìm thấy khách này');
      const { data: pg } = await supabase
        .from(pTable).select('default_company_id').eq(ownerCol, ct[ownerCol]).maybeSingle();
      if (pg?.default_company_id && pg.default_company_id !== companyId) {
        throw new Error('Hội thoại này không thuộc công ty của bạn');
      }
    }
    const { data, error } = await supabase
      .from(table)
      .select('created_at, direction, content, message_type, attachment_url, sent_by')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(take);
    if (error) throw new Error(error.message);

    // Tên người gửi (nhân viên) — chỉ tra những id thật sự xuất hiện.
    const senderIds = [...new Set((data || []).map((m) => m.sent_by).filter(Boolean))];
    const senderName = new Map();
    if (senderIds.length) {
      const { data: us } = await supabase.from('users').select('id, full_name').in('id', senderIds);
      for (const u of us || []) senderName.set(u.id, u.full_name);
    }

    return {
      source,
      // Đảo lại thành thứ tự hội thoại (cũ -> mới) cho dễ đọc.
      rows: (data || []).reverse().map((m) => ({
        at: m.created_at,
        direction: m.direction,
        text: m.content || null,
        message_type: m.message_type || 'text',
        attachment_url: m.attachment_url || null,
        sender: m.sent_by ? (senderName.get(m.sent_by) || 'Nhân viên') : null,
      })),
    };
  }

  /**
   * Nội dung bình luận của 1 người. `group='internal'` = Dự án + Phân công, `group='customer'` =
   * Lead/Deal (xem COMMENT_SOURCES). Trả nguyên văn kèm tên dự án/lead để người đọc biết đang nói
   * về việc gì — cùng lý do với nhánh `chat`: dữ liệu nội bộ của chính công ty, route đã chặn
   * bằng `isManagerLike`.
   */
  if (source === 'comments') {
    const group = moduleKey === 'customer' ? 'customer' : 'internal';
    const srcs = COMMENT_SOURCES.filter((s) => s.group === group);
    const all = [];

    for (const src of srcs) {
      try {
        let q = supabase
          .from(src.table)
          .select(`created_at, ${src.ref}, ${src.body}`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(take);
        const { data, error } = await applyWindow(q);
        if (error) throw error;
        for (const r of data || []) {
          all.push({ at: r.created_at, text: r[src.body] || '', source: src.label, ref: r[src.ref] || null });
        }
      } catch { /* nguồn nào hỏng thì bỏ qua nguồn đó, vẫn trả phần đọc được */ }
    }

    // Bù tên dự án / lead cho dễ đọc — `ref` chỉ là id.
    const projectIds = all.filter((r) => r.source === 'Dự án' && r.ref).map((r) => r.ref);
    const leadIds = all.filter((r) => r.source === 'Lead/Deal' && r.ref).map((r) => r.ref);
    const refName = new Map();
    try {
      for (const part of chunk([...new Set(projectIds)])) {
        const { data } = await supabase.from('projects').select('id, code, name').in('id', part);
        for (const p of data || []) refName.set(p.id, [p.code, p.name].filter(Boolean).join(' · '));
      }
      for (const part of chunk([...new Set(leadIds)])) {
        const { data } = await supabase.from('crm_leads').select('id, code, title').in('id', part);
        for (const l of data || []) refName.set(l.id, [l.code, l.title].filter(Boolean).join(' · '));
      }
    } catch { /* thiếu tên vẫn trả nội dung */ }

    return {
      source,
      rows: all
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, take)
        .map((r) => ({ ...r, ref_label: r.ref ? refName.get(r.ref) || null : null })),
    };
  }

  /** Danh sách nhiệm vụ phát sinh của 1 người — bảng gốc `crm_assignments`, không qua view. */
  if (source === 'phat_sinh') {
    let q = supabase
      .from('crm_assignments')
      .select('created_at, title, status, deadline, completed_at, phat_sinh_kind, lead_id')
      .eq('assignee_id', userId)
      .not('phat_sinh_kind', 'is', null)
      .order('created_at', { ascending: false })
      .limit(take);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await applyWindow(q);
    if (error) throw new Error(error.message);

    const kindName = new Map();
    try {
      let kq = supabase.from('shared_workspace_phat_sinh_kinds').select('id, slug, name');
      if (companyId) kq = kq.or(`company_id.is.null,company_id.eq.${companyId}`);
      const { data: kinds } = await kq;
      for (const k of kinds || []) {
        if (k.id) kindName.set(String(k.id), k.name);
        if (k.slug) kindName.set(String(k.slug).toLowerCase(), k.name);
      }
    } catch { /* hiện giá trị thô nếu thiếu danh mục */ }

    const now = Date.now();
    return {
      source,
      rows: (data || []).map((r) => {
        const st = String(r.status || '').toLowerCase();
        const closed = st === 'completed' || st === 'cancelled';
        const raw = String(r.phat_sinh_kind || '');
        return {
          at: r.created_at,
          text: r.title,
          kind: kindName.get(raw) || kindName.get(raw.toLowerCase()) || raw || '(không rõ loại)',
          status: r.status,
          deadline: r.deadline,
          completed_at: r.completed_at,
          overdue: !closed && !!r.deadline && new Date(r.deadline).getTime() < now,
        };
      }),
    };
  }

  if (source === 'audit') {
    let q = supabase
      .from('activity_logs')
      .select('created_at, action, entity_type, entity_id, description, old_values, new_values')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(take);
    if (actionType) q = q.eq('action', actionType);
    const { data, error } = await applyWindow(q);
    if (error) throw new Error(error.message);
    const rich = await resolveAuditEntities(data || []);
    return {
      source,
      rows: rich.map((r) => ({
        at: r.created_at, action: r.action, entity: r.entity_type,
        entity_id: r.entity_id, text: r.description,
        entity_label: r.entity_label, project: r.project, changes: r.changes,
      })),
    };
  }

  if (source === 'guide') {
    let q = supabase
      .from('guide_chat_log')
      .select('created_at, path, question, turn_no, has_failed_step')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(take);
    if (path) q = q.eq('path', path);
    const { data, error } = await applyWindow(q);
    if (error) throw new Error(error.message);
    return {
      source,
      rows: (data || []).map((r) => ({
        at: r.created_at, path: r.path, text: r.question,
        turn_no: r.turn_no, failed: r.has_failed_step,
      })),
    };
  }

  // Mặc định: user_activity_log. `path` lưu kèm ?query nên lọc bằng `like` theo tiền tố đã
  // chuẩn hoá, đúng với cách computeHabitByUser gộp nhóm.
  let q = supabase
    .from('user_activity_log')
    .select('created_at, action_type, module, feature, path, label, importance')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(take);
  if (actionType) q = q.eq('action_type', actionType);
  if (moduleKey) q = moduleKey === '(không rõ)' ? q.is('module', null) : q.eq('module', moduleKey);
  if (path) q = q.or(`path.eq.${path},path.like.${path}?*`);
  const { data, error } = await applyWindow(q);
  if (error) throw new Error(error.message);
  return {
    source: 'activity',
    rows: (data || []).map((r) => ({
      at: r.created_at, action: r.action_type, module: r.module, feature: r.feature,
      path: r.path, text: r.label, importance: r.importance,
    })),
  };
}

module.exports = {
  getUserBehaviorInsight,
  getUserBehaviorEvents,
  IDLE_THRESHOLD_MS,
  IDLE_GAP_CAP_MS,
  REPEAT_QUESTION_TURN,
};
