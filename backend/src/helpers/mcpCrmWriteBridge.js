/**
 * MCP — tầng GHI cho CRM.
 *
 * CÁCH CHẠY: KHÔNG ghi thẳng xuống bảng.
 * Mỗi tool nạp đúng route HTTP mà giao diện đang gọi, qua cùng cơ chế `invokeCrmGet`
 * đang dùng cho phần đọc: dựng req giả + token act-as, rồi đẩy qua `routes/crm`.
 * Nhờ vậy mọi thứ gắn vào route vẫn chạy nguyên vẹn — kiểm quyền, gate chuyển giai đoạn,
 * sinh nhiệm vụ theo mẫu, ghi bình luận hoạt động, bắn thông báo, đồng bộ sang assignment.
 * Viết thẳng vào Supabase sẽ bỏ qua tất cả những thứ đó và làm dữ liệu lệch âm thầm.
 *
 * BA LỚP CHẶN
 *  1. Scope `crm:write` trên khoá API — mặc định KHÔNG có, phải bật riêng từng khoá.
 *  2. Whitelist (method + path): chỉ những đường đã liệt kê dưới đây mới đi được.
 *  3. Quyền của chính user act-as — route tự kiểm như khi người đó bấm trên giao diện.
 *
 * CỐ Ý CHƯA MỞ
 *  - Mọi thao tác XOÁ (`DELETE /leads/:id`, xoá bình luận, xoá tài liệu…). Xoá qua trợ lý
 *    là thứ khó hoàn tác nhất và dễ bị hiểu nhầm ý nhất; mở sau khi tầng ghi chạy ổn.
 *  - Gộp lead trùng, chuyển deal sang sản xuất, duyệt báo giá/hợp đồng: kéo theo dữ liệu
 *    ở module khác, cần bàn riêng.
 */

const {
  signActAsJwt, createMockRes, truncatePayload,
} = require('./mcpCrmReadBridge');

const UUID = '[0-9a-fA-F-]{36}';

/**
 * Đường ghi được phép. Mỗi mục: phương thức + biểu thức khớp path (sau tiền tố `/api/crm`).
 * Thêm dòng mới ở đây là mở thêm quyền ghi — đọc kỹ route đó trước khi thêm.
 */
const CRM_WRITE_WHITELIST = [
  { method: 'POST', re: new RegExp('^/leads$') },
  { method: 'PUT', re: new RegExp(`^/leads/${UUID}$`) },
  { method: 'PATCH', re: new RegExp(`^/leads/${UUID}/stage$`) },
  { method: 'PATCH', re: new RegExp(`^/leads/${UUID}/deadline$`) },
  { method: 'POST', re: new RegExp(`^/leads/${UUID}/convert-to-deal$`) },
  { method: 'POST', re: new RegExp(`^/leads/${UUID}/convert-to-lead$`) },
  { method: 'POST', re: new RegExp(`^/leads/${UUID}/comments$`) },
  { method: 'POST', re: new RegExp(`^/leads/${UUID}/activities$`) },
  { method: 'POST', re: new RegExp(`^/leads/${UUID}/tasks$`) },
  { method: 'PUT', re: new RegExp(`^/leads/${UUID}/tasks/${UUID}$`) },
  { method: 'POST', re: new RegExp('^/customers$') },
  { method: 'PUT', re: new RegExp(`^/customers/${UUID}$`) },
];

const ALLOWED_WRITE_HELP = CRM_WRITE_WHITELIST
  .map((w) => `${w.method} ${w.re.source.replace('^', '').replace('$', '')}`)
  .join(', ');

function assertCrmWritePath(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').trim();
  if (!p.startsWith('/')) {
    const err = new Error(`Path phải bắt đầu bằng "/": ${p}`);
    err.status = 400;
    throw err;
  }
  if (p.includes('?')) {
    const err = new Error('Không truyền query trong path; dùng trường body.');
    err.status = 400;
    throw err;
  }
  const ok = CRM_WRITE_WHITELIST.some((w) => w.method === m && w.re.test(p));
  if (!ok) {
    const err = new Error(
      `Đường ghi không nằm trong whitelist: ${m} ${p}. Cho phép: ${ALLOWED_WRITE_HELP}`,
    );
    err.status = 403;
    throw err;
  }
  return p;
}

/**
 * Đẩy một lệnh ghi qua router CRM thật.
 * Dựng req/res giả giống hệt `invokeCrmGet`, chỉ khác là có method + body.
 */
async function invokeCrmWrite({ method, path, body = {}, user, app = null }) {
  const m = String(method || '').toUpperCase();
  const safePath = assertCrmWritePath(m, path);
  if (!user?.id) {
    const err = new Error('Thiếu user act-as');
    err.status = 400;
    throw err;
  }
  if (body != null && typeof body !== 'object') {
    const err = new Error('body phải là đối tượng JSON');
    err.status = 400;
    throw err;
  }

  const token = await signActAsJwt(user);
  const req = {
    method: m,
    url: safePath,
    originalUrl: `/api/crm${safePath}`,
    baseUrl: '',
    path: safePath,
    query: {},
    params: {},
    body: body || {},
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      // Dấu vết để route/log phân biệt lệnh từ trợ lý với thao tác tay.
      'x-mcp-write': '1',
    },
    get(name) {
      const key = String(name || '').toLowerCase();
      return this.headers[key];
    },
    header(name) { return this.get(name); },
    ip: '127.0.0.1',
    // Truyền `app` thật của tiến trình để route bắn được realtime (io) như thao tác tay.
    // Không có thì trả null — mọi chỗ dùng io đều đã tự chặn `if (!io) return`.
    app: app || { get() { return null; } },
  };

  const res = createMockRes();
  const crmRouter = require('../routes/crm');

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    res._onFinish = finish;
    try {
      crmRouter.handle(req, res, (err) => {
        if (err) { if (!settled) { settled = true; reject(err); } return; }
        finish();
      });
    } catch (e) {
      if (!settled) { settled = true; reject(e); }
    }
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error(`CRM ${m} timeout (30s)`), { status: 504 }));
      }
    }, 30_000);
  });

  const status = res.statusCode || 200;
  const data = truncatePayload(res.body);
  if (status >= 400) {
    const msg = data?.error || data?.message || `CRM ${m} ${safePath} → HTTP ${status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = status;
    err.data = data;
    throw err;
  }
  return { status, data, path: safePath, method: m };
}

/** Bỏ trường rỗng để không ghi đè giá trị cũ bằng null ngoài ý muốn. */
function body(args, keys) {
  const b = {};
  keys.forEach((k) => {
    if (args[k] !== undefined && args[k] !== null && args[k] !== '') b[k] = args[k];
  });
  return b;
}

const LEAD_FIELDS = [
  'title', 'customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id',
  'pipeline_id', 'lead_type_id', 'region_id', 'phone', 'install_address',
  'estimated_value', 'description', 'expected_close_date', 'next_follow_up',
  'lead_owner_id', 'probability', 'referrer_name',
];

const MCP_CRM_WRITE_TOOLS = [
  {
    name: 'create_crm_lead',
    description: 'Tạo lead hoặc deal CRM mới. Trả về bản ghi vừa tạo. '
      + 'Bắt buộc có title; company_id lấy theo khoá API nếu không truyền.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Tên lead/deal' },
        type: { type: 'string', enum: ['lead', 'deal'], description: 'Mặc định lead' },
        phone: { type: 'string' },
        customer_id: { type: 'string' },
        company_id: { type: 'string' },
        pipeline_id: { type: 'string' },
        stage_id: { type: 'string', description: 'Bỏ trống thì vào giai đoạn đầu của pipeline' },
        source_id: { type: 'string' },
        region_id: { type: 'string' },
        assigned_to: { type: 'string', description: 'User id người phụ trách' },
        install_address: { type: 'string' },
        estimated_value: { type: 'number' },
        description: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_crm_lead',
    description: 'Sửa thông tin lead/deal: tên, người phụ trách, khu vực, giá trị, địa chỉ… '
      + 'Chỉ truyền trường muốn đổi; trường bỏ trống giữ nguyên. Đổi giai đoạn thì dùng move_crm_lead_stage.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lead/deal id' },
        title: { type: 'string' },
        assigned_to: { type: 'string' },
        phone: { type: 'string' },
        region_id: { type: 'string' },
        source_id: { type: 'string' },
        install_address: { type: 'string' },
        estimated_value: { type: 'number' },
        description: { type: 'string' },
        expected_close_date: { type: 'string' },
        next_follow_up: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_crm_lead_stage',
    description: 'Chuyển lead/deal sang giai đoạn khác trong pipeline. '
      + 'Gate nghiệp vụ vẫn chạy: còn nhiệm vụ chặn chuyển giai đoạn thì bị từ chối kèm danh sách.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        stage_id: { type: 'string', description: 'Giai đoạn đích' },
        reason: { type: 'string', description: 'Lý do, ghi vào lịch sử' },
      },
      required: ['id', 'stage_id'],
    },
  },
  {
    name: 'add_crm_lead_comment',
    description: 'Gửi một bình luận vào luồng trao đổi của lead/deal. '
      + 'Nhắc tên bằng @ vẫn bắn thông báo như người gõ tay.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lead/deal id' },
        body: { type: 'string', description: 'Nội dung bình luận' },
        parent_id: { type: 'string', description: 'Trả lời một bình luận cụ thể' },
      },
      required: ['id', 'body'],
    },
  },
  {
    name: 'create_crm_lead_task',
    description: 'Tạo nhiệm vụ trên lead/deal: tiêu đề, người làm, hạn chót.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        title: { type: 'string' },
        assignee_id: { type: 'string' },
        deadline: { type: 'string', description: 'ISO hoặc YYYY-MM-DD' },
        description: { type: 'string' },
        priority: { type: 'string' },
        stage_slug: { type: 'string' },
      },
      required: ['lead_id', 'title'],
    },
  },
  {
    name: 'update_crm_lead_task',
    description: 'Sửa nhiệm vụ CRM — đổi trạng thái (đánh dấu hoàn thành), người làm, hạn chót, tiêu đề. '
      + 'Đặt status="completed" để báo xong.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
        title: { type: 'string' },
        assignee_id: { type: 'string' },
        deadline: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['lead_id', 'task_id'],
    },
  },
  {
    name: 'convert_crm_lead_to_deal',
    description: 'Chuyển một lead thành deal.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'create_crm_customer',
    description: 'Tạo khách hàng mới trong CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        company_id: { type: 'string' },
      },
      required: ['full_name'],
    },
  },
];

const MCP_CRM_WRITE_TOOL_SET = new Set(MCP_CRM_WRITE_TOOLS.map((t) => t.name));

/** Tool nào được coi là phá hủy — client sẽ hỏi lại người dùng trước khi chạy. */
const TOOL_PHA_HUY = new Set(['move_crm_lead_stage', 'update_crm_lead']);

function getMcpCrmWriteTools() {
  return MCP_CRM_WRITE_TOOLS;
}

async function callMcpCrmWriteTool(name, args = {}, user, { app = null } = {}) {
  if (!MCP_CRM_WRITE_TOOL_SET.has(name)) {
    const err = new Error(`Tool ghi CRM không được phép: ${name}`);
    err.status = 404;
    throw err;
  }
  const a = args || {};

  if (name === 'create_crm_lead') {
    return invokeCrmWrite({
      method: 'POST',
      path: '/leads',
      body: { ...body(a, LEAD_FIELDS), type: a.type === 'deal' ? 'deal' : 'lead' },
      user,
      app,
    });
  }
  if (name === 'update_crm_lead') {
    return invokeCrmWrite({
      method: 'PUT',
      path: `/leads/${a.id}`,
      body: body(a, LEAD_FIELDS),
      user,
      app,
    });
  }
  if (name === 'move_crm_lead_stage') {
    return invokeCrmWrite({
      method: 'PATCH',
      path: `/leads/${a.id}/stage`,
      body: body(a, ['stage_id', 'reason']),
      user,
      app,
    });
  }
  if (name === 'add_crm_lead_comment') {
    return invokeCrmWrite({
      method: 'POST',
      path: `/leads/${a.id}/comments`,
      body: body(a, ['body', 'parent_id']),
      user,
      app,
    });
  }
  if (name === 'create_crm_lead_task') {
    return invokeCrmWrite({
      method: 'POST',
      path: `/leads/${a.lead_id}/tasks`,
      body: body(a, ['title', 'assignee_id', 'deadline', 'description', 'priority', 'stage_slug']),
      user,
      app,
    });
  }
  if (name === 'update_crm_lead_task') {
    return invokeCrmWrite({
      method: 'PUT',
      path: `/leads/${a.lead_id}/tasks/${a.task_id}`,
      body: body(a, ['status', 'title', 'assignee_id', 'deadline', 'notes']),
      user,
      app,
    });
  }
  if (name === 'convert_crm_lead_to_deal') {
    return invokeCrmWrite({
      method: 'POST', path: `/leads/${a.id}/convert-to-deal`, body: {}, user, app,
    });
  }
  if (name === 'create_crm_customer') {
    return invokeCrmWrite({
      method: 'POST',
      path: '/customers',
      body: body(a, ['full_name', 'phone', 'email', 'address', 'company_id']),
      user,
      app,
    });
  }

  const err = new Error(`Chưa cài đặt tool ghi: ${name}`);
  err.status = 501;
  throw err;
}

module.exports = {
  MCP_CRM_WRITE_TOOL_NAMES: MCP_CRM_WRITE_TOOLS.map((t) => t.name),
  MCP_CRM_WRITE_TOOL_SET,
  TOOL_PHA_HUY,
  getMcpCrmWriteTools,
  callMcpCrmWriteTool,
  invokeCrmWrite,
  assertCrmWritePath,
  ALLOWED_WRITE_HELP,
};
