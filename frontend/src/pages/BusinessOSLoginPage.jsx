import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BarChart3, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isStrictAdmin } from '../lib/adminRole';

export default function BusinessOSLoginPage() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isStrictAdmin(user)) navigate('/business-os', { replace: true });
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!authLoading && user && !isStrictAdmin(user)) {
      setError('Phiên hiện tại không có vai trò Founder/admin và đã bị từ chối cục bộ.');
      void logout('founder_local_role_rejected');
    }
  }, [authLoading, logout, user]);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (isStrictAdmin(user)) return <Navigate to="/business-os" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const authenticatedUser = await login(email, password);
      if (!isStrictAdmin(authenticatedUser)) {
        await logout('founder_local_role_rejected');
        setError('Tài khoản đã xác thực nhưng không có vai trò Founder/admin. Phiên Founder-local vẫn bị khóa.');
        return;
      }
      navigate('/business-os', { replace: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || 'Không thể đăng nhập Founder-local.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1220] px-4 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 shadow-2xl sm:p-9">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white"><BarChart3 className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-black tracking-tight">Founder-local</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Business AI OS · read only</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Hồ sơ cục bộ không ghi vận hành</p>
          <p className="mt-1">Không socket, presence, device heartbeat, notification heartbeat hoặc activity logging.</p>
        </div>

        {user && !isStrictAdmin(user) ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-900">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Phiên hiện tại không phải Founder/admin. Đăng nhập bên dưới bằng tài khoản đủ quyền.
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            Đăng nhập Founder-local
          </button>
        </form>
      </section>
    </main>
  );
}
