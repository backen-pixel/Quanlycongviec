import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('admin@tubep.vn');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (err) { setError(err.response?.data?.error || 'Lỗi đăng nhập'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-2xl shadow-lg mb-3">🏠</div>
          <h1 className="text-xl font-bold text-gray-900">TuBep Pro</h1>
          <p className="text-gray-500 text-sm">Quản lý công việc nhân viên</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-center">Đăng Nhập</h2>
          {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full h-10 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-[11px] text-blue-700 font-medium">🔑 Demo: admin@tubep.vn / admin123</p>
          </div>
        </form>
      </div>
    </div>
  );
}
