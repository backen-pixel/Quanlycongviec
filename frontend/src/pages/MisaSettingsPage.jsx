import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  ArrowLeft, Save, CheckCircle, AlertCircle, Eye, EyeOff,
  FileCheck, Wifi, Settings, Info, ExternalLink,
  ChevronDown, ChevronUp, BookOpen, Key, User, Hash, PenTool, Globe,
} from 'lucide-react';

const SIGN_TYPE_OPTIONS = [
  { value: 1, label: 'SignType 1 — Ký số qua USB Token / File mềm' },
  { value: 2, label: 'SignType 2 — Ký số qua HSM (có hiển thị CKS)' },
  { value: 3, label: 'SignType 3 — Ký số qua HSM (bất đồng bộ)' },
];

const INV_SERIES_PRESETS = [
  { value: '1C26TYY', label: '1C26TYY — GTGT, có mã, 2026' },
  { value: '1K26TYY', label: '1K26TYY — GTGT, không mã, 2026' },
  { value: '2C26TYY', label: '2C26TYY — Bán hàng, có mã, 2026' },
  { value: '2K26TYY', label: '2K26TYY — Bán hàng, không mã, 2026' },
];

export default function MisaSettingsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    appId: '',
    taxcode: '',
    username: '',
    password: '',
    invSeries: '1C26TYY',
    signType: 2,
    isProduction: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message/error }
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings/misa')
      .then(r => { setForm(f => ({ ...f, ...r.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setTestResult(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/misa', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu cấu hình');
    } finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Lưu trước khi test
      await api.put('/settings/misa', form);
      const { data } = await api.post('/settings/misa/test');
      setTestResult({ success: true, message: data.message });
    } catch (e) {
      setTestResult({ success: false, error: e.response?.data?.error || e.message });
    } finally { setTesting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              Cấu hình MISA meInvoice
            </h1>
            <p className="text-xs text-gray-500">Tích hợp phát hành hóa đơn điện tử theo NĐ70/2025</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={testConnection}
            disabled={testing || saving}
            className="h-9 px-4 border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Wifi className="h-4 w-4" />
            {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? 'Đang lưu...' : saved ? 'Đã lưu!' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {testResult.success
            ? <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            : <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          }
          <div>
            <p className="text-sm font-semibold">{testResult.success ? 'Kết nối thành công' : 'Kết nối thất bại'}</p>
            <p className="text-xs mt-0.5">{testResult.success ? testResult.message : testResult.error}</p>
          </div>
        </div>
      )}

      {/* Hướng dẫn nhanh */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-semibold text-sm">Cần chuẩn bị trước khi cấu hình:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Tài khoản MISA meInvoice đã đăng ký tại <a href="https://meinvoice.vn" target="_blank" rel="noreferrer" className="underline font-medium">meinvoice.vn</a></li>
            <li><strong>AppID</strong> do MISA cấp khi đăng ký tích hợp Open API</li>
            <li><strong>InvSeries</strong> (ký hiệu HĐ) đã được thông báo phát hành với cơ quan thuế</li>
            <li>Đã đăng ký dịch vụ ký số HSM (nếu dùng SignType 2 hoặc 3)</li>
          </ol>
          <p className="mt-2">
            <button onClick={() => document.getElementById('misa-guide')?.scrollIntoView({ behavior: 'smooth' })} className="text-blue-700 underline font-medium cursor-pointer">
              Xem hướng dẫn chi tiết từng bước ↓
            </button>
          </p>
        </div>
      </div>

      {/* Môi trường */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide flex items-center gap-2">
          <Settings className="h-4 w-4 text-gray-500" /> Môi trường
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => set('isProduction', false)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer ${!form.isProduction ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}
            >
              {!form.isProduction && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Môi trường Test</p>
              <p className="text-xs text-gray-400">testapi.meinvoice.vn — Không phát sinh hóa đơn thật</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer select-none ml-6">
            <div
              onClick={() => set('isProduction', true)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer ${form.isProduction ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'}`}
            >
              {form.isProduction && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Môi trường Production</p>
              <p className="text-xs text-gray-400">api.meinvoice.vn — Phát hành hóa đơn thật</p>
            </div>
          </label>
        </div>
        {form.isProduction && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Môi trường Production — Hóa đơn phát hành sẽ có giá trị pháp lý thực tế
          </div>
        )}
      </div>

      {/* Thông tin xác thực API */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-blue-500" /> Thông tin xác thực API
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="App ID"
            hint="Do MISA cung cấp khi đăng ký tích hợp"
            value={form.appId}
            onChange={v => set('appId', v)}
            placeholder="Nhập AppID từ MISA"
          />
          <Field
            label="Mã số thuế công ty (Taxcode)"
            hint="MST đăng ký dịch vụ HĐĐT meInvoice"
            value={form.taxcode}
            onChange={v => set('taxcode', v)}
            placeholder="VD: 0101243150"
          />
          <Field
            label="Tên đăng nhập meInvoice"
            hint="Username tài khoản meInvoice.vn"
            value={form.username}
            onChange={v => set('username', v)}
            placeholder="Tên đăng nhập"
          />
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mật khẩu meInvoice <span className="text-gray-400 font-normal">— để trống nếu không đổi</span></label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cấu hình hóa đơn */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-blue-500" /> Cấu hình hóa đơn điện tử
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Ký hiệu hóa đơn (InvSeries)
              <span className="ml-1 text-gray-400 font-normal">— thay đổi theo năm</span>
            </label>
            <select
              value={INV_SERIES_PRESETS.find(p => p.value === form.invSeries) ? form.invSeries : 'custom'}
              onChange={e => { if (e.target.value !== 'custom') set('invSeries', e.target.value); }}
              className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {INV_SERIES_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="custom">Nhập thủ công...</option>
            </select>
            <input
              value={form.invSeries}
              onChange={e => set('invSeries', e.target.value.toUpperCase())}
              placeholder="VD: 1C26TYY"
              className="w-full h-9 px-3 border rounded-lg text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phương thức ký số (SignType)</label>
            <select
              value={form.signType}
              onChange={e => set('signType', parseInt(e.target.value, 10))}
              className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {SIGN_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {form.signType === 1 && 'Yêu cầu cài công cụ ký MISA trên máy.'}
              {form.signType === 2 && 'Khuyến nghị — Ký qua HSM server, không cần USB.'}
              {form.signType === 3 && 'HSM bất đồng bộ — phù hợp phát hành hàng loạt.'}
            </p>
          </div>
        </div>
      </div>

      {/* Thông tin kỹ thuật */}
      <div className="bg-gray-50 rounded-xl border border-dashed p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Thông tin kỹ thuật</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoRow label="Base URL" value={form.isProduction ? 'https://api.meinvoice.vn/api/integration' : 'https://testapi.meinvoice.vn/api/integration'} />
          <InfoRow label="Auth endpoint" value="/auth/token" />
          <InfoRow label="Phát hành HĐ" value="POST /invoice" />
          <InfoRow label="Gửi email HĐ" value="POST /invoice/sendemail" />
          <InfoRow label="Trạng thái HĐ" value="GET /invoice/status" />
          <InfoRow label="Tài liệu API" value={<a href="https://www.misa.vn/154989/" target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1">misa.vn/154989 <ExternalLink className="h-3 w-3" /></a>} />
        </div>
      </div>

      {/* Hướng dẫn chi tiết */}
      <MisaGuide />
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">
        {label}
        {hint && <span className="ml-1 text-gray-400 font-normal">— {hint}</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <>
      <span className="text-gray-500">{label}:</span>
      <span className="font-mono text-gray-700 truncate">{value}</span>
    </>
  );
}

/* ─── Hướng dẫn chi tiết lấy API MISA ─── */
const GUIDE_STEPS = [
  {
    id: 1,
    icon: Globe,
    color: 'blue',
    title: 'Bước 1 — Đăng ký tài khoản MISA meInvoice',
    summary: 'Tạo tài khoản doanh nghiệp trên cổng meInvoice',
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <p>Nếu chưa có tài khoản, truy cập trang chủ MISA meInvoice và đăng ký:</p>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Truy cập <a href="https://meinvoice.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium inline-flex items-center gap-1">meinvoice.vn <ExternalLink className="h-3 w-3" /></a> → nhấn <strong>"Dùng thử miễn phí"</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Điền thông tin doanh nghiệp: tên công ty, MST, email, số điện thoại</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Xác nhận email và đăng nhập lần đầu → hệ thống sẽ cấp tài khoản doanh nghiệp</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
            <p>Ghi lại <strong>Username</strong> (email đăng nhập) và <strong>Password</strong> → nhập vào mục "Thông tin xác thực API" ở trên</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Username/Password dùng để lấy token xác thực, khác với mật khẩu đăng nhập web thông thường nếu bạn đổi sau đó.</span>
        </div>
      </div>
    ),
  },
  {
    id: 2,
    icon: Key,
    color: 'purple',
    title: 'Bước 2 — Lấy AppID (đăng ký Open API)',
    summary: 'AppID là mã định danh ứng dụng để gọi API MISA',
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <p><strong>AppID</strong> là mã do MISA cấp khi bạn đăng ký tích hợp Open API. Mỗi ứng dụng/phần mềm có một AppID riêng.</p>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Đăng nhập tài khoản meInvoice → vào menu <strong>Cài đặt</strong> → <strong>Tích hợp Open API</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Nhấn <strong>"Đăng ký ứng dụng mới"</strong> → điền tên ứng dụng (VD: "CRM nội bộ"), mô tả, URL callback</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Sau khi duyệt, hệ thống hiển thị <strong>AppID</strong> (dạng UUID) → sao chép và nhập vào ô "App ID" ở trên</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
            <p>Hoặc liên hệ MISA trực tiếp qua hướng dẫn tại: <a href="https://www.misa.vn/154127/" target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">misa.vn/154127 <ExternalLink className="h-3 w-3" /></a></p>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-800">
          <strong>Lưu ý:</strong> AppID môi trường Test và Production là <strong>khác nhau</strong>. Khi chuyển sang Production, cần đăng ký lại để lấy AppID Production.
        </div>
      </div>
    ),
  },
  {
    id: 3,
    icon: Hash,
    color: 'emerald',
    title: 'Bước 3 — Xác định Ký hiệu hóa đơn (InvSeries)',
    summary: 'InvSeries là mã ký hiệu HĐ đã thông báo phát hành với cơ quan thuế',
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <p><strong>InvSeries</strong> (Ký hiệu hóa đơn) là chuỗi ký tự định danh loại hóa đơn của doanh nghiệp, đã được đăng ký và thông báo với cơ quan thuế theo Nghị định 123/2020.</p>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-xs text-gray-600 uppercase">Cấu trúc InvSeries:</p>
          <div className="font-mono text-sm bg-white border rounded p-2 text-center tracking-widest">
            <span className="text-blue-600 font-bold">1</span>
            <span className="text-emerald-600 font-bold">C</span>
            <span className="text-amber-600 font-bold">26</span>
            <span className="text-purple-600 font-bold">TYY</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="bg-blue-50 rounded p-2"><span className="font-bold text-blue-700">Ký tự 1</span> — Loại HĐ: <code>1</code>=GTGT, <code>2</code>=Bán hàng</div>
            <div className="bg-emerald-50 rounded p-2"><span className="font-bold text-emerald-700">Ký tự 2</span> — Mã CQT: <code>C</code>=Có mã, <code>K</code>=Không mã</div>
            <div className="bg-amber-50 rounded p-2"><span className="font-bold text-amber-700">Ký tự 3-4</span> — Năm: <code>26</code>=2026, <code>27</code>=2027...</div>
            <div className="bg-purple-50 rounded p-2"><span className="font-bold text-purple-700">Ký tự 5-7</span> — Ký hiệu mẫu số: <code>TYY</code> (cố định)</div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-xs text-gray-600">Cách tìm InvSeries của doanh nghiệp:</p>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Đăng nhập meInvoice → <strong>Quản lý hóa đơn</strong> → <strong>Danh mục hóa đơn</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Xem cột <strong>"Ký hiệu"</strong> — đây chính là InvSeries cần điền</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Nếu chưa có: liên hệ kế toán hoặc tham khảo <strong>Thông báo phát hành hóa đơn</strong> đã nộp cho CQT</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    icon: PenTool,
    color: 'amber',
    title: 'Bước 4 — Cấu hình phương thức ký số (SignType)',
    summary: 'Chọn cách ký điện tử phù hợp với hệ thống của bạn',
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <div className="grid grid-cols-1 gap-3">
          <div className="border rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 rounded">SignType 1</span>
              <span className="font-semibold">Ký bằng USB Token / File .p12</span>
            </div>
            <p className="text-xs text-gray-500">Ký số trực tiếp trên máy tính qua phần mềm ký MISA. Phù hợp ký thủ công, <strong>không phù hợp tích hợp server tự động</strong>.</p>
          </div>
          <div className="border-2 border-emerald-300 bg-emerald-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded">SignType 2 ✓ Khuyến nghị</span>
              <span className="font-semibold">Ký qua HSM — Đồng bộ</span>
            </div>
            <p className="text-xs text-gray-600">Ký số qua dịch vụ HSM (Hardware Security Module) của MISA. <strong>Phù hợp nhất</strong> cho tích hợp server — không cần USB, ký tự động, phát hành ngay.</p>
            <div className="text-xs text-emerald-700 font-medium mt-1">→ Cần đăng ký dịch vụ HSM với MISA để được cấp khóa ký</div>
          </div>
          <div className="border rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 rounded">SignType 3</span>
              <span className="font-semibold">Ký qua HSM — Bất đồng bộ</span>
            </div>
            <p className="text-xs text-gray-500">Tương tự SignType 2 nhưng ký hàng loạt không chờ phản hồi. Phù hợp khi phát hành số lượng lớn hóa đơn cùng lúc.</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs">
          <p className="font-semibold text-gray-600">Để đăng ký dịch vụ HSM (SignType 2/3):</p>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <p>Liên hệ hotline MISA: <a href="tel:19006246" className="text-blue-600 font-medium">1900 6246</a> hoặc email <a href="mailto:meinvoice@misa.com.vn" className="text-blue-600 underline">meinvoice@misa.com.vn</a></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <p>Yêu cầu đăng ký dịch vụ <strong>"Ký số từ xa HSM"</strong> cho tài khoản meInvoice của doanh nghiệp</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <p>MISA sẽ kích hoạt HSM cho tài khoản → có thể ký số tự động qua API</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    icon: User,
    color: 'indigo',
    title: 'Bước 5 — Kiểm tra kết nối và phát hành thử',
    summary: 'Xác nhận cấu hình hoạt động trước khi dùng thật',
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Điền đầy đủ AppID, Username, Password, InvSeries vào form cấu hình ở trên</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Chọn <strong>Môi trường Test</strong> → nhấn <strong>"Lưu cấu hình"</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Nhấn <strong>"Kiểm tra kết nối"</strong> — nếu thành công sẽ hiện thông báo xanh</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
            <p>Vào một hóa đơn → nhấn <strong>"Phát hành HĐĐT"</strong> để thử phát hành hóa đơn test</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>
            <p>Khi đã ổn định → chuyển sang <strong>Môi trường Production</strong> để phát hành hóa đơn thật</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <p className="font-semibold text-gray-600">Tài liệu tham khảo:</p>
          <div className="flex flex-wrap gap-2">
            <a href="https://www.misa.vn/154989/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" /> Tài liệu Open API MISA meInvoice
            </a>
            <span className="text-gray-300">|</span>
            <a href="https://www.misa.vn/154127/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" /> Hướng dẫn đăng ký tích hợp
            </a>
            <span className="text-gray-300">|</span>
            <a href="https://meinvoice.vn" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" /> Cổng meInvoice
            </a>
          </div>
        </div>
      </div>
    ),
  },
];

const STEP_COLORS = {
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500' },
  purple:  { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200', dot: 'bg-purple-500' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-500' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200', dot: 'bg-indigo-500' },
};

function MisaGuide() {
  const [openStep, setOpenStep] = useState(null);

  return (
    <div id="misa-guide" className="bg-white rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-blue-600" />
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Hướng dẫn lấy API MISA — từng bước</h2>
      </div>

      <div className="space-y-2">
        {GUIDE_STEPS.map(step => {
          const c = STEP_COLORS[step.color];
          const Icon = step.icon;
          const isOpen = openStep === step.id;
          return (
            <div key={step.id} className={`rounded-xl border ${isOpen ? c.border : 'border-gray-200'} overflow-hidden transition-all`}>
              <button
                onClick={() => setOpenStep(isOpen ? null : step.id)}
                className={`w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-gray-50 transition-colors ${isOpen ? 'bg-gray-50' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isOpen ? c.text : 'text-gray-800'}`}>{step.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.summary}</p>
                </div>
                <div className={`shrink-0 ${c.text}`}>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {isOpen && (
                <div className={`px-4 pb-4 pt-0 border-t ${c.border}`}>
                  <div className="pt-4">
                    {step.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-400 text-center pt-2 border-t">
        Nếu cần hỗ trợ, liên hệ MISA: <a href="tel:19006246" className="text-blue-600 font-medium">1900 6246</a> (8h–17h30 T2–T7)
      </div>
    </div>
  );
}
