import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { ArrowLeft, Plus, Trash2, Copy, Check, Eye, EyeOff, RefreshCw, Key, Shield, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';

const BASE_URL = window.location.origin;

export default function ApiKeysSettingsPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', default_assigned_to: '' });
  const [showForm, setShowForm] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState(null); // key vừa tạo — hiện 1 lần
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, usersRes] = await Promise.all([
        api.get('/settings/api-keys'),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setKeys(keysRes.data || []);
      const u = usersRes.data?.users || usersRes.data || [];
      setUsers(Array.isArray(u) ? u : []);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tải danh sách key');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!form.name.trim()) { setError('Nhập tên để nhận biết key này'); return; }
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/settings/api-keys', {
        name: form.name.trim(),
        default_assigned_to: form.default_assigned_to || null,
      });
      setNewKeyValue(data.key);
      setForm({ name: '', default_assigned_to: '' });
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

  const deleteKey = async (id, name) => {
    if (!confirm(`Xóa key "${name}"? Tất cả hệ thống đang dùng key này sẽ bị từ chối.`)) return;
    try {
      await api.delete(`/settings/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa key');
    }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const exampleCurl = newKeyValue
    ? `curl -X POST ${BASE_URL}/api/external/leads \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${newKeyValue}" \\
  -d '{
    "title": "Khách hàng mới từ website",
    "full_name": "Nguyễn Văn A",
    "phone": "0901234567",
    "email": "a@example.com",
    "source_name": "Website"
  }'`
    : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="h-6 w-6 text-blue-600" /> API Key — Tích hợp ngoài
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Cấp key cho bên ngoài (website, Zalo bot, Zapier…) tự động tạo lead vào CRM mà không cần đăng nhập.</p>
        </div>
      </div>

      {/* Endpoint info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
          <Shield className="h-4 w-4" /> Endpoint tạo lead từ bên ngoài
        </div>
        <code className="block text-xs bg-white border border-blue-100 rounded-lg px-3 py-2 text-blue-900 font-mono break-all">
          POST {BASE_URL}/api/external/leads
        </code>
        <p className="text-xs text-blue-700">
          Header: <code className="bg-blue-100 px-1 rounded">X-Api-Key: &lt;key&gt;</code> · Body: JSON với các trường
          <code className="bg-blue-100 px-1 rounded ml-1">title</code>
          <code className="bg-blue-100 px-1 rounded ml-1">full_name</code>
          <code className="bg-blue-100 px-1 rounded ml-1">phone</code>
          <code className="bg-blue-100 px-1 rounded ml-1">email</code>
          <code className="bg-blue-100 px-1 rounded ml-1">source_name</code>
          <code className="bg-blue-100 px-1 rounded ml-1">estimated_value</code>
          <code className="bg-blue-100 px-1 rounded ml-1">description</code>
        </p>
        <a
          href={`${BASE_URL}/api/external/ping`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Kiểm tra ping endpoint
        </a>
      </div>

      {/* New key reveal */}
      {newKeyValue && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            ✅ Key mới đã tạo — sao chép ngay, sẽ không hiển thị lại!
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-sm font-mono text-emerald-900 break-all">
              {newKeyValue}
            </code>
            <button
              onClick={() => copyText(newKeyValue)}
              className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Đã sao chép' : 'Copy'}
            </button>
          </div>

          {/* Example curl */}
          <details className="text-xs">
            <summary className="cursor-pointer text-emerald-700 font-medium mb-2">Xem ví dụ cURL</summary>
            <div className="relative">
              <pre className="bg-gray-900 text-green-300 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
                {exampleCurl}
              </pre>
              <button
                onClick={() => copyText(exampleCurl)}
                className="absolute top-2 right-2 h-7 px-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
          </details>

          <button onClick={() => setNewKeyValue(null)} className="text-xs text-emerald-700 hover:underline cursor-pointer">
            Ẩn key
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Create form */}
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
              <label className="text-xs font-medium text-gray-600 block mb-1">Phụ trách mặc định (tùy chọn)</label>
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

        {/* Keys list */}
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
          <div className="space-y-2 mt-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  k.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${k.active ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                  <Key className={`h-4 w-4 ${k.active ? 'text-emerald-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${k.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {k.active ? 'Active' : 'Đã tắt'}
                    </span>
                  </div>
                  <code className="text-xs text-gray-500 font-mono">{k.preview}</code>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Tạo lúc {new Date(k.created_at).toLocaleString('vi-VN')}
                    {k.default_assigned_to && (
                      <span className="ml-2">· Phụ trách: {users.find((u) => u.id === k.default_assigned_to)?.full_name || k.default_assigned_to}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
                    onClick={() => deleteKey(k.id, k.name)}
                    title="Xóa key"
                    className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg cursor-pointer transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Body fields docs */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Trường dữ liệu Body (JSON)</h2>
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
              ['full_name', '', 'Tên khách hàng — tìm hoặc tạo mới theo phone/email'],
              ['phone', '', 'SĐT — dùng để tìm khách hàng đã có'],
              ['email', '', 'Email khách hàng'],
              ['address', '', 'Địa chỉ'],
              ['company', '', 'Tên công ty khách hàng'],
              ['source_name', '', 'Nguồn lead (VD: "Website", "Zalo") — tự tạo nếu chưa có'],
              ['estimated_value', '', 'Giá trị ước tính (số nguyên, VND)'],
              ['description', '', 'Mô tả thêm'],
              ['notes', '', 'Ghi chú nội bộ'],
              ['stage_id', '', 'UUID giai đoạn pipeline — mặc định giai đoạn đầu tiên'],
              ['assigned_to', '', 'UUID nhân viên phụ trách — mặc định theo config key'],
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
    </div>
  );
}
