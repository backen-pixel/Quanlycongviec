import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex bg-[var(--color-page-bg)]">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-[480px] bg-[var(--color-sidebar)] flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_40%,#3b82f6_0%,transparent_60%)]" />
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur text-white text-4xl mb-6">
            🏠
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">TuBep Pro</h1>
          <p className="text-[var(--color-sidebar-text)] text-sm leading-relaxed max-w-xs">
            Hệ thống quản lý quy trình sản xuất tủ bếp chuyên nghiệp
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-left">
            {['Quản lý dự án','Kanban board','Quy trình 8 bước','Báo cáo realtime'].map(f => (
              <div key={f} className="flex items-center gap-2 text-white/70 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-sidebar)] text-white text-2xl mb-3">🏠</div>
            <h1 className="text-xl font-bold text-gray-900">TuBep Pro</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Đăng nhập</h2>
            <p className="text-sm text-gray-500 mb-6">Vui lòng nhập thông tin tài khoản</p>

            {logoutNotice && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg animate-fade-in flex items-center gap-2">
                🌙 {logoutNotice}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg animate-fade-in">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full h-11 px-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-11 px-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[var(--color-primary-600)] text-white rounded-lg font-semibold text-sm hover:bg-[var(--color-primary-700)] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                    Đang đăng nhập...
                  </span>
                ) : 'Đăng nhập'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            © 2026 TuBep Pro. Phần mềm quản lý nội thất.
          </p>
        </div>
      </div>
    </div>
  );
}
