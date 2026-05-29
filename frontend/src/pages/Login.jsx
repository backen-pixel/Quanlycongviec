import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Home, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../lib/auth';

const FEATURES = [
  'Quản lý kho & sản phẩm theo thời gian thực',
  'Theo dõi đơn hàng và tiến độ giao hàng',
  'Báo cáo doanh thu chi tiết, trực quan',
  'Quản lý khách hàng và chăm sóc sau bán',
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
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

  return (
    <div className="min-h-screen flex" style={{ background: '#f5ede2' }}>
      {/* ===== TRÁI — Branding panel (tối) ===== */}
      <aside
        className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden flex-col justify-between p-10 xl:p-12 text-white"
        style={{
          background: 'linear-gradient(135deg, #0d1726 0%, #131f33 50%, #0a1322 100%)',
        }}
      >
        {/* Decorative glow */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-50"
          style={{
            background:
              'radial-gradient(circle at center, rgba(234,108,66,0.32) 0%, rgba(234,108,66,0.10) 35%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 w-[360px] h-[360px] rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle at center, rgba(99,102,241,0.25) 0%, transparent 70%)',
            filter: 'blur(10px)',
          }}
        />
        {/* concentric rings (subtle) */}
        <svg
          className="pointer-events-none absolute top-1/3 -right-24 opacity-[0.07]"
          width="520"
          height="520"
          viewBox="0 0 520 520"
          fill="none"
        >
          {[60, 110, 170, 230, 290].map((r) => (
            <circle key={r} cx="260" cy="260" r={r} stroke="white" strokeWidth="1" />
          ))}
        </svg>

        {/* Top brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-white/10"
            style={{
              background: 'linear-gradient(135deg, #f17a3a, #ea5a23)',
              boxShadow: '0 10px 28px -8px rgba(234,90,35,0.55)',
            }}
          >
            <Home className="h-6 w-6 text-white" strokeWidth={2.4} />
          </div>
          <span className="text-2xl font-bold tracking-tight">TuBep Pro</span>
        </div>

        {/* Hero text */}
        <div className="relative z-10 mt-8">
          <h1
            className="text-4xl xl:text-5xl font-bold leading-[1.15] tracking-tight"
            style={{ color: '#ffffff' }}
          >
            <span style={{ color: '#ffffff' }}>Quản lý nội thất </span>
            <span
              className="italic font-bold"
              style={{
                background: 'linear-gradient(135deg, #f4a26b, #ea5a23)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              thông minh,
            </span>
            <br />
            <span style={{ color: '#ffffff' }}>hiệu quả</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/65 max-w-md">
            Nền tảng toàn diện giúp bạn kiểm soát kho hàng, theo dõi đơn hàng và quản lý khách hàng
            một cách dễ dàng.
          </p>

          <ul className="mt-8 space-y-3.5 max-w-md">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-[14px] text-white/85">
                <span
                  className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: '#ea5a23', boxShadow: '0 0 12px rgba(234,90,35,0.6)' }}
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer copyright */}
        <p className="relative z-10 text-xs text-white/40">
          © 2026 TuBep Pro · Phần mềm quản lý nội thất
        </p>
      </aside>

      {/* ===== PHẢI — Form đăng nhập ===== */}
      <main className="flex-1 flex flex-col relative" style={{ background: '#f5ede2' }}>
        {/* Subtle texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at top right, rgba(234,90,35,0.06), transparent 55%), radial-gradient(ellipse at bottom left, rgba(13,23,38,0.05), transparent 60%)',
          }}
        />

        {/* Top-right kebab (decor) */}
        <div className="absolute top-5 right-6 z-10">
          <button
            type="button"
            className="h-9 w-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/70 hover:text-slate-800 transition"
            title="Tuỳ chọn"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[420px]">
            {/* Logo mobile-only */}
            <div className="lg:hidden text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white mb-3 shadow-md"
                style={{ background: 'linear-gradient(135deg, #f17a3a, #ea5a23)' }}
              >
                <Home className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold" style={{ color: '#0d1726' }}>TuBep Pro</h1>
            </div>

            {/* Heading */}
            <div className="mb-7">
              <h2 className="text-[34px] leading-none font-bold" style={{ color: '#0d1726' }}>
                Đăng nhập
              </h2>
              <p className="mt-2 text-sm font-medium" style={{ color: '#ea5a23' }}>
                Vui lòng nhập thông tin tài khoản của bạn
              </p>
            </div>

            {/* Notices */}
            {logoutNotice && (
              <div className="mb-4 p-3 rounded-xl border text-sm flex items-center gap-2 animate-fade-in"
                   style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' }}>
                🌙 <span>{logoutNotice}</span>
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 rounded-xl border text-sm animate-fade-in"
                   style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.18em] mb-2"
                       style={{ color: '#0d1726' }}>
                  EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="me@company.com"
                    required
                    autoComplete="email"
                    className="w-full h-12 pl-11 pr-4 rounded-xl border bg-white text-[14px] outline-none transition placeholder:text-slate-400"
                    style={{ borderColor: '#e3d8c5' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#ea5a23'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(234,90,35,0.12)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e3d8c5'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.18em] mb-2"
                       style={{ color: '#0d1726' }}>
                  MẬT KHẨU
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full h-12 pl-11 pr-12 rounded-xl border bg-white text-[14px] outline-none transition placeholder:text-slate-400"
                    style={{ borderColor: '#e3d8c5' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#ea5a23'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(234,90,35,0.12)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e3d8c5'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    title={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group w-full h-13 mt-1 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  height: 52,
                  background: 'white',
                  color: '#0d1726',
                  border: '1.5px solid #ea5a23',
                  boxShadow: '0 4px 14px -4px rgba(234,90,35,0.35)',
                }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f17a3a, #ea5a23)';
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.boxShadow = '0 10px 24px -6px rgba(234,90,35,0.55)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.color = '#0d1726';
                  e.currentTarget.style.boxShadow = '0 4px 14px -4px rgba(234,90,35,0.35)';
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

            {/* Footer */}
            <p className="text-center text-[11px] text-slate-500 mt-8">
              © 2026 TuBep Pro · Phần mềm quản lý nội thất
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
