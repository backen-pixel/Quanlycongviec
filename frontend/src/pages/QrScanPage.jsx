import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import QrLoginInvitePanel from '../components/qr/QrLoginInvitePanel';

/** Web hiển thị QR — app quét để đăng nhập. */
export default function QrScanPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5ede2' }}>
      <header className="flex items-center gap-3 px-4 py-4 border-b bg-white/80 backdrop-blur"
              style={{ borderColor: '#e3d8c5' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#0d1726' }}>Mã QR đăng nhập app</h1>
          <p className="text-xs text-slate-500">App quét mã này để đăng nhập bằng tài khoản web</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <QrLoginInvitePanel onError={setError} />
        {error ? (
          <p className="mt-4 text-sm text-red-600 text-center max-w-sm">{error}</p>
        ) : null}
      </main>
    </div>
  );
}
