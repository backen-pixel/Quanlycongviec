import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Home, QrCode,
  Check, Gift, Play, Globe, ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import QrLoginPanel from '../components/qr/QrLoginPanel';

const FEATURES = [
  'Quản lý kho & sản phẩm theo thời gian thực',
  'Theo dõi đơn hàng và tiến độ giao hàng',
  'Báo cáo doanh thu chi tiết, trực quan',
  'Quản lý khách hàng và chăm sóc sau bán',
];

const BRAND = {
  navy: '#0d1726',
  navyMid: '#131f33',
  orange: '#ea5a23',
  orangeLight: '#f17a3a',
  cream: '#f5ede2',
  inputBg: '#eef4fc',
  border: '#e3d8c5',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('password');
  const { login, applyAuthSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const logoutNotice = useMemo(() => {
    const reason = searchParams.get('reason');
    if (reason === 'midnight') {
      return 'Phiên đăng nhập đã kết thúc lúc 00:00 (giờ Việt Nam). Vui lòng đăng nhập lại.';
    }
    if (searchParams.get('expired') === '1') {
      return 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.';
    }
    return null;
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi đăng nhập');
    } finally {
      setLoading(false);
    }
  };

  const onQrSuccess = useCallback(async (auth) => {
    try {
      await applyAuthSession(auth);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Lỗi đăng nhập QR');
    }
  }, [applyAuthSession, navigate]);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row">
      {/* ===== TRÁI — Branding (hẹp hơn, nội dung gọn) ===== */}
      <aside
        className="relative shrink-0 overflow-hidden flex flex-col lg:w-[42%] xl:w-[40%] lg:h-full text-white"
        style={{
          background: `linear-gradient(145deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #0a1322 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -top-20 -right-16 w-[360px] h-[360px] rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(234,90,35,0.35) 0%, transparent 70%)' }}
        />
        <svg className="pointer-events-none absolute top-[22%] -right-12 w-[420px] opacity-[0.07]" viewBox="0 0 520 520" fill="none" aria-hidden>
          {[60, 110, 170, 230, 290].map((r) => (
            <circle key={r} cx="260" cy="260" r={r} stroke="white" strokeWidth="1" />
          ))}
        </svg>

        <div className="relative z-10 flex flex-col h-full px-7 py-8 lg:px-10 lg:py-10 xl:px-12">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})`,
                boxShadow: '0 8px 24px -6px rgba(234,90,35,0.5)',
              }}
            >
              <Home className="h-5 w-5 text-white" strokeWidth={2.4} />
            </div>
            <span className="text-xl font-bold tracking-tight">TuBep Pro</span>
          </div>

          {/* Hero — căn giữa theo chiều dọc */}
          <div className="flex-1 flex flex-col justify-center py-8 lg:py-6 min-h-0">
            <div className="max-w-[420px]">
              <h1 className="text-[1.75rem] sm:text-3xl xl:text-[2.35rem] font-bold leading-[1.15] tracking-tight">
                <span className="text-white">Quản lý nội thất </span>
                <span
                  className="italic"
                  style={{
                    background: `linear-gradient(135deg, #f4a26b, ${BRAND.orange})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    color: BRAND.orange,
                  }}
                >
                  thông minh,
                </span>
                <br />
                <span className="text-white">hiệu quả</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Nền tảng toàn diện giúp bạn kiểm soát kho hàng, theo dõi đơn hàng và quản lý khách hàng một cách dễ dàng.
              </p>

              <ul className="mt-5 space-y-2.5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/85">
                    <span className="mt-0.5 h-4 w-4 rounded-full shrink-0 flex items-center justify-center" style={{ background: BRAND.orange }}>
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2.5 max-w-sm">
                <button
                  type="button"
                  onClick={() => navigate('/modules')}
                  className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition hover:brightness-110 cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})`,
                    boxShadow: '0 6px 20px -6px rgba(234,90,35,0.45)',
                  }}
                >
                  <Gift className="h-4 w-4 shrink-0" />
                  Giới thiệu về các Modun sắp được bán
                  <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500 text-white">
                    Mới
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/90 border border-white/20 hover:bg-white/10 transition cursor-pointer"
                >
                  <span className="h-8 w-8 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                    <Play className="h-3.5 w-3.5 ml-0.5" fill="currentColor" />
                  </span>
                  <span className="text-left leading-tight">
                    Xem video giới thiệu
                    <span className="block text-[10px] text-white/45 font-normal">Tìm hiểu nhanh</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <p className="shrink-0 text-[11px] text-white/35 hidden lg:block">
            © 2026 TuBep Pro · Phần mềm quản lý nội thất
          </p>
        </div>
      </aside>

      {/* ===== PHẢI — Form đăng nhập ===== */}
      <section
        className="flex-1 flex flex-col min-h-[520px] lg:h-full lg:min-h-0 lg:overflow-hidden"
        style={{ background: BRAND.cream }}
      >
            <div className="shrink-0 flex items-center justify-end px-6 lg:px-10 pt-5 pb-2">
              <div className="flex items-center gap-1.5">
                <button type="button" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs text-slate-600 hover:bg-white/80 transition">
                  <Globe className="h-3.5 w-3.5" />
                  Tiếng Việt
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                <button type="button" className="h-8 w-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/80 transition">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 lg:px-10 py-4 min-h-0 overflow-y-auto">
              <div className="w-full max-w-[380px] my-auto">
                <div className="lg:hidden text-center mb-6">
                  <div
                    className="inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white mb-2"
                    style={{ background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})` }}
                  >
                    <Home className="h-6 w-6" />
                  </div>
                  <p className="text-lg font-bold" style={{ color: BRAND.navy }}>TuBep Pro</p>
                </div>

                <div className="mb-5">
                  <h2 className="text-[28px] sm:text-[32px] leading-none font-bold" style={{ color: BRAND.navy }}>
                    Đăng nhập
                  </h2>
                  <p className="mt-1.5 text-sm font-medium" style={{ color: BRAND.orange }}>
                    Vui lòng nhập thông tin tài khoản của bạn
                  </p>
                </div>

                {logoutNotice && (
                  <div className="mb-4 p-3 rounded-xl border text-sm flex items-center gap-2 bg-amber-50 border-amber-200 text-amber-900">
                    🌙 <span>{logoutNotice}</span>
                  </div>
                )}
                {error && (
                  <div className="mb-4 p-3 rounded-xl border text-sm bg-red-50 border-red-200 text-red-800">
                    {error}
                  </div>
                )}

                <div className="flex gap-1 mb-5 p-1 rounded-full border bg-white/60" style={{ borderColor: BRAND.border }}>
                  <button
                    type="button"
                    onClick={() => { setMode('password'); setError(''); }}
                    className="flex-1 py-2 rounded-full text-sm font-semibold transition"
                    style={
                      mode === 'password'
                        ? { background: 'white', color: BRAND.navy, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                        : { color: '#64748b' }
                    }
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('qr'); setError(''); }}
                    className="flex-1 py-2 rounded-full text-sm font-semibold transition inline-flex items-center justify-center gap-1.5"
                    style={
                      mode === 'qr'
                        ? { background: 'white', color: BRAND.navy, boxShadow: '0 1px 3px rgba(0,0,0,0,0.08)' }
                        : { color: '#64748b' }
                    }
                  >
                    <QrCode className="h-4 w-4" />
                    QR Code
                  </button>
                </div>

                {mode === 'qr' ? (
                  <QrLoginPanel target="web" onSuccess={onQrSuccess} onError={(msg) => setError(msg)} />
                ) : (
                  <form onSubmit={submit} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] mb-1.5" style={{ color: BRAND.navy }}>
                        EMAIL
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="me@company.com"
                          required
                          autoComplete="email"
                          className="login-field w-full h-11 pl-10 pr-4 rounded-xl border text-sm outline-none transition placeholder:text-slate-400"
                          style={{ background: BRAND.inputBg, borderColor: '#d8e4f4' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] mb-1.5" style={{ color: BRAND.navy }}>
                        MẬT KHẨU
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type={showPwd ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          autoComplete="current-password"
                          className="login-field w-full h-11 pl-10 pr-11 rounded-xl border text-sm outline-none transition placeholder:text-slate-400"
                          style={{ background: BRAND.inputBg, borderColor: '#d8e4f4' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white/60 transition"
                        >
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="login-submit group w-full h-12 mt-1 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                      style={{
                        background: 'white',
                        color: BRAND.navy,
                        border: `1.5px solid ${BRAND.orange}`,
                        boxShadow: '0 4px 12px -4px rgba(234,90,35,0.3)',
                      }}
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Đang đăng nhập…
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          Đăng nhập
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>

            <p className="shrink-0 text-center text-[11px] text-slate-500 pb-5 lg:pb-6">
              © 2026 TuBep Pro · Phần mềm quản lý nội thất
            </p>
      </section>
    </div>
  );
}
