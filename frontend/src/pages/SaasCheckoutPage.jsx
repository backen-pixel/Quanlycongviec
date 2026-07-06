import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Check, CreditCard, Home, Loader2, QrCode, RefreshCw,
  Shield, Wallet, Building2, FileText, ExternalLink,
} from 'lucide-react';
import { resolveApiOrigin } from '../lib/apiOrigin';
import { PAYMENT_STATUS_LABELS, VNPAY_SANDBOX_TEST_CARDS } from '../lib/saasPayment';

const publicApi = axios.create({ baseURL: `${resolveApiOrigin()}/api/saas` });

const METHOD_ICONS = {
  vnpay: CreditCard,
  momo: Wallet,
  vietqr: QrCode,
  bank_transfer: Building2,
  invoice: FileText,
};

function StatusBadge({ status }) {
  const meta = PAYMENT_STATUS_LABELS[status] || { label: status, tone: 'gray' };
  const tones = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    green: 'bg-green-50 text-green-800 border-green-200',
    gray: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${tones[meta.tone] || tones.gray}`}>
      {meta.label}
    </span>
  );
}

function CopyRow({ label, value }) {
  const copy = () => navigator.clipboard?.writeText(value);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-500 shrink-0">{label}</span>
      <button type="button" onClick={copy} className="font-mono text-slate-800 hover:text-blue-700 cursor-pointer text-right break-all" title="Bấm để copy">
        {value}
      </button>
    </div>
  );
}

function VnpaySandboxGuide() {
  const card = VNPAY_SANDBOX_TEST_CARDS.ncb_success;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-left">
      <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Hướng dẫn thẻ test VNPay</p>
      <p className="text-[11px] text-amber-800 mt-1">{card.note}</p>
      <div className="mt-3 space-y-1.5 bg-white/70 rounded-lg p-3 border border-amber-100">
        <CopyRow label="Ngân hàng" value={card.bank} />
        <CopyRow label="Số thẻ" value={card.card} />
        <CopyRow label="Tên chủ thẻ" value={card.name} />
        <CopyRow label="Ngày phát hành" value={card.issueDate} />
        <CopyRow label="OTP" value={card.otp} />
      </div>
      <p className="text-[10px] text-amber-700 mt-2">
        <strong>Không phải do localhost</strong> — lỗi thẻ xảy ra trên server VNPay. Thử tab <strong>Thẻ quốc tế VISA</strong> nếu NCB báo lỗi.
        {' '}Danh sách thẻ:{' '}
        <a href="https://sandbox.vnpayment.vn/apis/vnpay-demo/" target="_blank" rel="noreferrer" className="underline">
          sandbox.vnpayment.vn
        </a>
      </p>
    </div>
  );
}

function VnpayPanel({ checkout, onPay, paying }) {
  const isSandbox = checkout.payment_mode === 'sandbox'
    || checkout.payment_gateway?.sandbox
    || (checkout.payment_redirect_url || '').includes('sandbox.vnpayment');
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-xl bg-[#0066b3] flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm tracking-tight">VNPay</span>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Cổng thanh toán VNPay</p>
          <p className="text-xs text-slate-500">Thẻ nội địa · Thẻ quốc tế · QR VNPay</p>
        </div>
        {isSandbox && (
          <span className="ml-auto text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-amber-100 text-amber-800">
            Sandbox
          </span>
        )}
      </div>
      <ul className="text-xs text-slate-600 space-y-1.5 mb-4">
        <li className="flex gap-2"><Shield className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />Bảo mật chuẩn PCI DSS</li>
        <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />Xác nhận tự động sau khi thanh toán</li>
      </ul>
      <button
        type="button"
        onClick={onPay}
        disabled={paying || !checkout.payment_redirect_url}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0066b3] hover:bg-[#005299] text-white font-semibold text-sm disabled:opacity-60 cursor-pointer transition"
      >
        {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {paying ? 'Đang chuyển…' : `Thanh toán ${checkout.amount_label}`}
      </button>
      {isSandbox && (
        <>
          <p className="mt-2 text-[10px] text-amber-700 text-center">Môi trường test — không trừ tiền thật</p>
          <VnpaySandboxGuide />
        </>
      )}
    </div>
  );
}

function MomoPanel({ checkout, onPay, paying }) {
  return (
    <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/80 to-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-xl bg-[#a50064] flex items-center justify-center shrink-0">
          <Wallet className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Ví MoMo</p>
          <p className="text-xs text-slate-500">Thanh toán qua ứng dụng MoMo</p>
        </div>
        {checkout.payment_mode === 'sandbox' && (
          <span className="ml-auto text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-amber-100 text-amber-800">Test</span>
        )}
      </div>
      <button
        type="button"
        onClick={onPay}
        disabled={paying || !checkout.payment_redirect_url}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#a50064] hover:bg-[#8a0054] text-white font-semibold text-sm disabled:opacity-60 cursor-pointer"
      >
        {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Thanh toán MoMo
      </button>
    </div>
  );
}

function QrPanel({ checkout }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
      <p className="text-sm font-semibold text-slate-800 mb-1">Quét mã VietQR</p>
      <p className="text-xs text-slate-500 mb-4">Mở app ngân hàng → Quét mã → Xác nhận chuyển khoản</p>
      {checkout.vietqr_url ? (
        <img
          src={checkout.vietqr_url}
          alt="VietQR"
          className="mx-auto max-w-[240px] rounded-xl border border-slate-100 shadow-sm"
        />
      ) : (
        <div className="py-8 text-slate-400 text-sm">Đang tải mã QR…</div>
      )}
      <p className="mt-3 text-lg font-bold text-teal-700">{checkout.amount_label}</p>
      <p className="text-[11px] text-slate-400 mt-1">Nội dung: TUBEP {checkout.buyer_email}</p>
    </div>
  );
}

function InstructionsPanel({ checkout }) {
  const inst = checkout.payment_instructions;
  if (!inst) return null;
  return (
    <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-5">
      <p className="text-sm font-semibold text-teal-900">{inst.title}</p>
      <ul className="mt-2 space-y-1.5">
        {inst.lines?.map((line) => (
          <li key={line} className="text-xs text-teal-800 flex gap-2">
            <span className="text-teal-500 shrink-0">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SaasCheckoutPage() {
  const { purchaseId } = useParams();
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!purchaseId) return;
    try {
      const qs = email ? `?email=${encodeURIComponent(email)}` : '';
      const { data } = await publicApi.get(`/payment/checkout/${purchaseId}${qs}`);
      setCheckout(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được thông tin thanh toán');
    } finally {
      setLoading(false);
    }
  }, [purchaseId, email]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!purchaseId || checkout?.payment_status === 'paid' || checkout?.payment_status === 'waived') return;
    const t = setInterval(async () => {
      try {
        const { data } = await publicApi.get(`/payment/status/${purchaseId}`);
        if (data.payment_status === 'paid') {
          setCheckout((prev) => (prev ? { ...prev, payment_status: 'paid' } : prev));
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [purchaseId, checkout?.payment_status]);

  const handlePay = () => {
    if (!checkout?.payment_redirect_url) return;
    setPaying(true);
    window.location.href = checkout.payment_redirect_url;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !checkout) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <p className="text-red-600 text-sm">{error || 'Không tìm thấy đơn'}</p>
          <Link to="/modules" className="mt-4 inline-block text-sm text-teal-600 font-medium">← Về trang gói</Link>
        </div>
      </div>
    );
  }

  const paid = checkout.payment_status === 'paid';
  const waived = checkout.payment_status === 'waived';
  const method = checkout.payment_method;
  const MethodIcon = METHOD_ICONS[method] || CreditCard;

  if (paid || waived) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{waived ? 'Đăng ký thành công' : 'Thanh toán thành công'}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {checkout.product_title} — email xác nhận gửi tới <strong>{checkout.buyer_email}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-400 font-mono">Mã đơn: {checkout.purchase_id?.slice(0, 8)}…</p>
          <p className="mt-3 text-xs text-slate-500">Admin sẽ cấp tài khoản qua email sau khi xác nhận.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/modules" className="py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold">Về trang gói</Link>
            <Link to="/login" className="text-sm text-slate-500">Đăng nhập</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/modules')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-teal-600" />
            <span className="font-semibold text-slate-900">TuBep Pro — Thanh toán</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {/* Tóm tắt đơn */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                {checkout.purchase_type === 'plan' ? 'Gói dịch vụ' : 'Modun thêm'}
              </p>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">{checkout.product_title}</h1>
              <p className="text-sm text-slate-500 mt-1">{checkout.buyer_name} · {checkout.buyer_email}</p>
              {checkout.company_name && <p className="text-xs text-slate-400">{checkout.company_name}</p>}
            </div>
            <StatusBadge status={checkout.payment_status} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MethodIcon className="h-4 w-4" />
              {checkout.payment_method_label}
            </div>
            <p className="text-2xl font-bold text-teal-700">{checkout.amount_label}</p>
          </div>
        </section>

        {/* Panel thanh toán theo phương thức */}
        {method === 'vnpay' && (
          <VnpayPanel checkout={checkout} onPay={handlePay} paying={paying} />
        )}
        {method === 'momo' && (
          <MomoPanel checkout={checkout} onPay={handlePay} paying={paying} />
        )}
        {(method === 'vietqr' || method === 'bank_transfer') && (
          <>
            {checkout.vietqr_url && <QrPanel checkout={checkout} />}
            <InstructionsPanel checkout={checkout} />
            <p className="text-xs text-center text-slate-500">
              Sau khi chuyển khoản, trang tự cập nhật khi admin xác nhận (hoặc bấm làm mới).
            </p>
          </>
        )}
        {method === 'invoice' && <InstructionsPanel checkout={checkout} />}

        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Kiểm tra trạng thái
          </button>
          <span className="text-slate-300">|</span>
          <Link to="/modules" className="text-xs text-slate-500 hover:text-slate-800">Huỷ / Quay lại</Link>
        </div>

        <p className="text-[10px] text-center text-slate-400 pb-4">
          Mã đơn {checkout.purchase_id?.slice(0, 8)}… · Thanh toán an toàn · TuBep Pro
        </p>
      </main>
    </div>
  );
}
