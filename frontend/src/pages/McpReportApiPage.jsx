import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import UserSelect from '../components/UserSelect';
import {
  ArrowLeft, Bot, Check, Copy, Key, RefreshCw, Shield, Code2, Send,
  CheckCircle2, ChevronDown, ChevronRight, ExternalLink, ListTree, Plus,
  ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react';

const PUBLIC_API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || window.location.origin;
const MCP_BASE = `${PUBLIC_API_ORIGIN}/api/mcp`;

const ENDPOINTS = [
  ['GET', '/ping', 'Kiểm tra key + gateway'],
  ['GET', '/tools', 'Danh sách tool MCP (OpenClaw)'],
  ['POST', '/tools/call', 'Gọi tool: body { name, arguments } — kỳ BC trong arguments'],
  ['POST', '/rpc', 'JSON-RPC: tools/list, tools/call'],
  ['GET', '/reports/org-overview', 'BC tổ chức JSON đầy đủ — ?date_from=&date_to='],
  ['GET', '/reports/org-overview/summary', 'BC JSON gọn — client truyền kỳ qua query'],
  ['GET', '/reports/org-overview/text', 'BC text — client truyền kỳ qua query'],
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

function buildOpenClawConfig(baseUrl, keyPreview) {
  return JSON.stringify({
    mcpServers: {
      qlcv_reports: {
        type: 'http',
        url: `${baseUrl}/rpc`,
        headers: {
          'X-Api-Key': keyPreview === 'YOUR_API_KEY' ? keyPreview : '<key-sau-khi-rotate>',
          'X-User-Id': '<uuid-manager-co-quyen-bc>',
        },
        description: 'Báo cáo CRM theo tổ chức — TuBep Pro',
      },
    },
  }, null, 2);
}

function buildCurlOrgOverview(key, userId, periodParams) {
  const qs = new URLSearchParams(periodParams).toString();
  const headers = [`  -H "X-Api-Key: ${key}"`];
  if (userId) headers.push(`  -H "X-User-Id: ${userId}"`);
  return `curl "${MCP_BASE}/reports/org-overview?${qs}" \\\n${headers.join(' \\\n')}`;
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
    region_id: '',
    default_assigned_to: '',
  });
  const [newKeyValue, setNewKeyValue] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [actAsUserId, setActAsUserId] = useState('');
  const defaultMonth = monthBoundsYmd();
  const [testDateFrom, setTestDateFrom] = useState(defaultMonth.from);
  const [testDateTo, setTestDateTo] = useState(defaultMonth.to);
  const [testLoading, setTestLoading] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [tools, setTools] = useState(null);
  const [showTools, setShowTools] = useState(false);
  const [error, setError] = useState('');

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
    if (!createForm.company_id) {
      setRegions([]);
      return;
    }
    setLoadingRegions(true);
    api.get('/crm/company-regions', { params: { company_id: createForm.company_id } })
      .then((rRes) => {
        const rs = Array.isArray(rRes.data) ? rRes.data : (rRes.data?.regions || []);
        setRegions(rs.filter((r) => r.is_active !== false));
      })
      .catch(() => setRegions([]))
      .finally(() => setLoadingRegions(false));
  }, [createForm.company_id]);

  const selectedKey = keys.find((k) => k.id === selectedKeyId);

  useEffect(() => {
    if (selectedKey?.default_assigned_to && !actAsUserId) {
      setActAsUserId(selectedKey.default_assigned_to);
    }
  }, [selectedKey, actAsUserId]);

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
    if (!createForm.company_id) {
      setError('Chọn công ty gắn với key');
      return;
    }
    if (!createForm.region_id) {
      setError('Chọn khu vực (bắt buộc theo schema API key)');
      return;
    }
    if (!createForm.default_assigned_to) {
      setError('Chọn user act-as — cần quyền xem báo cáo tổ chức');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/settings/api-keys', {
        name: createForm.name.trim(),
        company_id: createForm.company_id,
        region_id: createForm.region_id,
        default_assigned_to: createForm.default_assigned_to,
      });
      const createdKey = data.key;
      setNewKeyValue(createdKey);
      setKeySecret(createdKey);
      if (data.default_assigned_to) setActAsUserId(data.default_assigned_to);
      setCreateForm({ name: '', company_id: '', region_id: '', default_assigned_to: '' });
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

  const rotateForTest = async () => {
    if (!selectedKeyId) return;
    if (!window.confirm('Rotate key sẽ vô hiệu key cũ ngay. Tiếp tục?')) return;
    try {
      const { data } = await api.post(`/settings/api-keys/${selectedKeyId}/rotate`);
      setKeySecret(data.key);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi rotate key');
    }
  };

  const mcpFetch = async (path, opts = {}) => {
    const key = keySecret;
    if (!key) throw new Error('Cần key thật — chọn key và bấm Rotate để test');
    const headers = { 'X-Api-Key': key, ...(opts.headers || {}) };
    if (actAsUserId) headers['X-User-Id'] = actAsUserId;
    const res = await fetch(`${MCP_BASE}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
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
      } else if (kind === 'tools') {
        result = await mcpFetch('/tools');
        if (result.ok) setTools(result.data?.tools || []);
      } else if (kind === 'org-overview') {
        const qs = new URLSearchParams(period).toString();
        result = await mcpFetch(`/reports/org-overview/summary?${qs}`);
      } else if (kind === 'org-text') {
        const qs = new URLSearchParams(period).toString();
        result = await mcpFetch(`/reports/org-overview/text?${qs}`);
      } else if (kind === 'tool-call') {
        result = await mcpFetch('/tools/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'get_org_overview_report',
            arguments: period,
          }),
        });
      }
      setTestResult({ kind, ...result });
    } catch (e) {
      setTestResult({ kind, ok: false, status: 0, data: { error: e.message } });
    }
    setTestLoading('');
  };

  const displayKey = keySecret || newKeyValue || (selectedKey?.preview || 'YOUR_API_KEY');

  const createFormBcUsers = useMemo(
    () => filterBcReportUsers(users, createForm.company_id || null),
    [users, createForm.company_id],
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
            Cổng API cho OpenClaw / agent bên ngoài lấy dữ liệu «Báo cáo theo tổ chức» — cùng logic trang BC CRM.
          </p>
        </div>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-violet-900 font-semibold text-sm">
          <Shield className="h-4 w-4" />
          Xác thực &amp; quyền
        </div>
        <ul className="text-xs text-violet-800 space-y-1 list-disc list-inside">
          <li>Tạo key ngay tại mục <strong>API Key</strong> bên dưới (dùng chung bảng với{' '}
            <Link to="/settings/api-keys" className="underline font-medium inline-flex items-center gap-0.5">
              API Key tích hợp <ExternalLink className="h-3 w-3" />
            </Link>)
          </li>
          <li>Header <code className="bg-violet-100 px-1 rounded">X-Api-Key</code> bắt buộc</li>
          <li>Header <code className="bg-violet-100 px-1 rounded">X-User-Id</code>: user có quyền xem BC (mặc định = default_assigned_to trên key)</li>
          <li>Key phải gắn <strong>công ty</strong>; user act-as phải thuộc cùng công ty (trừ system admin)</li>
          <li><strong>Kỳ báo cáo</strong> không cấu hình trên gateway — OpenClaw/client gửi <code className="bg-violet-100 px-1 rounded">date_from</code> + <code className="bg-violet-100 px-1 rounded">date_to</code> (hoặc <code className="bg-violet-100 px-1 rounded">time_scope</code>) <em>mỗi request</em></li>
        </ul>
        <code className="block text-[11px] font-mono text-violet-700 bg-white border border-violet-100 rounded-lg px-3 py-2 mt-2">
          Base: {MCP_BASE}
        </code>
      </div>

      {newKeyValue && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-5 space-y-3">
          <div className="font-bold text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Key mới đã tạo — sao chép ngay, sẽ không hiển thị lại!
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-sm font-mono text-emerald-900 break-all">
              {newKeyValue}
            </code>
            <button
              type="button"
              onClick={() => copyText(newKeyValue, 'new')}
              className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedId === 'new' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedId === 'new' ? 'Đã copy' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-emerald-700">
            Key đã được chọn sẵn trong panel test — có thể bấm Ping / BC summary ngay.
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
              Key dùng cho OpenClaw / agent gọi <code className="bg-violet-100 px-1 rounded">/api/mcp</code>.
              Chọn user act-as có quyền xem «Báo cáo theo tổ chức» (manager / admin).
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Công ty <span className="text-red-500">*</span></label>
                <select
                  value={createForm.company_id}
                  onChange={(e) => setCreateForm((f) => ({
                    ...f,
                    company_id: e.target.value,
                    region_id: '',
                    default_assigned_to: '',
                  }))}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">— Chọn công ty —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Khu vực <span className="text-red-500">*</span></label>
                <select
                  value={createForm.region_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, region_id: e.target.value }))}
                  disabled={!createForm.company_id || loadingRegions}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
                >
                  <option value="">
                    {!createForm.company_id ? '— Chọn công ty trước —' : loadingRegions ? 'Đang tải…' : '— Chọn khu vực —'}
                  </option>
                  {regions.map((rg) => (
                    <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                  ))}
                </select>
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
                {createFormBcUsers.length} NV có quyền BC
                {createForm.company_id ? ' trong công ty đã chọn' : ''}
                — tìm theo tên, email hoặc UUID.
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
                    {k.company_id && (companies.find((c) => c.id === k.company_id)?.short_name || '—')}
                    {k.default_assigned_to && (
                      <> · Act-as: {users.find((u) => u.id === k.default_assigned_to)?.full_name || '—'}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKeyId(k.id);
                      setKeySecret('');
                      if (k.default_assigned_to) setActAsUserId(k.default_assigned_to);
                    }}
                    className={`h-7 px-2 rounded-lg text-[10px] font-medium cursor-pointer ${selectedKeyId === k.id ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-violet-50'}`}
                  >
                    Chọn
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
                className="h-9 px-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Key className="h-3.5 w-3.5" />
                Rotate key để test
              </button>
            </div>

            {keySecret && (
              <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-mono break-all">
                Key test: {keySecret.slice(0, 12)}… (chỉ hiện trong phiên này)
              </div>
            )}

            {!keySecret && selectedKeyId && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Hệ thống không lưu key thật. Bấm <strong>Rotate key để test</strong> để nhận key mới (key cũ bị vô hiệu).
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {[
                ['ping', 'Ping'],
                ['tools', 'List tools'],
                ['org-overview', 'BC summary'],
                ['org-text', 'BC text'],
                ['tool-call', 'Tool call'],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => runTest(kind)}
                  disabled={!!testLoading || !keySecret}
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
            Tool MCP ({tools?.length ?? '13+'})
          </span>
          {showTools ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {showTools && (
          <ul className="text-xs text-gray-600 space-y-1.5 border-t border-gray-100 pt-3">
            {(tools || [
              'get_org_overview_report_full',
              'get_org_overview_report',
              'format_org_overview_report_text',
              'format_all_employees_report_text',
              'get_employee_activity_report',
              'format_employee_activity_report_text',
              'get_employee_leads_drill',
              'get_employee_breakdown',
              'list_departments_in_company',
              'list_employees_in_scope',
              'list_companies_in_scope',
              'get_overdue_breakdown',
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
            displayKey,
            actAsUserId,
            testPeriodParams.date_from
              ? testPeriodParams
              : { date_from: '2026-03-01', date_to: '2026-03-31' },
          )}
        />
        <p className="text-[11px] text-gray-500">
          OpenClaw thay <code>date_from</code> / <code>date_to</code> theo câu hỏi user mỗi lần gọi.
        </p>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">OpenClaw — gợi ý cấu hình MCP HTTP</p>
          <CodeBlock lang="json" code={buildOpenClawConfig(MCP_BASE, displayKey)} />
        </div>
      </div>
    </div>
  );
}
