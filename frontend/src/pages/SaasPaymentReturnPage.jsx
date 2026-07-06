import { Link, useSearchParams } from 'react-router-dom';
import { Check, X, Home, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { resolveApiOrigin } from '../lib/apiOrigin';

const publicApi = axios.create({ baseURL: `${resolveApiOrigin()}/api/saas` });

export default function SaasPaymentReturnPage() {
  const [params] = useSearchParams();
  const success = params.get('success') === '1';
  const purchaseId = params.get('purchase_id') || '';
  const provider = params.get('provider') || '';
  const error = params.get('error') || '';
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(!!purchaseId);

  useEffect(() => {
    if (!purchaseId) {
      setLoading(false);
      return;
    }
    publicApi.get(`/payment/status/${purchaseId}`)
      .then(({ data }) => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [purchaseId]);

  const paid = status?.payment_status === 'paid';
  const buyerEmail = params.get('email') || '';
  const loginUrl = buyerEmail
    ? `/login?email=${encodeURIComponent(buyerEmail)}`
    : '/login';
  const retryUrl = purchaseId && buyerEmail
    ? `/modules/checkout/${purchaseId}?email=${encodeURIComponent(buyerEmail)}`
    : purchaseId
      ? `/modules/checkout/${purchaseId}`
      : '/modules';

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        {provider === 'vnpay' && (success || paid) && (
          <div className="inline-flex h-10 px-4 rounded-lg bg-[#0066b3] items-center justify-center mb-4">
            <span className="text-white font-black text-sm">VNPay</span>
          </div>
        )}
        {loading ? (
          <Loader2 className="h-10 w-10 animate-spin text-teal-600 mx-auto" />
        ) : success || paid ? (
          <>
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Thanh toán thành công</h1>
            <p className="mt-2 text-sm text-slate-500">
              {provider === 'vnpay' && 'VNPay '}
              {provider === 'momo' && 'MoMo '}
              {provider === 'sandbox' && '(Test) '}
              Email xác nhận đã gửi tới {buyerEmail ? <strong>{buyerEmail}</strong> : 'email đăng ký'}.
              Admin sẽ cấp tài khoản sau khi xác nhận.
            </p>
            {purchaseId && (
              <p className="mt-2 text-xs text-slate-400 font-mono">Mã đơn: {purchaseId.slice(0, 8)}…</p>
            )}
          </>
        ) : (
          <>
            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="h-7 w-7 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Thanh toán chưa hoàn tất</h1>
            <p className="mt-2 text-sm text-slate-500">{error || 'Giao dịch bị huỷ hoặc thất bại.'}</p>
            {purchaseId && (
              <Link to={retryUrl} className="mt-4 inline-flex items-center gap-1.5 text-sm text-[#0066b3] font-medium">
                <RefreshCw className="h-3.5 w-3.5" /> Thử thanh toán lại
              </Link>
            )}
          </>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/modules" className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold">
            <Home className="h-4 w-4" /> Về trang gói
          </Link>
          <Link to={loginUrl} className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50">
            Đăng nhập / Google
          </Link>
          <p className="text-[10px] text-slate-400">Sau khi được cấp TK — dùng Google với cùng email</p>
        </div>
      </div>
    </div>
  );
}
