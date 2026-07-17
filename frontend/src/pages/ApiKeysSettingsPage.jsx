import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  ArrowLeft, Plus, Trash2, Copy, Check, ExternalLink, Key, Shield,
  ToggleLeft, ToggleRight, RefreshCw, Webhook, Zap, Code2, ChevronDown,
  ChevronRight, Activity, Users, Layers, Globe, Send, CheckCircle2,
} from 'lucide-react';

/** Gốc HTTP của backend (giống `src/lib/api.js`). Nếu để trống → dùng origin trình duyệt — Postman phải trỏ đúng URL backend, không phải host frontend tĩnh. */
const PUBLIC_API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || window.location.origin;
const API_BASE = `${PUBLIC_API_ORIGIN}/api/external`;

// ── Code example helpers ────────────────────────────────────────────────────

function buildCurl(key) {
  return `curl -X POST ${API_BASE}/leads \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${key}" \\
  -d '{"title":"Khách hàng từ website","full_name":"Nguyễn Văn A","phone":"0901234567","email":"khachhang@example.com","source_name":"Website","estimated_value":50000000}'`;
}

function buildJS(key) {
  return `const response = await fetch('${API_BASE}/leads', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${key}',
  },
  body: JSON.stringify({
    title: 'Khách hàng từ website',
    full_name: 'Nguyễn Văn A',
    phone: '0901234567',
    email: 'khachhang@example.com',
    source_name: 'Website',
    estimated_value: 50000000,
    // region_id: 'uuid…',             // (mặc định lấy theo config của key)
    // source_category_id: 'uuid…',    // tùy chọn
  }),
});
const data = await response.json();
console.log(data.lead); // { id, code, title, customer, stage }`;
}

function buildPython(key) {
  return `import requests

response = requests.post(
    '${API_BASE}/leads',
    headers={
        'Content-Type': 'application/json',
        'X-Api-Key': '${key}',
    },
    json={
        'title': 'Khách hàng từ website',
        'full_name': 'Nguyễn Văn A',
        'phone': '0901234567',
        'email': 'khachhang@example.com',
        'source_name': 'Website',
        'estimated_value': 50000000,
        # 'region_id': 'uuid…',           # mặc định theo config key
        # 'source_category_id': 'uuid…',  # tùy chọn
    }
)
print(response.json())`;
}

// ── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({ code, lang }) {
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
        onClick={copy}
        className="absolute top-7 right-2 h-7 px-2 bg-gray-700 hover:bg-gray-500 text-white rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Đã copy' : 'Copy'}
      </button>
    </div>
  );
}

// ── TestPanel ─────────────────────────────────────────────────────────────────

function TestPanel({ apiKey }) {
  const [form, setForm] = useState({ title: 'Test lead từ UI', full_name: '', phone: '', email: '', source_name: 'Website' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setResult({ ok: false, status: 0, data: { error: e.message } });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          ['title', 'Tên lead *'],
          ['full_name', 'Họ tên KH'],
          ['phone', 'SĐT'],
          ['email', 'Email'],
          ['source_name', 'Nguồn'],
        ].map(([k, label]) => (
          <div key={k} className={k === 'title' ? 'col-span-2' : ''}>
            <label className="text-[10px] text-gray-500 font-medium mb-0.5 block">{label}</label>
            <input
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        ))}
      </div>
      <button
        onClick={runTest}
        disabled={loading || !form.title}
        className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
      >
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {loading ? 'Đang gửi...' : 'Gửi test'}
      </button>
      {result && (
        <div className={`rounded-xl p-3 text-xs font-mono ${result.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <div className={`font-bold mb-1 flex items-center gap-1.5 ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : '✕'} HTTP {result.status}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApiKeysSettingsPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', default_assigned_to: '', webhook_url: '', company_id: '', region_id: '', default_source_category_id: '', default_lead_type_id: '', default_pipeline_id: '' });
  const [showForm, setShowForm] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState(null);
  const [newRefreshToken, setNewRefreshToken] = useState(null);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sourceCategories, setSourceCategories] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // expanded sections per key
  const [expandedKey, setExpandedKey] = useState(null);
  const [activeTab, setActiveTab] = useState('curl');
  const [keyStats, setKeyStats] = useState({});
  const [pingResult, setPingResult] = useState({});
  const [keySecrets, setKeySecrets] = useState({}); // { [keyId]: { access_token, refresh_token } }

  const storeKeyTokens = (id, data) => {
    const access = data?.access_token || data?.key || '';
    const refresh = data?.refresh_token || '';
    if (!id || (!access && !refresh)) return;
    setKeySecrets((s) => ({ ...s, [id]: { access_token: access, refresh_token: refresh } }));
  };

  const getKeyTokens = (id) => keySecrets[id] || null;

  const copyAccessToken = (id, preview) => {
    const tokens = getKeyTokens(id);
    if (tokens?.access_token) {
      copyText(tokens.access_token, `${id}_access`);
      return;
    }
    if (window.confirm(
      `Access token không còn hiện (chỉ lúc tạo/rotate).\n\n`
      + `Đổi access token (rotate) sẽ vô hiệu tbp_… CŨ của key này — các key khác không bị ảnh hưởng.\n`
      + `MCP Cursor: dùng URL /api/mcp/{uuid} (không cần rotate).\n\nTiếp tục rotate?`,
    )) rotateKey(id);
  };

  const copyRefreshToken = (id, preview) => {
    const tokens = getKeyTokens(id);
    if (tokens?.refresh_token) {
      copyText(tokens.refresh_token, `${id}_refresh`);
      return;
    }
    if (window.confirm(
      `Chưa có refresh token trong phiên này.\n`
      + `Rotate chỉ đổi token của key này (key khác vẫn giữ nguyên).\n\nTiếp tục?`,
    )) rotateKey(id);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, usersRes, companiesRes] = await Promise.all([
        api.get('/settings/api-keys'),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
      ]);
      setKeys(keysRes.data || []);
      const u = usersRes.data?.users || usersRes.data || [];
      setUsers(Array.isArray(u) ? u : []);
      setCompanies(companiesRes.data?.companies || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tải danh sách key');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Tải khu vực + phân loại + lead-type + pipeline theo công ty đã chọn
  useEffect(() => {
    if (!form.company_id) { setRegions([]); setSourceCategories([]); setLeadTypes([]); setPipelines([]); return; }
    setLoadingRegions(true);
    Promise.all([
      api.get('/crm/company-regions', { params: { company_id: form.company_id } }).catch(() => ({ data: [] })),
      api.get('/crm/source-categories', { params: { company_id: form.company_id } }).catch(() => ({ data: [] })),
      api.get('/crm/lead-types', { params: { company_id: form.company_id } }).catch(() => ({ data: [] })),
      api.get('/crm/pipelines', { params: { company_id: form.company_id } }).catch(() => ({ data: [] })),
    ]).then(([rRes, cRes, ltRes, plRes]) => {
      const rs = Array.isArray(rRes.data) ? rRes.data : (rRes.data?.regions || []);
      const cs = Array.isArray(cRes.data) ? cRes.data : (cRes.data?.categories || []);
      const lts = Array.isArray(ltRes.data) ? ltRes.data : (ltRes.data?.lead_types || ltRes.data?.items || []);
      const pls = Array.isArray(plRes.data) ? plRes.data : (plRes.data?.pipelines || plRes.data?.items || []);
      setRegions(rs.filter((r) => r.is_active !== false));
      setSourceCategories(cs.filter((c) => c.is_active !== false));
      setLeadTypes(lts.filter((t) => t.is_active !== false && (!t.applies_to || ['lead', 'both'].includes(t.applies_to))));
      setPipelines(pls.filter((p) => p.is_active !== false));
    }).finally(() => setLoadingRegions(false));
  }, [form.company_id]);

  const createKey = async () => {
    if (!form.name.trim()) { setError('Nhập tên để nhận biết key này'); return; }
    if (!form.company_id) { setError('Chọn công ty gắn với key này'); return; }
    if (!form.region_id) { setError('Chọn khu vực mặc định cho key (bắt buộc)'); return; }
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/settings/api-keys', {
        name: form.name.trim(),
        default_assigned_to: form.default_assigned_to || null,
        webhook_url: form.webhook_url.trim() || null,
        company_id: form.company_id,
        region_id: form.region_id,
        default_source_category_id: form.default_source_category_id || null,
        default_lead_type_id: form.default_lead_type_id || null,
        default_pipeline_id: form.default_pipeline_id || null,
      });
      setNewKeyValue(data.access_token || data.key);
      setNewRefreshToken(data.refresh_token || null);
      if (data.id) storeKeyTokens(data.id, data);
      setForm({ name: '', default_assigned_to: '', webhook_url: '', company_id: '', region_id: '', default_source_category_id: '', default_lead_type_id: '', default_pipeline_id: '' });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tạo key');
    }
    setCreating(false);
  };

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/settings/api-keys/${id}`, { active: !current });
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, active: !current } : k));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const saveWebhook = async (id, webhookUrl) => {
    try {
      await api.patch(`/settings/api-keys/${id}`, { webhook_url: webhookUrl || null });
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, webhook_url: webhookUrl || null } : k));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật webhook');
    }
  };

  const deleteKey = async (id, name) => {
    if (!confirm(`Xóa key "${name}"? Tất cả hệ thống đang dùng key này sẽ bị từ chối.`)) return;
    try {
      await api.delete(`/settings/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa key');
    }
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const pingKey = async (keyPreview) => {
    setPingResult((p) => ({ ...p, [keyPreview]: 'loading' }));
    try {
      const res = await fetch(`${API_BASE}/ping`, { headers: { 'X-Api-Key': keyPreview } });
      setPingResult((p) => ({ ...p, [keyPreview]: res.ok ? 'ok' : 'fail' }));
    } catch {
      setPingResult((p) => ({ ...p, [keyPreview]: 'fail' }));
    }
  };

  const rotateKey = async (id) => {
    if (!window.confirm(
      'Đổi access token (rotate) chỉ vô hiệu cặp tbp_… của KEY NÀY.\n'
      + 'Các key khác vẫn dùng bình thường. Tiếp tục?',
    )) return;
    try {
      const { data } = await api.post(`/settings/api-keys/${id}/rotate`);
      storeKeyTokens(id, data);
      setNewKeyValue(data.access_token || data.key);
      setNewRefreshToken(data.refresh_token || null);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi rotate key');
    }
  };

  const pingWithKey = async (id) => {
    const key = keySecrets[id]?.access_token;
    if (!key) return;
    setPingResult((p) => ({ ...p, [id]: { loading: true } }));
    try {
      const res = await fetch(`${API_BASE}/ping`, { headers: { 'X-Api-Key': key } });
      const data = await res.json().catch(() => ({}));
      setPingResult((p) => ({ ...p, [id]: { loading: false, ok: res.ok, status: res.status, data } }));
    } catch (e) {
      setPingResult((p) => ({ ...p, [id]: { loading: false, ok: false, status: 0, data: { error: e.message } } }));
    }
  };

  const loadStats = async (id) => {
    const key = keySecrets[id]?.access_token;
    if (!key) return;
    setKeyStats((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const res = await fetch(`${API_BASE}/leads/stats`, { headers: { 'X-Api-Key': key } });
      const data = await res.json().catch(() => ({}));
      setKeyStats((s) => ({ ...s, [id]: { loading: false, ok: res.ok, status: res.status, data } }));
    } catch (e) {
      setKeyStats((s) => ({ ...s, [id]: { loading: false, ok: false, status: 0, data: { error: e.message } } }));
    }
  };

  const displayKey = newKeyValue || '••••••••••••••••••••••••••••••••';

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 pb-16">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="h-6 w-6 text-blue-600" /> API Key — Tích hợp ngoài
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cấp key cho bên ngoài (website, Zalo bot, Zapier, Make…) tự động tạo lead vào CRM mà không cần đăng nhập.
          </p>
        </div>
      </div>

      {/* Endpoint overview */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 text-blue-800 font-semibold text-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Endpoints tích hợp
          </div>
          <code className="hidden md:inline-block text-[11px] font-mono text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
            Base: {API_BASE}
          </code>
        </div>

        {/* Bảng endpoint 3 cột: method | path | description — không còn chồng lấn */}
        <div className="bg-white border border-blue-100 rounded-lg overflow-hidden divide-y divide-blue-50">
          <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-1.5 bg-blue-100/50 text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
            <span>Method</span>
            <span>Path</span>
            <span>Mô tả</span>
          </div>
          {[
            ['POST', '/leads', 'Tạo lead mới (cùng luồng CRM: pipeline, region, lead type, auto task)'],
            ['GET', '/regions', 'Danh sách khu vực của công ty (bắt buộc cho lead)'],
            ['GET', '/lead-types', 'Loại Lead/Deal của công ty'],
            ['GET', '/pipelines', 'Pipeline CRM của công ty'],
            ['GET', '/source-categories', 'Danh sách phân loại nguồn'],
            ['GET', '/stages?type=lead', 'Danh sách giai đoạn pipeline'],
            ['GET', '/sources', 'Danh sách nguồn lead'],
            ['GET', '/users', 'Danh sách nhân viên'],
            ['GET', '/ping', 'Kiểm tra key hợp lệ'],
          ].map(([method, path, desc]) => (
            <div
              key={path}
              className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 items-center px-3 py-1.5 text-xs font-mono hover:bg-blue-50/40"
            >
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-center ${method === 'POST' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {method}
              </span>
              <code className="text-blue-800 truncate" title={`${API_BASE}${path}`}>{path}</code>
              <span className="text-gray-500 text-[11px] truncate font-sans" title={desc}>{desc}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-blue-700">
          Xác thực: <code className="bg-blue-100 px-1 rounded">X-Api-Key: &lt;access_token&gt;</code> hoặc{' '}
          <code className="bg-blue-100 px-1 rounded">Authorization: Bearer &lt;access_token&gt;</code>.
          Đổi access mới: <code className="bg-blue-100 px-1 rounded">POST /api/external/oauth/token</code> với{' '}
          <code className="bg-blue-100 px-1 rounded">refresh_token</code>.
        </p>
        {PUBLIC_API_ORIGIN === window.location.origin && (
          <p className="text-[11px] text-orange-800 bg-orange-50 border border-orange-200 rounded-md px-2 py-1.5">
            Postman / Zapier: gửi tới URL <b>backend</b> (biến build <code className="font-mono">VITE_API_URL</code>), không phải host chỉ chạy frontend tĩnh — nếu sai host thường vẫn <b>200</b> nhưng không tạo lead (trả HTML SPA hoặc proxy sai).
          </p>
        )}
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          ⚠️ Mở <code>/ping</code> trực tiếp trong tab mới sẽ trả <b>401 "Thiếu X-Api-Key header"</b> — browser không gửi header.
          Hãy test bằng panel <b>"Test kết nối"</b> bên dưới hoặc Postman / cURL.
        </p>
        <p className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-2 py-1.5">
          🔐 Access + refresh token chỉ hiển thị <b>1 lần</b> lúc tạo/Rotate. Sau đó chỉ thấy mask — bấm <b>Access</b> / <b>Refresh</b> để copy (hoặc Rotate nếu đã mất).
        </p>
      </div>

      {/* New key banner */}
      {newKeyValue && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-5 space-y-3">
          <div className="font-bold text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Token mới — sao chép ngay, sẽ không hiển thị lại!
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] font-semibold text-emerald-800 uppercase mb-1">Access token</p>
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
                  Access
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
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Code examples */}
          <div>
            <div className="flex gap-1 mb-2">
              {['curl', 'javascript', 'python'].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`h-7 px-3 rounded-lg text-xs font-medium cursor-pointer transition ${activeTab === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {t === 'curl' ? 'cURL' : t === 'javascript' ? 'JavaScript' : 'Python'}
                </button>
              ))}
            </div>
            {activeTab === 'curl' && <CodeBlock code={buildCurl(newKeyValue)} lang="bash" />}
            {activeTab === 'javascript' && <CodeBlock code={buildJS(newKeyValue)} lang="javascript" />}
            {activeTab === 'python' && <CodeBlock code={buildPython(newKeyValue)} lang="python" />}
          </div>

          <button onClick={() => setNewKeyValue(null)} className="text-xs text-emerald-700 hover:underline cursor-pointer">
            Ẩn key
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Keys list */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Danh sách key ({keys.length})</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Tạo key mới
          </button>
        </div>

        {showForm && (
          <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tên key <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Website form liên hệ, Zalo OA bot, Zapier CRM…"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Công ty gắn với key <span className="text-red-500">*</span></label>
              <select
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value, region_id: '', default_source_category_id: '' }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">— Chọn công ty —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Mỗi key chỉ được tạo lead cho 1 công ty cố định.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Khu vực mặc định <span className="text-red-500">*</span></label>
              <select
                value={form.region_id}
                onChange={(e) => setForm((f) => ({ ...f, region_id: e.target.value }))}
                disabled={!form.company_id || loadingRegions}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
              >
                <option value="">{!form.company_id ? '— Chọn công ty trước —' : loadingRegions ? 'Đang tải…' : '— Chọn khu vực —'}</option>
                {regions.map((rg) => (
                  <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Lead tạo qua key này mặc định thuộc khu vực đã chọn (có thể override trong body).</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Phân loại nguồn mặc định <span className="text-gray-400 font-normal">(tùy chọn)</span></label>
              <select
                value={form.default_source_category_id}
                onChange={(e) => setForm((f) => ({ ...f, default_source_category_id: e.target.value }))}
                disabled={!form.company_id}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
              >
                <option value="">— Không gán —</option>
                {sourceCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Áp dụng cho nguồn tự tạo từ <code>source_name</code> nếu chưa có category.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Pipeline mặc định <span className="text-gray-400 font-normal">(tùy chọn — auto chọn pipeline default của công ty nếu trống)</span></label>
              <select
                value={form.default_pipeline_id}
                onChange={(e) => setForm((f) => ({ ...f, default_pipeline_id: e.target.value }))}
                disabled={!form.company_id}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
              >
                <option value="">— Tự động (pipeline default) —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' ★ default' : ''}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Lead sẽ vào pipeline này, ở giai đoạn đầu tiên — y hệt khi tạo trong CRM.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Loại Lead/Deal mặc định <span className="text-gray-400 font-normal">(tùy chọn — quyết định bộ task tự sinh)</span></label>
              <select
                value={form.default_lead_type_id}
                onChange={(e) => setForm((f) => ({ ...f, default_lead_type_id: e.target.value }))}
                disabled={!form.company_id}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
              >
                <option value="">— Không gán —</option>
                {leadTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ''}{t.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Nếu gán, hệ thống tự tạo các nhiệm vụ theo template của loại — giống tạo lead trong CRM.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nhân viên phụ trách mặc định</label>
              <select
                value={form.default_assigned_to}
                onChange={(e) => setForm((f) => ({ ...f, default_assigned_to: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">— Không gán mặc định —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1 flex items-center gap-1">
                <Webhook className="h-3.5 w-3.5 text-purple-500" /> Webhook URL (tùy chọn)
              </label>
              <input
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <p className="text-[10px] text-gray-400 mt-1">Khi có lead mới, hệ thống sẽ POST JSON tới URL này.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={createKey}
                disabled={creating}
                className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {creating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                {creating ? 'Đang tạo...' : 'Tạo key'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(''); }}
                className="h-8 px-3 border border-gray-200 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Key className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có API key nào. Tạo key để tích hợp bên ngoài.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {keys.map((k) => {
              const isExpanded = expandedKey === k.id;
              return (
                <div
                  key={k.id}
                  className={`rounded-xl border transition-all ${k.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}
                >
                  {/* Key header row */}
                  <div className="flex items-center gap-3 p-4">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${k.active ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                      <Key className={`h-4 w-4 ${k.active ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${k.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {k.active ? 'Active' : 'Đã tắt'}
                        </span>
                        {k.webhook_url && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 flex items-center gap-1">
                            <Webhook className="h-2.5 w-2.5" /> Webhook
                          </span>
                        )}
                      </div>
                      <code className="text-xs text-gray-500 font-mono">{k.preview}</code>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Tạo lúc {new Date(k.created_at).toLocaleString('vi-VN')}
                        {k.default_assigned_to && (
                          <span className="ml-2">· Phụ trách: {users.find((u) => u.id === k.default_assigned_to)?.full_name || '—'}</span>
                        )}
                        {k.company_id && (
                          <span className="ml-2">· Công ty: {companies.find((c) => c.id === k.company_id)?.short_name || companies.find((c) => c.id === k.company_id)?.name || '—'}</span>
                        )}
                        {k.region_id && (
                          <span className="ml-2">· Khu vực: <span className="font-medium text-gray-600">{k.region_id.slice(0, 8)}…</span></span>
                        )}
                        {k.default_source_category_id && (
                          <span className="ml-2">· Phân loại: <span className="font-medium text-gray-600">{k.default_source_category_id.slice(0, 8)}…</span></span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => copyAccessToken(k.id, k.preview)}
                        title="Sao chép access token"
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
                        onClick={() => toggleActive(k.id, k.active)}
                        title={k.active ? 'Tắt key này' : 'Bật lại key này'}
                        className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer transition"
                      >
                        {k.active
                          ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                          : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                      </button>
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : k.id)}
                        title="Xem chi tiết / code mẫu"
                        className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg cursor-pointer transition"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => deleteKey(k.id, k.name)}
                        title="Xóa key"
                        className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg cursor-pointer transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50 rounded-b-xl">
                      {/* Rotate / Ping / Stats */}
                      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-gray-800 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-blue-600" />
                            Test kết nối (Ping / Stats)
                          </div>
                          <button
                            onClick={() => rotateKey(k.id)}
                            className="h-7 px-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                            title="Đổi access token của key này. Key khác không bị ảnh hưởng. Link MCP UUID không đổi."
                          >
                            Đổi access token
                          </button>
                        </div>
                        {!keySecrets[k.id]?.access_token ? (
                          <div className="text-[11px] text-gray-500">
                            Access token chỉ hiện 1 lần lúc tạo. <b>Tạo key mới</b> không thu hồi key khác.
                            Bấm <b>Đổi access token</b> chỉ nếu cần tbp_… mới cho key này (header X-Api-Key).
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => pingWithKey(k.id)}
                                className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Ping
                              </button>
                              <button
                                onClick={() => loadStats(k.id)}
                                className="h-7 px-3 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Load stats
                              </button>
                            </div>
                            {pingResult[k.id] && !pingResult[k.id].loading && (
                              <div className={`rounded-xl p-2 text-[10px] font-mono ${pingResult[k.id].ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                                <div className={`font-bold mb-1 ${pingResult[k.id].ok ? 'text-emerald-700' : 'text-red-700'}`}>
                                  Ping HTTP {pingResult[k.id].status}
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                                  {JSON.stringify(pingResult[k.id].data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {keyStats[k.id] && !keyStats[k.id].loading && (
                              <div className={`rounded-xl p-2 text-[10px] font-mono ${keyStats[k.id].ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                                <div className={`font-bold mb-1 ${keyStats[k.id].ok ? 'text-emerald-700' : 'text-red-700'}`}>
                                  Stats HTTP {keyStats[k.id].status}
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                                  {JSON.stringify(keyStats[k.id].data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Webhook config */}
                      <WebhookEditor keyData={k} onSave={(url) => saveWebhook(k.id, url)} />

                      {/* Tabs: code examples / test */}
                      <div>
                        <div className="flex gap-1 mb-3">
                          {['curl', 'javascript', 'python', 'test'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setActiveTab(t)}
                              className={`h-7 px-3 rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1 ${activeTab === t ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                            >
                              {t === 'curl' && <><Code2 className="h-3 w-3" /> cURL</>}
                              {t === 'javascript' && <><Zap className="h-3 w-3" /> JS</>}
                              {t === 'python' && <><Code2 className="h-3 w-3" /> Python</>}
                              {t === 'test' && <><Send className="h-3 w-3" /> Test</>}
                            </button>
                          ))}
                        </div>
                        {activeTab === 'curl' && <CodeBlock code={buildCurl(keySecrets[k.id]?.access_token || k.preview)} lang="bash" />}
                        {activeTab === 'javascript' && <CodeBlock code={buildJS(keySecrets[k.id]?.access_token || k.preview)} lang="javascript" />}
                        {activeTab === 'python' && <CodeBlock code={buildPython(keySecrets[k.id]?.access_token || k.preview)} lang="python" />}
                        {activeTab === 'test' && (
                          keySecrets[k.id]?.access_token
                            ? <TestPanel apiKey={keySecrets[k.id].access_token} />
                            : <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-xl p-3">Rotate key để nhận key thật rồi mới test được.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fields reference */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">
          Trường dữ liệu Body — POST /leads
        </h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1.5 pr-3 text-gray-500 font-semibold">Trường</th>
              <th className="text-left py-1.5 pr-3 text-gray-500 font-semibold">Bắt buộc</th>
              <th className="text-left py-1.5 text-gray-500 font-semibold">Mô tả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[
              ['title', '✅', 'Tên lead hiển thị trong CRM'],
              ['phone', '✅', 'SĐT khách hàng — tìm hoặc tạo mới customer theo số này'],
              ['region_id', '', 'UUID khu vực — tự chọn khu vực đầu tiên của công ty nếu trống'],
              ['pipeline_id', '', 'UUID pipeline — fallback default của key, sau đó default của công ty'],
              ['lead_type_id', '', 'UUID loại Lead/Deal — quyết định bộ task auto-gen (fallback default key)'],
              ['source_category_id', '', 'UUID phân loại nguồn (tùy chọn) — fallback default của key'],
              ['full_name', '', 'Tên khách hàng — tìm hoặc tạo mới theo phone/email'],
              ['email', '', 'Email khách hàng'],
              ['address', '', 'Địa chỉ'],
              ['company', '', 'Tên công ty khách hàng'],
              ['source_name', '', 'Nguồn lead (VD: "Website", "Zalo") — tự tạo nếu chưa có'],
              ['estimated_value', '', 'Giá trị ước tính (số nguyên, VND)'],
              ['description', '', 'Mô tả thêm'],
              ['notes', '', 'Ghi chú nội bộ'],
              ['stage_id', '', 'UUID giai đoạn pipeline — mặc định giai đoạn đầu tiên'],
              ['assigned_to', '', 'UUID nhân viên phụ trách — mặc định theo config key'],
              ['webhook_url', '', 'Callback URL nhận kết quả (ghi đè webhook của key)'],
            ].map(([field, req, desc]) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 pr-3 font-mono text-blue-700">{field}</td>
                <td className="py-1.5 pr-3 text-center">{req}</td>
                <td className="py-1.5 text-gray-600">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Webhook payload reference */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Webhook className="h-4 w-4 text-purple-500" /> Webhook Payload
        </h2>
        <p className="text-xs text-gray-500">
          Khi có lead mới, hệ thống POST JSON sau tới webhook URL (nếu được cấu hình). Cùng JSON này
          cũng được trả lại trong response của <code className="bg-gray-100 px-1 rounded">POST /leads</code>
          dưới key <code className="bg-gray-100 px-1 rounded">lead</code>.
        </p>
        <p className="text-[11px] text-gray-500 italic">
          Công ty &amp; khu vực đã gắn cố định trên API key nên không lặp lại trong payload.
        </p>
        <CodeBlock lang="json" code={`{
  "event": "lead.created",
  "timestamp": "2026-04-22T10:00:00.123Z",
  "key": "Website form",
  "lead": {
    "id": "uuid",
    "code": "LEAD-0001",
    "title": "Khách hàng từ website",
    "value": 50000000,
    "stage": "Mới",
    "url": "https://crm.example.com/crm/leads/<id>",
    "created_at": "2026-04-22T10:00:00.000Z",
    "customer": { "name": "Nguyễn Văn A", "phone": "0901234567", "email": "a@example.com" }
  }
}`} />
      </div>
    </div>
  );
}

// ── WebhookEditor sub-component ───────────────────────────────────────────────

function WebhookEditor({ keyData, onSave }) {
  const [val, setVal] = useState(keyData.webhook_url || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(val.trim() || null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
        <Webhook className="h-3.5 w-3.5 text-purple-500" /> Webhook URL
      </label>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="https://hooks.zapier.com/..."
          className="flex-1 h-8 px-3 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          onClick={save}
          disabled={saving}
          className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : null}
          {saved ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400">Nhập URL Zapier / Make / server riêng để nhận POST khi có lead mới.</p>
    </div>
  );
}
