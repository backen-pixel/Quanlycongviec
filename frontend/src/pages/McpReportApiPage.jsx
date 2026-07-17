import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import UserSelect from '../components/UserSelect';
import { resolveApiOrigin } from '../lib/apiOrigin';
import {
  ArrowLeft, Bot, Check, Copy, Key, RefreshCw, Code2, Send,
  CheckCircle2, ChevronDown, ChevronRight, ListTree, Plus,
  ToggleLeft, ToggleRight, Trash2, Plug, Shield,
} from 'lucide-react';

/** URL công khai (Claude / copy connector) — ưu tiên VITE_API_URL */
const PUBLIC_API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || window.location.origin;
const MCP_ENDPOINT_PUBLIC = `${PUBLIC_API_ORIGIN}/api/mcp`;

/** Fetch trong browser: DEV dùng relative → Vite proxy (tránh CORS 5173→4000) */
const MCP_BASE = `${resolveApiOrigin()}/api/mcp`.replace(/([^:]\/)\/+/g, '$1');
const MCP_PROTOCOL = '2025-06-18';

/** Link MCP cho Cursor/Claude — chỉ cần URL, auth = uuid key */
function buildMcpConnectUrl(origin, keyId) {
  if (!keyId) return '';
  return `${String(origin || '').replace(/\/$/, '')}/api/mcp/${keyId}`;
}

const ENDPOINTS = [
  ['POST', '/{uuid}', 'MCP endpoint (khuyến nghị) — auth bằng UUID trên URL'],
  ['GET', '/{uuid}', 'Legacy HTTP+SSE — event endpoint giữ /{uuid}'],
  ['GET', '/{uuid}/ping', 'Health check (không cần header)'],
  ['POST', '/', 'Legacy — cần header X-Api-Key'],
  ['GET', '/ping', 'Legacy ping — cần X-Api-Key'],
  ['GET', '/reports/org-overview', 'BC tổ chức JSON — ?date_from=&date_to='],
  ['GET', '/reports/org-overview/summary', 'BC JSON gọn'],
  ['GET', '/reports/org-overview/text', 'BC text format'],
];

function monthBoundsYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(last).padStart(2, '0')}`,
  };
}

/** Query/body kỳ BC — client (OpenClaw) tự do chọn mỗi request */
function buildReportPeriodParams(dateFrom, dateTo, timeScope) {
  const p = {};
  if (dateFrom && dateTo) {
    p.date_from = dateFrom;
    p.date_to = dateTo;
  } else if (timeScope) {
    p.time_scope = timeScope;
  }
  return p;
}

/** Khớp backend STAFF_LEAD_DEAL_REPORT_ROLES (+ sales_admin thường xem BC) */
const BC_REPORT_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'region_admin', 'sales_admin',
]);

function filterBcReportUsers(list, companyId) {
  let out = (list || []).filter((u) => u.is_active !== false && BC_REPORT_ROLES.has(u.role));
  if (companyId) {
    out = out.filter((u) => !u.company_id || String(u.company_id) === String(companyId));
  }
  return out.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
}

function permFormFromKey(k) {
  if (!k) {
    return {
      all_companies: false,
      company_ids: [],
      region_id: '',
      default_assigned_to: '',
      mcp_scopes: ['reports', 'crm_read'],
    };
  }
  const allowed = Array.isArray(k.allowed_company_ids) ? k.allowed_company_ids.filter(Boolean) : [];
  const all = !!k.all_companies || (!k.company_id && allowed.length === 0);
  let company_ids = [];
  if (!all) {
    if (allowed.length) company_ids = [...allowed];
    else if (k.company_id) company_ids = [k.company_id];
  }
  return {
    all_companies: all,
    company_ids,
    region_id: k.region_id || '',
    default_assigned_to: k.default_assigned_to || '',
    mcp_scopes: Array.isArray(k.mcp_scopes) && k.mcp_scopes.length
      ? [...k.mcp_scopes]
      : ['reports', 'crm_read'],
  };
}

function ConnectorField({ label, value, placeholder, optional, onCopy, copied, copyKey }) {
  const empty = !value || String(value).startsWith('(');
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 block mb-1">
        {label}
        {optional && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
      </label>
      <div className="flex gap-2">
        <div
          className={`flex-1 min-h-9 px-3 py-2 border rounded-lg text-sm break-all ${
            empty ? 'bg-gray-50 border-gray-200 text-gray-400 italic font-sans' : 'bg-white border-gray-200 text-gray-900 font-mono'
          }`}
        >
          {value || placeholder}
        </div>
        {!empty && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(value, copyKey)}
            className="h-9 px-3 shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Đã copy' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

function buildClaudeConnectorPaste({ name, url }) {
  const lines = [
    '=== Claude.ai / Cursor — Remote MCP ===',
    '',
    `Name: ${name}`,
    `Remote MCP server URL: ${url}`,
    '',
    'Advanced settings (OAuth):',
    'OAuth Client ID: (để trống)',
    'OAuth Client Secret: (để trống)',
    '',
    'Request headers: (không cần)',
    '',
    'Lưu ý: Auth nằm trong URL /api/mcp/{uuid}. Thu hồi = Tắt/Xóa key trên QLCV.',
  ];
  return lines.join('\n');
}

function CodeBlock({ code, lang = 'bash' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="relative group">
      <div className="text-[10px] text-gray-400 mb-1 font-mono uppercase tracking-wide">{lang}</div>
      <pre className="bg-gray-900 text-green-300 rounded-xl p-4 overflow-x-auto text-xs leading-relaxed whitespace-pre">
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-7 right-2 h-7 px-2 bg-gray-700 hover:bg-gray-500 text-white rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Đã copy' : 'Copy'}
      </button>
    </div>
  );
}

function getOrCreateMcpClientId() {
  try {
    const k = 'qlcv_mcp_client_id';
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = `qlcv-${crypto.randomUUID()}`;
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    return `qlcv-${Date.now()}`;
  }
}

function buildOpenClawConfig(connectUrl) {
  return JSON.stringify({
    mcpServers: {
      'qlcv-reports': {
        url: connectUrl || 'https://tubep-backend.onrender.com/api/mcp/<key-uuid>',
      },
    },
  }, null, 2);
}

function buildMcpJsonRpcExample(method, params, id = 1) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL,
      },
    },
  }, null, 2);
}

function buildCurlOrgOverview(connectUrl, periodParams) {
  const qs = new URLSearchParams(periodParams).toString();
  const base = connectUrl || `${MCP_ENDPOINT_PUBLIC}/<key-uuid>`;
  return `curl "${base}/reports/org-overview?${qs}"`;
}

export default function McpReportApiPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    company_id: '',
    company_ids: [],
    region_id: '',
    default_assigned_to: '',
    mcp_scopes: ['reports', 'crm_read'],
  });
  const [newKeyValue, setNewKeyValue] = useState(null);
  const [newRefreshToken, setNewRefreshToken] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [keySecrets, setKeySecrets] = useState({});
  const [actAsUserId, setActAsUserId] = useState('');
  const defaultMonth = monthBoundsYmd();
  const [testDateFrom, setTestDateFrom] = useState(defaultMonth.from);
  const [testDateTo, setTestDateTo] = useState(defaultMonth.to);
  const [testLoading, setTestLoading] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [tools, setTools] = useState(null);
  const [showTools, setShowTools] = useState(false);
  const [error, setError] = useState('');
  const [mcpSessionId, setMcpSessionId] = useState('');
  const [mcpClientId, setMcpClientId] = useState(() => getOrCreateMcpClientId());
  const [showClaudeAdvanced, setShowClaudeAdvanced] = useState(true);
  const [permForm, setPermForm] = useState(() => permFormFromKey(null));
  const [permRegions, setPermRegions] = useState([]);
  const [loadingPermRegions, setLoadingPermRegions] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [permSavedOk, setPermSavedOk] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [keysRes, usersRes, companiesRes] = await Promise.all([
        api.get('/settings/api-keys'),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
      ]);
      setKeys(keysRes.data || []);
      const u = usersRes.data?.users || usersRes.data || [];
      setUsers(Array.isArray(u) ? u : []);
      setCompanies(companiesRes.data?.companies || companiesRes.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tải dữ liệu');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const singleId = createForm.company_id !== 'all' && createForm.company_ids.length === 1
      ? createForm.company_ids[0]
      : (createForm.company_id && createForm.company_id !== 'all' ? createForm.company_id : '');
    if (!singleId) {
      setRegions([]);
      return;
    }
    setLoadingRegions(true);
    api.get('/crm/company-regions', { params: { company_id: singleId } })
      .then((rRes) => {
        const rs = Array.isArray(rRes.data) ? rRes.data : (rRes.data?.regions || []);
        setRegions(rs.filter((r) => r.is_active !== false));
      })
      .catch(() => setRegions([]))
      .finally(() => setLoadingRegions(false));
  }, [createForm.company_id, createForm.company_ids]);

  const selectedKey = keys.find((k) => k.id === selectedKeyId);

  useEffect(() => {
    const k = keys.find((x) => x.id === selectedKeyId);
    setPermForm(permFormFromKey(k || null));
    setPermSavedOk(false);
  // Chỉ đồng bộ khi đổi key đang chọn (không reset khi bật/tắt Active)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeyId]);

  useEffect(() => {
    if (selectedKey?.default_assigned_to && !actAsUserId) {
      setActAsUserId(selectedKey.default_assigned_to);
    }
  }, [selectedKey, actAsUserId]);

  const permCompanyIdsKey = (permForm.company_ids || []).join(',');
  useEffect(() => {
    const singleId = !permForm.all_companies && permForm.company_ids?.length === 1
      ? permForm.company_ids[0]
      : '';
    if (!singleId) {
      setPermRegions([]);
      return;
    }
    setLoadingPermRegions(true);
    api.get('/crm/company-regions', { params: { company_id: singleId } })
      .then((rRes) => {
        const rs = Array.isArray(rRes.data) ? rRes.data : (rRes.data?.regions || []);
        setPermRegions(rs.filter((r) => r.is_active !== false));
      })
      .catch(() => setPermRegions([]))
      .finally(() => setLoadingPermRegions(false));
  }, [permForm.all_companies, permCompanyIdsKey]);

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const createKey = async () => {
    if (!createForm.name.trim()) {
      setError('Nhập tên key (VD: OpenClaw MCP — Phúc Đạt)');
      return;
    }
    const allCompanies = createForm.company_id === 'all';
    const selectedIds = allCompanies
      ? []
      : (createForm.company_ids?.length
        ? createForm.company_ids
        : (createForm.company_id && createForm.company_id !== 'all' ? [createForm.company_id] : []));
    if (!allCompanies && selectedIds.length === 0) {
      setError('Chọn ít nhất 1 công ty hoặc «Tất cả công ty»');
      return;
    }
    if (!allCompanies && selectedIds.length === 1 && !createForm.region_id) {
      setError('Chọn khu vực (bắt buộc khi gắn đúng 1 công ty)');
      return;
    }
    if (!createForm.default_assigned_to) {
      setError('Chọn user act-as — admin/sales_admin xem tất cả trong phạm vi; nhân viên chỉ xem data của mình');
      return;
    }
    if (!createForm.mcp_scopes?.length) {
      setError('Chọn ít nhất một quyền: Báo cáo hoặc Đọc CRM');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/settings/api-keys', {
        name: createForm.name.trim(),
        all_companies: allCompanies,
        company_id: allCompanies ? null : (selectedIds.length === 1 ? selectedIds[0] : null),
        region_id: (!allCompanies && selectedIds.length === 1) ? createForm.region_id : null,
        allowed_company_ids: allCompanies ? [] : selectedIds,
        default_assigned_to: createForm.default_assigned_to,
        mcp_scopes: createForm.mcp_scopes,
      });
      const createdKey = data.access_token || data.key;
      setNewKeyValue(createdKey);
      setNewRefreshToken(data.refresh_token || null);
      setKeySecret(createdKey);
      if (data.id) storeKeyTokens(data.id, data);
      if (data.default_assigned_to) setActAsUserId(data.default_assigned_to);
      setCreateForm({
        name: '',
        company_id: '',
        company_ids: [],
        region_id: '',
        default_assigned_to: '',
        mcp_scopes: ['reports', 'crm_read'],
      });
      setShowCreateForm(false);
      await loadData();
      if (data.id) setSelectedKeyId(data.id);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tạo key');
    }
    setCreating(false);
  };

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/settings/api-keys/${id}`, { active: !current });
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, active: !current } : k)));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const deleteKey = async (id, name) => {
    if (!window.confirm(`Xóa key "${name}"? OpenClaw / agent đang dùng key này sẽ bị từ chối.`)) return;
    try {
      await api.delete(`/settings/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (selectedKeyId === id) {
        setSelectedKeyId('');
        setKeySecret('');
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa key');
    }
  };

  const resetPermForm = () => {
    setPermForm(permFormFromKey(selectedKey || null));
    setPermSavedOk(false);
    setError('');
  };

  const saveKeyPerms = async () => {
    if (!selectedKeyId || !selectedKey) {
      setError('Chọn key MCP trước khi lưu phân quyền');
      return;
    }
    if (!permForm.mcp_scopes?.length) {
      setError('Chọn ít nhất một quyền MCP: Báo cáo hoặc Đọc CRM');
      return;
    }
    if (!permForm.default_assigned_to) {
      setError('Chọn user act-as');
      return;
    }
    const ids = permForm.all_companies ? [] : (permForm.company_ids || []);
    if (!permForm.all_companies && ids.length === 0) {
      setError('Chọn ít nhất 1 công ty hoặc bật «Tất cả công ty»');
      return;
    }
    if (!permForm.all_companies && ids.length === 1 && !permForm.region_id) {
      setError('Chọn khu vực khi gắn đúng 1 công ty');
      return;
    }
    setSavingPerms(true);
    setError('');
    setPermSavedOk(false);
    try {
      const { data } = await api.patch(`/settings/api-keys/${selectedKeyId}`, {
        all_companies: !!permForm.all_companies,
        company_id: permForm.all_companies ? null : (ids.length === 1 ? ids[0] : null),
        region_id: (!permForm.all_companies && ids.length === 1) ? (permForm.region_id || null) : null,
        allowed_company_ids: permForm.all_companies ? [] : ids,
        default_assigned_to: permForm.default_assigned_to,
        mcp_scopes: permForm.mcp_scopes,
      });
      setKeys((prev) => prev.map((k) => (k.id === selectedKeyId ? {
        ...k,
        ...data,
        all_companies: data.all_companies,
        allowed_company_ids: data.allowed_company_ids || [],
        mcp_scopes: data.mcp_scopes || [],
      } : k)));
      setPermForm(permFormFromKey(data));
      if (data.default_assigned_to) setActAsUserId(data.default_assigned_to);
      setPermSavedOk(true);
      setTimeout(() => setPermSavedOk(false), 2500);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi lưu phân quyền');
    }
    setSavingPerms(false);
  };

  const rotateKey = async (id) => {
    if (!window.confirm(
      'Đổi access token (rotate) chỉ vô hiệu cặp tbp_… / refresh của KEY NÀY.\n'
      + '• Link MCP /api/mcp/{uuid} KHÔNG đổi — Cursor/Claude vẫn dùng được.\n'
      + '• Các key khác không bị ảnh hưởng.\n\nTiếp tục?',
    )) return;
    try {
      const { data } = await api.post(`/settings/api-keys/${id}/rotate`);
      setKeySecrets((s) => ({ ...s, [id]: { access_token: data.access_token || data.key, refresh_token: data.refresh_token || null } }));
      setNewKeyValue(data.access_token || data.key);
      setNewRefreshToken(data.refresh_token || null);
      if (selectedKeyId === id) setKeySecret(data.access_token || data.key);
      await loadData();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi rotate key');
    }
  };

  const rotateForTest = async () => {
    if (!selectedKeyId) return;
    await rotateKey(selectedKeyId);
  };

  const storeKeyTokens = (id, data) => {
    const access = data?.access_token || data?.key || '';
    const refresh = data?.refresh_token || '';
    if (!id || (!access && !refresh)) return;
    setKeySecrets((s) => ({
      ...s,
      [id]: { access_token: access, refresh_token: refresh },
    }));
    // Không ghi đè keySecret nếu đang test key khác
    if (selectedKeyId === id || !selectedKeyId) {
      if (access) setKeySecret(access);
    }
  };

  const getKeyTokens = (id) => {
    const stored = keySecrets[id];
    if (stored) return stored;
    if (selectedKeyId === id && keySecret) {
      return { access_token: keySecret, refresh_token: newRefreshToken || '' };
    }
    return null;
  };

  const copyAccessToken = (id, preview) => {
    const tokens = getKeyTokens(id);
    if (tokens?.access_token) {
      copyText(tokens.access_token, `${id}_access`);
      return;
    }
    // MCP ưu tiên Link UUID — không ép rotate
    window.alert(
      `Access token không còn hiện sau lần tạo (bảo mật).\n\n`
      + `• Cursor / Claude: dùng nút «Link MCP» (URL /api/mcp/{uuid}) — không cần access token.\n`
      + `• Chỉ bấm Rotate nếu tích hợp cũ dùng header X-Api-Key (sẽ vô hiệu tbp_… cũ của key này).`,
    );
  };

  const copyRefreshToken = (id, preview) => {
    const tokens = getKeyTokens(id);
    if (tokens?.refresh_token) {
      copyText(tokens.refresh_token, `${id}_refresh`);
      return;
    }
    window.alert(
      `Refresh token chỉ hiện 1 lần lúc tạo/rotate.\n`
      + `Nếu cần token mới cho key này → dùng «Đổi access token» (không ảnh hưởng key khác / Link MCP).`,
    );
  };

  const mcpFetch = async (path, opts = {}) => {
    if (!selectedKeyId) throw new Error('Chọn key MCP trước khi test');
    const headers = {
      Accept: 'application/json, text/event-stream',
      ...(opts.headers || {}),
    };
    if (actAsUserId) headers['X-User-Id'] = actAsUserId;
    const res = await fetch(`${MCP_BASE}/${selectedKeyId}${path}`, { ...opts, headers });
    if (res.status === 202) return { ok: true, status: 202, data: { accepted: true } };
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, sessionId: res.headers.get('Mcp-Session-Id') };
  };

  const applyMcpConnection = (res) => {
    const sid = res.sessionId || res.data?.result?.session_id || res.data?.result?.connection?.session_id;
    const cid = res.data?.result?.client_id || res.data?.result?.connection?.client_id;
    if (sid) setMcpSessionId(sid);
    if (cid) {
      setMcpClientId(cid);
      try { sessionStorage.setItem('qlcv_mcp_client_id', cid); } catch { /* ignore */ }
    }
  };

  const mcpRpc = async (method, params = {}, { id = 1, sessionId, clientId, extraHeaders = {}, notification = false } = {}) => {
    if (!selectedKeyId) throw new Error('Chọn key MCP trước khi test');
    const effectiveClientId = clientId || mcpClientId;
    const effectiveSessionId = method === 'initialize' ? undefined : (sessionId || mcpSessionId);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL,
      'Mcp-Method': method,
      ...(extraHeaders || {}),
    };
    if (params?.name) headers['Mcp-Name'] = params.name;
    if (params?.uri) headers['Mcp-Name'] = params.uri;
    if (actAsUserId) headers['X-User-Id'] = actAsUserId;
    if (effectiveClientId) headers['Mcp-Client-Id'] = effectiveClientId;
    if (effectiveSessionId) headers['Mcp-Session-Id'] = effectiveSessionId;

    const body = {
      jsonrpc: '2.0',
      method,
      params: {
        ...params,
        _meta: { 'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL },
      },
    };
    if (!notification && id != null) body.id = id;

    const res = await fetch(`${MCP_BASE}/${selectedKeyId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const wrap = {
      ok: res.ok,
      status: res.status,
      sessionId: res.headers.get('Mcp-Session-Id'),
      clientId: res.headers.get('Mcp-Client-Id'),
    };
    if (res.status === 202) {
      applyMcpConnection(wrap);
      return { ...wrap, data: { accepted: true } };
    }
    const data = await res.json().catch(() => ({}));
    applyMcpConnection({ ...wrap, data });
    return { ...wrap, data };
  };

  const testPeriodParams = useMemo(
    () => buildReportPeriodParams(testDateFrom, testDateTo, null),
    [testDateFrom, testDateTo],
  );

  const runTest = async (kind) => {
    setTestLoading(kind);
    setTestResult(null);
    try {
      let result;
      const period = testPeriodParams;
      if (kind === 'ping') {
        result = await mcpFetch('/ping');
      } else if (kind === 'init') {
        result = await mcpRpc('initialize', {
          client_id: mcpClientId,
          protocolVersion: MCP_PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'mcp-test-ui', version: '1.0.0' },
        });
      } else if (kind === 'initialized') {
        result = await mcpRpc('notifications/initialized', {}, { notification: true });
      } else if (kind === 'tools') {
        result = await mcpRpc('tools/list', {});
        if (result.ok) setTools(result.data?.result?.tools || []);
      } else if (kind === 'org-overview') {
        const qs = new URLSearchParams(period).toString();
        result = await mcpFetch(`/reports/org-overview/summary?${qs}`);
      } else if (kind === 'org-text') {
        const qs = new URLSearchParams(period).toString();
        result = await mcpFetch(`/reports/org-overview/text?${qs}`);
      } else if (kind === 'tool-call') {
        result = await mcpRpc('tools/call', {
          name: 'get_org_overview_report',
          arguments: period,
        });
      }
      setTestResult({ kind, ...result });
    } catch (e) {
      setTestResult({ kind, ok: false, status: 0, data: { error: e.message } });
    }
    setTestLoading('');
  };

  const mcpConnectUrlPublic = useMemo(
    () => buildMcpConnectUrl(PUBLIC_API_ORIGIN, selectedKeyId),
    [selectedKeyId],
  );

  const claudeConnectorName = useMemo(() => {
    if (selectedKey?.name) return `QLCV — ${selectedKey.name}`;
    return 'QLCV — Báo cáo CRM';
  }, [selectedKey?.name]);

  /** Chỉ cần chọn key có act-as — UUID trên URL là đủ */
  const claudeConnectorReady = Boolean(selectedKeyId && selectedKey?.default_assigned_to);

  const createFormBcUsers = useMemo(
    () => {
      const ids = createForm.company_ids || [];
      if (createForm.company_id === 'all') return filterBcReportUsers(users, null);
      if (ids.length === 1) return filterBcReportUsers(users, ids[0]);
      if (ids.length > 1) {
        const set = new Set(ids);
        return filterBcReportUsers(users, null).filter((u) => !u.company_id || set.has(u.company_id));
      }
      if (createForm.company_id && createForm.company_id !== 'all') {
        return filterBcReportUsers(users, createForm.company_id);
      }
      return filterBcReportUsers(users, null);
    },
    [users, createForm.company_id, createForm.company_ids],
  );

  const permFormBcUsers = useMemo(
    () => {
      if (permForm.all_companies) return filterBcReportUsers(users, null);
      const ids = permForm.company_ids || [];
      if (ids.length === 1) return filterBcReportUsers(users, ids[0]);
      if (ids.length > 1) {
        const set = new Set(ids);
        return filterBcReportUsers(users, null).filter((u) => !u.company_id || set.has(u.company_id));
      }
      return filterBcReportUsers(users, selectedKey?.company_id || null);
    },
    [users, permForm.all_companies, permForm.company_ids, selectedKey?.company_id],
  );

  const testBcUsers = useMemo(
    () => filterBcReportUsers(users, selectedKey?.company_id || null),
    [users, selectedKey?.company_id],
  );

  const actAsUser = users.find((u) => u.id === actAsUserId);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 pb-16">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="h-6 w-6 text-violet-600" />
            MCP API — Báo cáo tổ chức
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kết nối Cursor / Claude chỉ cần URL <code className="bg-gray-100 px-1 rounded text-xs">/api/mcp/&#123;uuid&#125;</code>
            {' '}— báo cáo tổ chức + đọc CRM.
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Phân quyền: công ty gắn key · role act-as (admin/sales_admin xem tất trong phạm vi; NV chỉ data mình) · scope BC/CRM.
            Rate limit: ~25/10s IP · ~80/phút IP · ~60/phút key → 429.
          </p>
        </div>
      </div>

      {newKeyValue && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-5 space-y-3">
          <div className="font-bold text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Token mới — sao chép ngay, sẽ không hiển thị lại!
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] font-semibold text-emerald-800 uppercase mb-1">Access token (X-Api-Key / Bearer)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-xs font-mono text-emerald-900 break-all">
                  {newKeyValue}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(newKeyValue, 'new_access')}
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedId === 'new_access' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === 'new_access' ? 'Đã copy' : 'Access'}
                </button>
              </div>
            </div>
            {newRefreshToken && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-800 uppercase mb-1">Refresh token</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-xs font-mono text-emerald-900 break-all">
                    {newRefreshToken}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(newRefreshToken, 'new_refresh')}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedId === 'new_refresh' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'new_refresh' ? 'Đã copy' : 'Refresh'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-emerald-700">
            Key mới đã được chọn để test. <strong>Các key cũ vẫn Active</strong> — tạo mới không thu hồi key khác.
            Cursor/Claude dùng <strong>Link MCP</strong> (UUID), không cần access token.
          </p>
          <button
            type="button"
            onClick={() => setNewKeyValue(null)}
            className="text-xs text-emerald-700 hover:underline cursor-pointer"
          >
            Ẩn banner
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <Key className="h-4 w-4 text-violet-600" />
            API Key ({keys.length})
          </h2>
          <button
            type="button"
            onClick={() => { setShowCreateForm((v) => !v); setError(''); }}
            className="h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Tạo key MCP
          </button>
        </div>

        {showCreateForm && (
          <div className="border border-violet-100 bg-violet-50/60 rounded-xl p-4 space-y-3">
            <p className="text-[11px] text-violet-800">
              Key tạo link MCP <code className="bg-violet-100 px-1 rounded">/api/mcp/&#123;uuid&#125;</code>.
              Có thể chọn <strong>Tất cả công ty</strong> và giới hạn quyền (Báo cáo / Đọc CRM).
              User act-as phải có quyền BC tương ứng.
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tên key <span className="text-red-500">*</span></label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: OpenClaw MCP — Phúc Đạt"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Công ty được phép <span className="text-red-500">*</span></label>
              <label className="flex items-center gap-2 text-xs text-violet-800 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.company_id === 'all'}
                  onChange={(e) => setCreateForm((f) => ({
                    ...f,
                    company_id: e.target.checked ? 'all' : '',
                    company_ids: [],
                    region_id: '',
                  }))}
                />
                🌐 Tất cả công ty
              </label>
              {createForm.company_id !== 'all' && (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-white">
                  {companies.map((c) => {
                    const id = c.id;
                    const checked = (createForm.company_ids || []).includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setCreateForm((f) => {
                            const set = new Set(f.company_ids || []);
                            if (set.has(id)) set.delete(id);
                            else set.add(id);
                            const ids = [...set];
                            return {
                              ...f,
                              company_ids: ids,
                              company_id: ids.length === 1 ? ids[0] : '',
                              region_id: ids.length === 1 ? f.region_id : '',
                            };
                          })}
                        />
                        {c.short_name || c.name}
                      </label>
                    );
                  })}
                </div>
              )}
              {(createForm.company_ids?.length === 1 || (createForm.company_id && createForm.company_id !== 'all')) && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Khu vực <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createForm.region_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, region_id: e.target.value }))}
                    disabled={loadingRegions}
                    className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
                  >
                    <option value="">{loadingRegions ? 'Đang tải…' : '— Chọn khu vực —'}</option>
                    {regions.map((rg) => (
                      <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {createForm.company_ids?.length > 1 && (
                <p className="text-[10px] text-amber-700">Đã chọn {createForm.company_ids.length} công ty — không gắn 1 khu vực cố định.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Quyền hạn MCP <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-3">
                {[
                  ['reports', 'Báo cáo tổ chức', 'get_org_overview_*, BC nhân viên…'],
                  ['crm_read', 'Đọc CRM', 'lead/deal, pipeline, BG/ĐH/HĐ (GET)'],
                ].map(([id, label, hint]) => {
                  const checked = createForm.mcp_scopes.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs ${
                        checked ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => setCreateForm((f) => {
                          const set = new Set(f.mcp_scopes);
                          if (set.has(id)) set.delete(id);
                          else set.add(id);
                          return { ...f, mcp_scopes: [...set] };
                        })}
                      />
                      <span>
                        <span className="font-medium text-gray-800 block">{label}</span>
                        <span className="text-[10px] text-gray-500">{hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                User act-as (X-User-Id) <span className="text-red-500">*</span>
              </label>
              <UserSelect
                value={createForm.default_assigned_to}
                onChange={(id) => setCreateForm((f) => ({ ...f, default_assigned_to: id }))}
                users={createFormBcUsers}
                size="md"
                placeholder="Tìm quản lý / admin có quyền BC…"
                emptyLabel="— Chọn quản lý / admin —"
                className="rounded-lg"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Phân quyền data theo <strong>role act-as</strong>: admin / sales_admin / manager → xem tất trong phạm vi công ty;
                nhân viên thường → chỉ lead/deal của chính mình.
                {createForm.company_id === 'all' ? ' · Phạm vi: tất cả công ty.' : ''}
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={createKey}
                disabled={creating}
                className="h-8 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {creating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                {creating ? 'Đang tạo…' : 'Tạo key'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setError(''); }}
                className="h-8 px-3 border border-gray-200 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {!loading && keys.length > 0 && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${k.active ? 'border-gray-200 bg-gray-50/50' : 'border-gray-100 bg-gray-50 opacity-60'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{k.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${k.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {k.active ? 'Active' : 'Tắt'}
                    </span>
                  </div>
                  <code className="text-[11px] text-gray-500 font-mono">{k.preview}</code>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {k.all_companies
                      ? '🌐 Tất cả công ty'
                      : (Array.isArray(k.allowed_company_ids) && k.allowed_company_ids.length > 1
                        ? `${k.allowed_company_ids.length} công ty`
                        : (companies.find((c) => c.id === k.company_id)?.short_name
                          || companies.find((c) => k.allowed_company_ids?.[0] && c.id === k.allowed_company_ids[0])?.short_name
                          || '—'))}
                    {k.default_assigned_to && (
                      <> · Act-as: {users.find((u) => u.id === k.default_assigned_to)?.full_name || '—'}</>
                    )}
                    {' · '}
                    {(k.mcp_scopes || ['reports', 'crm_read']).map((s) => (
                      s === 'reports' ? 'BC' : s === 'crm_read' ? 'CRM' : s
                    )).join('+')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => copyText(buildMcpConnectUrl(PUBLIC_API_ORIGIN, k.id), `${k.id}_link`)}
                    title="Copy link MCP (dán vào Cursor / Claude)"
                    className="h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer flex items-center gap-1 transition bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
                  >
                    {copiedId === `${k.id}_link` ? <Check className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
                    Link MCP
                  </button>
                  <button
                    type="button"
                    onClick={() => copyAccessToken(k.id, k.preview)}
                    title="Sao chép access token (legacy header)"
                    className={`h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer flex items-center gap-1 transition ${
                      getKeyTokens(k.id)?.access_token
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-orange-50'
                    }`}
                  >
                    {copiedId === `${k.id}_access` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Access
                  </button>
                  <button
                    type="button"
                    onClick={() => copyRefreshToken(k.id, k.preview)}
                    title="Sao chép refresh token"
                    className={`h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer flex items-center gap-1 transition ${
                      getKeyTokens(k.id)?.refresh_token
                        ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-orange-50'
                    }`}
                  >
                    {copiedId === `${k.id}_refresh` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKeyId(k.id);
                      const tokens = getKeyTokens(k.id);
                      if (tokens?.access_token) setKeySecret(tokens.access_token);
                      else if (selectedKeyId !== k.id) setKeySecret('');
                      if (k.default_assigned_to) setActAsUserId(k.default_assigned_to);
                    }}
                    className={`h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer ${selectedKeyId === k.id ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-violet-50'}`}
                  >
                    Chọn
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKeyId(k.id);
                      const tokens = getKeyTokens(k.id);
                      if (tokens?.access_token) setKeySecret(tokens.access_token);
                      if (k.default_assigned_to) setActAsUserId(k.default_assigned_to);
                      setTimeout(() => {
                        document.getElementById('mcp-perm-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 120);
                    }}
                    title="Quản lý phân quyền key này"
                    className={`h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer flex items-center gap-1 ${
                      selectedKeyId === k.id
                        ? 'bg-violet-50 text-violet-800 border border-violet-300'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-violet-50'
                    }`}
                  >
                    <Shield className="h-3 w-3" />
                    Phân quyền
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(k.id, k.active)}
                    title={k.active ? 'Tắt key' : 'Bật key'}
                    className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
                  >
                    {k.active
                      ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                      : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteKey(k.id, k.name)}
                    title="Xóa key"
                    className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && keys.length === 0 && !showCreateForm && (
          <p className="text-sm text-gray-400 text-center py-4">Chưa có key — bấm «Tạo key MCP» để bắt đầu.</p>
        )}
      </div>

      {selectedKey && (
        <div
          id="mcp-perm-panel"
          className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-violet-100 bg-gradient-to-b from-violet-50 to-white">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-violet-600" />
              Phân quyền MCP — {selectedKey.name}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Sửa công ty được phép, quyền tool (BC / CRM) và user act-as cho key đang chọn.
              Link MCP <code className="bg-white px-1 rounded border">/api/mcp/{selectedKey.id}</code> không đổi.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Công ty được phép</label>
              <label className="flex items-center gap-2 text-xs text-violet-800 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!permForm.all_companies}
                  onChange={(e) => setPermForm((f) => ({
                    ...f,
                    all_companies: e.target.checked,
                    company_ids: e.target.checked ? [] : f.company_ids,
                    region_id: e.target.checked ? '' : f.region_id,
                  }))}
                />
                🌐 Tất cả công ty
              </label>
              {!permForm.all_companies && (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-white">
                  {companies.map((c) => {
                    const id = c.id;
                    const checked = (permForm.company_ids || []).includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setPermForm((f) => {
                            const set = new Set(f.company_ids || []);
                            if (set.has(id)) set.delete(id);
                            else set.add(id);
                            const next = [...set];
                            return {
                              ...f,
                              all_companies: false,
                              company_ids: next,
                              region_id: next.length === 1 ? f.region_id : '',
                            };
                          })}
                        />
                        {c.short_name || c.name}
                      </label>
                    );
                  })}
                </div>
              )}
              {!permForm.all_companies && permForm.company_ids?.length === 1 && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Khu vực <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={permForm.region_id}
                    onChange={(e) => setPermForm((f) => ({ ...f, region_id: e.target.value }))}
                    disabled={loadingPermRegions}
                    className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
                  >
                    <option value="">{loadingPermRegions ? 'Đang tải…' : '— Chọn khu vực —'}</option>
                    {permRegions.map((rg) => (
                      <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {!permForm.all_companies && permForm.company_ids?.length > 1 && (
                <p className="text-[10px] text-amber-700">
                  Đã chọn {permForm.company_ids.length} công ty — không gắn 1 khu vực cố định.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Quyền hạn MCP</label>
              <div className="flex flex-wrap gap-3">
                {[
                  ['reports', 'Báo cáo tổ chức', 'get_org_overview_*, BC nhân viên…'],
                  ['crm_read', 'Đọc CRM', 'lead/deal, pipeline, BG/ĐH/HĐ (GET)'],
                ].map(([id, label, hint]) => {
                  const checked = (permForm.mcp_scopes || []).includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs ${
                        checked ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => setPermForm((f) => {
                          const set = new Set(f.mcp_scopes || []);
                          if (set.has(id)) set.delete(id);
                          else set.add(id);
                          return { ...f, mcp_scopes: [...set] };
                        })}
                      />
                      <span>
                        <span className="font-medium text-gray-800 block">{label}</span>
                        <span className="text-[10px] text-gray-500">{hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">User act-as (mặc định)</label>
              <UserSelect
                value={permForm.default_assigned_to}
                onChange={(id) => setPermForm((f) => ({ ...f, default_assigned_to: id }))}
                users={permFormBcUsers}
                size="md"
                placeholder="Tìm admin / sales_admin / manager…"
                emptyLabel="— Chọn user act-as —"
                className="rounded-lg"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Admin / sales_admin / manager → xem tất trong phạm vi công ty;
                nhân viên thường → chỉ data của mình. Có thể ghi đè tạm bằng X-User-Id khi test.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveKeyPerms}
                disabled={savingPerms}
                className="h-8 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {savingPerms ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                {savingPerms ? 'Đang lưu…' : 'Lưu phân quyền'}
              </button>
              <button
                type="button"
                onClick={resetPermForm}
                disabled={savingPerms}
                className="h-8 px-3 border border-gray-200 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-50"
              >
                Hoàn tác
              </button>
              {permSavedOk && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đã lưu
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedKeyId && keys.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Bấm <strong>Chọn</strong> hoặc <strong>Phân quyền</strong> trên một key để chỉnh công ty / scope / act-as.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Plug className="h-4 w-4 text-violet-600" />
                Kết nối Cursor / Claude.ai
              </h2>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                Chỉ cần dán URL <code className="bg-gray-100 px-1 rounded">/api/mcp/&#123;uuid&#125;</code> — không cần header.
                Cursor: Settings → MCP. Claude: Settings → Connectors.
              </p>
            </div>
            <button
              type="button"
              onClick={() => copyText(
                buildClaudeConnectorPaste({
                  name: claudeConnectorName,
                  url: mcpConnectUrlPublic,
                }),
                'claude_all',
              )}
              disabled={!claudeConnectorReady}
              className="h-8 px-3 shrink-0 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition"
            >
              {copiedId === 'claude_all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy tất cả
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!claudeConnectorReady && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {!selectedKeyId && 'Chọn API key ở mục trên. '}
              {selectedKeyId && !selectedKey?.default_assigned_to && 'Key chưa có user act-as — mở panel Phân quyền bên trên để chọn.'}
            </div>
          )}

          <ConnectorField
            label="Name"
            value={claudeConnectorName}
            onCopy={copyText}
            copied={copiedId === 'claude_name'}
            copyKey="claude_name"
          />

          <ConnectorField
            label="Remote MCP server URL"
            value={mcpConnectUrlPublic || '(chọn key để hiện URL)'}
            onCopy={mcpConnectUrlPublic ? copyText : undefined}
            copied={copiedId === 'claude_url'}
            copyKey="claude_url"
          />

          <div>
            <button
              type="button"
              onClick={() => setShowClaudeAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              {showClaudeAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Advanced settings
            </button>
            {showClaudeAdvanced && (
              <div className="mt-3 space-y-3 pl-1 border-l-2 border-gray-100 ml-1.5 pl-4">
                <ConnectorField
                  label="OAuth Client ID"
                  optional
                  value="(để trống)"
                  placeholder="(để trống)"
                />
                <ConnectorField
                  label="OAuth Client Secret"
                  optional
                  value="(để trống)"
                  placeholder="(để trống)"
                />
                <p className="text-[10px] text-gray-500">
                  Auth nằm trong URL (uuid key). OAuth và Request headers <strong>không cần</strong>.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-violet-900">Cursor — mcp.json</p>
            <CodeBlock lang="json" code={buildOpenClawConfig(mcpConnectUrlPublic)} />
            <p className="text-[10px] text-violet-800">
              Thu hồi truy cập = Tắt / Xóa key trên QLCV (UUID trên URL sẽ 401).
            </p>
          </div>

          <ol className="text-[11px] text-gray-600 space-y-1 list-decimal list-inside">
            <li>Chọn key → bấm <strong>Link MCP</strong> (hoặc Copy URL ở trên)</li>
            <li>Cursor → <strong>Settings → MCP</strong> → thêm server với field <code>url</code></li>
            <li>Claude → <strong>Settings → Connectors → Add custom connector</strong> → dán cùng URL; OAuth để trống</li>
            <li>Reload MCP / bật connector trong hội thoại</li>
          </ol>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Endpoints</h2>
        <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-50">
          <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 px-3 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-600 uppercase">
            <span>Method</span>
            <span>Path</span>
            <span>Mô tả</span>
          </div>
          {ENDPOINTS.map(([method, path, desc]) => (
            <div
              key={path + method}
              className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-center px-3 py-1.5 text-xs font-mono hover:bg-gray-50/80"
            >
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-center ${method === 'POST' ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {method}
              </span>
              <code className="text-violet-800 truncate" title={path}>{path}</code>
              <span className="text-gray-500 text-[11px] font-sans truncate" title={desc}>{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">
          <strong>Kỳ BC (client gửi):</strong>{' '}
          <code className="bg-gray-100 px-1 rounded">date_from</code> + <code className="bg-gray-100 px-1 rounded">date_to</code> (YYYY-MM-DD, ưu tiên)
          hoặc <code className="bg-gray-100 px-1 rounded">time_scope</code> (<code>today</code>, <code>this_month</code>, <code>last_7d</code>…).
          Lọc thêm: <code className="bg-gray-100 px-1 rounded">company_id</code>, <code className="bg-gray-100 px-1 rounded">region_id</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">department_id</code>, <code className="bg-gray-100 px-1 rounded">assigned_to</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">deal_kh_split=1</code>
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
        <p className="font-semibold">Kỳ báo cáo — do OpenClaw quyết định</p>
        <p>
          Mỗi lần gọi API/tool, client truyền kỳ tùy ý. Ví dụ hỏi «BC tháng 3» →{' '}
          <code className="bg-amber-100 px-1 rounded">date_from=2026-03-01&amp;date_to=2026-03-31</code>.
          Tool <code className="bg-amber-100 px-1 rounded">resolve_time_range</code> giúp đổi preset → ngày nếu cần.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Send className="h-4 w-4 text-violet-600" />
          Test kết nối
        </h2>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin h-6 w-6 border-2 border-violet-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">API Key</label>
                <select
                  value={selectedKeyId}
                  onChange={(e) => { setSelectedKeyId(e.target.value); setKeySecret(''); }}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">— Chọn key —</option>
                  {keys.filter((k) => k.active).map((k) => (
                    <option key={k.id} value={k.id}>{k.name} ({k.preview})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">X-User-Id (quyền BC)</label>
                <UserSelect
                  value={actAsUserId}
                  onChange={setActAsUserId}
                  users={testBcUsers}
                  size="md"
                  placeholder="Tìm nhân viên (tên, email, UUID)…"
                  emptyLabel="— Mặc định từ key —"
                  className="rounded-lg"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {testBcUsers.length} NV có quyền BC
                  {selectedKey?.company_id ? ' · cùng công ty key' : ''}
                  {actAsUser && (
                    <span className="block font-mono text-gray-500 truncate mt-0.5" title={actAsUser.id}>
                      UUID: {actAsUser.id}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 space-y-2">
              <p className="text-[11px] text-gray-600">
                <strong>Kỳ test</strong> (mô phỏng request OpenClaw — chỉ dùng khi bấm test BC bên dưới)
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">date_from</label>
                  <input
                    type="date"
                    value={testDateFrom}
                    onChange={(e) => setTestDateFrom(e.target.value)}
                    className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">date_to</label>
                  <input
                    type="date"
                    value={testDateTo}
                    onChange={(e) => setTestDateTo(e.target.value)}
                    className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={rotateForTest}
                disabled={!selectedKeyId}
                className="h-9 px-3 border border-orange-200 bg-white hover:bg-orange-50 text-orange-700 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                title="Chỉ đổi tbp_… của key đang chọn — Link MCP UUID không đổi; key khác không ảnh hưởng"
              >
                <Key className="h-3.5 w-3.5" />
                Đổi access token (tuỳ chọn)
              </button>
              <span className="text-[10px] text-gray-500">
                Test MCP không cần rotate — dùng URL bên dưới.
              </span>
            </div>

            {mcpConnectUrlPublic && (
              <div className="text-[11px] text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 font-mono break-all">
                URL test: {mcpConnectUrlPublic}
              </div>
            )}

            {selectedKeyId && !selectedKey?.default_assigned_to && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Key chưa có act-as — chọn <strong>X-User-Id</strong> bên trên khi test tools có quyền BC.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {[
                ['ping', 'Ping'],
                ['init', 'Initialize'],
                ['initialized', 'initialized'],
                ['tools', 'tools/list'],
                ['org-overview', 'BC summary'],
                ['org-text', 'BC text'],
                ['tool-call', 'tools/call'],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => runTest(kind)}
                  disabled={!!testLoading || !selectedKeyId}
                  className="h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {testLoading === kind ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  {label}
                </button>
              ))}
            </div>

            {testResult && (
              <div className={`rounded-xl p-3 text-xs font-mono ${testResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <div className={`font-bold mb-1 flex items-center gap-1.5 ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : '✕'}
                  {testResult.kind} — HTTP {testResult.status}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[10px] max-h-64 overflow-y-auto">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-3">
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-bold text-gray-900 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <ListTree className="h-4 w-4 text-violet-600" />
            Tool MCP ({tools?.length ?? '40+'})
          </span>
          {showTools ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {showTools && (
          <ul className="text-xs text-gray-600 space-y-1.5 border-t border-gray-100 pt-3">
            {(tools || [
              'get_org_overview_report_full',
              'get_org_overview_report',
              'crm_api_get',
              'search_crm_leads',
              'get_crm_lead_detail',
              'get_crm_stage_counts',
              'list_crm_pipelines',
              'list_crm_pipeline_stages',
              'list_crm_customers',
              'list_crm_quotations',
              'get_crm_quotation',
              'list_crm_orders',
              'get_crm_order',
              'list_crm_invoices',
              'get_crm_invoice',
              'list_crm_lead_tasks',
              'get_crm_lead_activities',
              'list_crm_lead_documents',
              'get_crm_dashboard',
              'get_crm_kanban_bootstrap',
              'find_users_by_name',
              'list_pipelines_for_company',
              'get_pipeline_breakdown',
              'get_company_lead_summary',
              'resolve_time_range',
            ]).map((t) => (
              <li key={typeof t === 'string' ? t : t.name} className="font-mono text-violet-800">
                {typeof t === 'string' ? t : t.name}
                {typeof t === 'object' && t.description && (
                  <span className="font-sans text-gray-500 ml-2">— {t.description.slice(0, 80)}…</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-gray-500">Bấm <strong>List tools</strong> ở trên để tải schema đầy đủ từ server.</p>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-600" />
          Ví dụ tích hợp
        </h2>
        <CodeBlock
          lang="bash"
          code={buildCurlOrgOverview(
            mcpConnectUrlPublic,
            testPeriodParams.date_from
              ? testPeriodParams
              : { date_from: '2026-03-01', date_to: '2026-03-31' },
          )}
        />
        <p className="text-[11px] text-gray-500">
          OpenClaw thay <code>date_from</code> / <code>date_to</code> theo câu hỏi user mỗi lần gọi.
        </p>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">MCP JSON-RPC — initialize</p>
          <CodeBlock
            lang="json"
            code={buildMcpJsonRpcExample('initialize', {
              client_id: mcpClientId || 'qlcv-your-client-id',
              protocolVersion: MCP_PROTOCOL,
              capabilities: {},
              clientInfo: { name: 'my-client', version: '1.0.0' },
            })}
          />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Cursor — mcp.json (chỉ URL)</p>
          <CodeBlock lang="json" code={buildOpenClawConfig(mcpConnectUrlPublic)} />
        </div>
      </div>
    </div>
  );
}
