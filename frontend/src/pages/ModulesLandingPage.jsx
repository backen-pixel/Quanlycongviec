import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Home, Globe, ChevronDown, Bell, Check, ChevronRight, HelpCircle, Send,
  ShoppingCart, Shield, X, Loader2, Mail, Sparkles, Package, CreditCard,
} from 'lucide-react';
import ModulesHeroScene from '../components/login/ModulesHeroScene';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import api from '../lib/api';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';
import { resolveApiOrigin } from '../lib/apiOrigin';
import {
  MODULE_CATEGORIES,
  MODULE_FAQ,
  HERO_SCENE_ICONS,
  filterModules,
} from '../data/upcomingModules';
import { enrichSaasModule, BADGE_LABELS } from '../lib/saasModuleDisplay';
import { PLAN_LABELS } from '../lib/platformConstants';
import {
  PAYMENT_METHOD_ICONS,
  paymentMethodsForAmount,
} from '../lib/saasPayment';

const publicApi = axios.create({ baseURL: `${resolveApiOrigin()}/api/saas` });

const FALLBACK_PLANS = [
  { id: 'free', title: 'Free', subtitle: 'Dùng thử & xưởng nhỏ', price: '0', price_monthly: 0, color: '#64748b', highlights: ['CRM cơ bản', 'Công việc & dự án', '5 người dùng'], trial_days: 14, is_purchasable: true },
  { id: 'standard', title: 'Standard', subtitle: 'Xưởng vừa', price: '990.000', price_monthly: 990000, color: '#3b82f6', badge: 'popular', highlights: ['+ Sản xuất', '+ Khách hàng', '20 người dùng'], trial_days: 14, is_purchasable: true },
  { id: 'pro', title: 'Pro', subtitle: 'Doanh nghiệp', price: '2.490.000', price_monthly: 2490000, color: '#8b5cf6', highlights: ['+ Vận chuyển', '+ AI & Drive', '50 người dùng'], trial_days: 14, is_purchasable: true },
  { id: 'ultra', title: 'Ultra', subtitle: 'Tập đoàn', price: '4.990.000', price_monthly: 4990000, color: '#f59e0b', badge: 'best', highlights: ['+ Kế toán & API', '200 người dùng', 'Hỗ trợ ưu tiên'], trial_days: 14, is_purchasable: true },
];

function SiteHeader() {
  const nav = [
    { label: 'Gói chính', href: '#pricing' },
    { label: 'Modun thêm', href: '#addons' },
    { label: 'FAQ', href: '#contact' },
  ];
  return (
    <header id="top" className="sticky top-0 z-50 border-b border-white/10 bg-[#0a1322]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <Link to="/login" className="flex items-center gap-2.5 shrink-0">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#f17a3a] to-[#ea5a23]">
            <Home className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">TuBep Pro</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-6 text-sm text-white/75">
          {nav.map((item) => (
            <a key={item.label} href={item.href} className="hover:text-white transition">{item.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/login" className="h-9 px-4 rounded-full text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition">Đăng nhập</Link>
        </div>
      </div>
    </header>
  );
}

function HeroVisual() {
  return <ModulesHeroScene className="hidden lg:block w-full max-w-[540px] xl:max-w-[580px] shrink-0 aspect-[16/10] max-h-[320px]" />;
}

function ModuleCardIcon({ mod }) {
  if (mod.iconUrl) {
    return (
      <div className="h-14 w-14 mb-1 shrink-0 flex items-center justify-center">
        <img src={mod.iconUrl} alt="" draggable={false} className="h-14 w-14 object-contain drop-shadow-md module-brand-icon-ready" />
      </div>
    );
  }
  const Icon = mod.Icon;
  return (
    <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-1 shrink-0" style={{ background: `${mod.color}14`, color: mod.color }}>
      {Icon ? <Icon className="h-7 w-7" strokeWidth={1.75} /> : null}
    </div>
  );
}

function NotifyModal({ open, onClose, moduleId, moduleTitle }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setEmail(''); setError(''); setDone(false); }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await publicApi.post('/notify', { email, module_id: moduleId || null, source: 'landing' });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Không gửi được — thử lại sau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center mb-4"><Bell className="h-5 w-5 text-white" /></div>
        {done ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">Đã đăng ký!</h3>
            <p className="mt-2 text-sm text-slate-500">Chúng tôi sẽ gửi thông báo qua email.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer">Đóng</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">Đăng ký nhận thông báo</h3>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-xl px-4 py-2.5 text-sm" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" />Đăng ký</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentMethodPicker({ methods, value, onChange }) {
  if (!methods?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
        <CreditCard className="h-3.5 w-3.5" />
        Phương thức thanh toán *
      </p>
      <div className="grid grid-cols-1 gap-2">
        {methods.map((m) => {
          const Icon = PAYMENT_METHOD_ICONS[m.icon] || CreditCard;
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl border transition cursor-pointer ${
                selected ? 'border-teal-500 bg-teal-50/80 ring-1 ring-teal-500/30' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                  {m.label}
                  {m.web_integrated && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {m.sandbox ? 'Test web' : 'Thanh toán web'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">{m.desc}</div>
              </div>
              {selected && <Check className="h-4 w-4 text-teal-600 shrink-0 ml-auto mt-1" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function submitLabel(paymentMethod, isPlan, isPaid) {
  if (!isPaid) return isPlan ? 'Bắt đầu miễn phí' : 'Mua modun thêm';
  if (paymentMethod === 'vnpay') return 'Tiếp tục — Thanh toán VNPay';
  if (paymentMethod === 'momo') return 'Tiếp tục — Thanh toán MoMo';
  if (paymentMethod === 'vietqr') return 'Tiếp tục — Quét VietQR';
  return isPlan ? 'Gửi đăng ký' : 'Mua modun thêm';
}

function PurchaseModal({ open, onClose, item, purchaseType, catalog }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ buyer_name: '', company_name: '', email: '', phone: '', payment_method: '', payment_reference: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState(null);
  const [vietqrUrl, setVietqrUrl] = useState(null);
  const [purchaseId, setPurchaseId] = useState(null);
  const [googleFilled, setGoogleFilled] = useState(false);
  const isPlan = purchaseType === 'plan';
  const amount = item?.price_monthly ?? (item?.price ? parseInt(String(item.price).replace(/\./g, ''), 10) : 0);
  const paymentMethods = paymentMethodsForAmount(amount, catalog);
  const isPaid = amount > 0;

  useEffect(() => {
    if (open) {
      const methods = paymentMethodsForAmount(amount, catalog);
      const defaultMethod = methods.find((m) => m.id === 'vnpay' && m.web_integrated)?.id
        || methods.find((m) => m.web_integrated)?.id
        || methods[0]?.id
        || '';
      setForm({
        buyer_name: '',
        company_name: '',
        email: '',
        phone: '',
        payment_method: defaultMethod,
        payment_reference: '',
      });
      setError('');
      setDone(false);
      setPaymentInstructions(null);
      setVietqrUrl(null);
      setPurchaseId(null);
      setGoogleFilled(false);
    }
  }, [open, amount, catalog]);

  const fillFromGoogle = async (credential) => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/google-profile', { credential });
      setForm((p) => ({
        ...p,
        email: data.email || p.email,
        buyer_name: data.full_name || p.buyer_name,
      }));
      setGoogleFilled(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Không xác minh được tài khoản Google');
    } finally {
      setLoading(false);
    }
  };

  if (!open || !item) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (isPaid && !form.payment_method) {
      setError('Chọn phương thức thanh toán');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        buyer_name: form.buyer_name,
        email: form.email,
        phone: form.phone,
        payment_method: form.payment_method,
        payment_reference: form.payment_reference || undefined,
        website: '',
      };
      if (isPlan) {
        payload.plan_id = item.id;
        payload.company_name = form.company_name;
      } else {
        payload.module_id = item.id;
      }
      const { data } = await publicApi.post('/purchase', payload);
      if (data.purchase_id && (data.payment_redirect_url || data.vietqr_url || (isPaid && form.payment_method !== 'free'))) {
        navigate(`/modules/checkout/${data.purchase_id}?email=${encodeURIComponent(form.email)}`);
        onClose();
        return;
      }
      setPurchaseId(data.purchase_id || null);
      setVietqrUrl(data.vietqr_url || null);
      setPaymentInstructions(data.payment_instructions || null);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Không gửi được yêu cầu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 cursor-pointer"><X className="h-5 w-5" /></button>
        {done ? (
          <>
            <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center mb-4"><Check className="h-6 w-6 text-white" /></div>
            <h3 className="text-lg font-bold text-slate-900">Đã ghi nhận!</h3>
            <p className="mt-2 text-sm text-slate-500">
              {isPlan ? `Gói ${item.title}` : `Modun ${item.title}`} — email xác nhận gửi tới <strong>{form.email}</strong>
            </p>
            {paymentInstructions && (
              <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <p className="text-sm font-semibold text-teal-900">{paymentInstructions.title}</p>
                <ul className="mt-2 space-y-1.5">
                  {paymentInstructions.lines?.map((line) => (
                    <li key={line} className="text-xs text-teal-800 flex gap-2">
                      <span className="text-teal-500 shrink-0">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {vietqrUrl && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-slate-800 mb-2">Quét mã VietQR để thanh toán</p>
                <img src={vietqrUrl} alt="VietQR" className="mx-auto max-w-[220px] rounded-lg border border-slate-100" />
                {purchaseId && (
                  <p className="mt-2 text-[10px] text-slate-400 font-mono">Mã đơn: {purchaseId.slice(0, 8)}…</p>
                )}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500">Tài khoản kích hoạt sau khi xác nhận thanh toán (trừ gói miễn phí).</p>
            <button type="button" onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold cursor-pointer">Đóng</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">
              {isPlan ? `Đăng ký gói ${item.title}` : `Mua thêm: ${item.title}`}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {amount === 0 ? 'Miễn phí' : `${item.price} đ / tháng`}
              {isPlan && ` · Dùng thử ${item.trial_days || 14} ngày`}
            </p>
            {!isPlan && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Modun mua thêm — cần đã có gói chính với cùng email.
              </p>
            )}
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700 text-center">Điền nhanh bằng Google</p>
                <GoogleSignInButton
                  hintEmail={form.email}
                  onSuccess={fillFromGoogle}
                  onError={(msg) => setError(msg)}
                />
                {googleFilled && (
                  <p className="text-[10px] text-center text-teal-700 flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" /> Đã xác minh email Google
                  </p>
                )}
              </div>

              <input required value={form.buyer_name} onChange={(e) => setForm((p) => ({ ...p, buyer_name: e.target.value }))} placeholder="Họ và tên *" className="w-full border rounded-xl px-4 py-2.5 text-sm" />
              {isPlan && (
                <input required value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="Tên công ty / xưởng *" className="w-full border rounded-xl px-4 py-2.5 text-sm" />
              )}
              <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email *" className="w-full border rounded-xl px-4 py-2.5 text-sm" />
              <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="SĐT (tuỳ chọn)" className="w-full border rounded-xl px-4 py-2.5 text-sm" />

              <PaymentMethodPicker
                methods={paymentMethods}
                value={form.payment_method}
                onChange={(id) => setForm((p) => ({ ...p, payment_method: id }))}
              />

              {isPaid && form.payment_method === 'bank_transfer' && (
                <input
                  value={form.payment_reference}
                  onChange={(e) => setForm((p) => ({ ...p, payment_reference: e.target.value }))}
                  placeholder="Mã giao dịch / nội dung CK (tuỳ chọn)"
                  className="w-full border rounded-xl px-4 py-2.5 text-sm"
                />
              )}

              {isPaid && form.payment_method === 'vnpay' && (
                <div className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  Bạn sẽ chuyển sang cổng VNPay an toàn để thanh toán {item.price} đ.
                </div>
              )}

              {isPaid && form.payment_method === 'vietqr' && (
                <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  Bước tiếp theo: quét mã VietQR trên trang thanh toán.
                </div>
              )}

              {catalog?.payment_bank?.lines?.length > 0 && isPaid && form.payment_method === 'bank_transfer' && (
                <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  {catalog.payment_bank.lines.slice(0, 3).map((l) => <div key={l}>{l}</div>)}
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer disabled:opacity-50" style={{ background: item.color || '#0d9488' }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4" />{submitLabel(form.payment_method, isPlan, isPaid)}</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onSelect, selected }) {
  const isPopular = plan.badge === 'popular';
  const isBest = plan.badge === 'best';
  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg ${selected ? 'ring-2 ring-offset-2' : 'border-slate-200'}`}
      style={selected ? { ringColor: plan.color } : undefined}
    >
      {isPopular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-600 text-white">Phổ biến</span>}
      {isBest && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500 text-white">Ultra</span>}
      <h3 className="text-xl font-bold text-slate-900">{plan.title}</h3>
      <p className="text-xs text-slate-500 mt-0.5">{plan.subtitle}</p>
      <p className="mt-4">
        <span className="text-2xl font-bold" style={{ color: plan.color }}>
          {plan.price_monthly === 0 ? 'Miễn phí' : `${plan.price} đ`}
        </span>
        {plan.price_monthly > 0 && <span className="text-xs text-slate-400"> / tháng</span>}
      </p>
      <ul className="mt-4 space-y-2 flex-1">
        {(plan.highlights || []).map((h) => (
          <li key={h} className="flex items-start gap-2 text-xs text-slate-600">
            <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-500" strokeWidth={2.5} />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={() => onSelect(plan, 'purchase')} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90" style={{ background: plan.color }}>
          {plan.price_monthly === 0 ? 'Bắt đầu miễn phí' : 'Chọn gói này'}
        </button>
        <button type="button" onClick={() => onSelect(plan, 'preview')} className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">
          Xem modun có thể mua thêm →
        </button>
      </div>
    </article>
  );
}

function AddonModuleCard({ mod, onPurchase, onNotify, selectedPlanId }) {
  const inPlan = mod.included_in_selected_plan;
  const includedLabel = mod.included_from_plan_label;

  return (
    <article className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-all ${inPlan ? 'opacity-60 border-slate-100' : 'border-slate-100 hover:shadow-lg hover:-translate-y-0.5'}`}>
      {includedLabel && (
        <span className="absolute top-4 right-4 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
          Có từ {includedLabel}
        </span>
      )}
      <ModuleCardIcon mod={mod} />
      <h3 className="text-base font-bold text-slate-900 pr-20">{mod.title}</h3>
      <p className="mt-1.5 text-xs text-slate-500">{mod.description}</p>
      <p className="mt-3 pt-3 border-t border-slate-100">
        <span className="text-lg font-bold" style={{ color: mod.color }}>+{mod.price} đ</span>
        <span className="text-xs text-slate-400"> / tháng</span>
      </p>
      <div className="mt-3">
        {inPlan ? (
          <p className="text-xs text-center text-teal-700 bg-teal-50 rounded-xl py-2 px-2">Đã có trong gói {PLAN_LABELS[selectedPlanId] || selectedPlanId} — không cần mua thêm</p>
        ) : mod.is_purchasable ? (
          <button type="button" onClick={() => onPurchase(mod)} className="w-full py-2 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ background: mod.color }}>
            Mua modun thêm
          </button>
        ) : (
          <button type="button" onClick={() => onNotify(mod)} className="w-full py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 cursor-pointer">
            <Bell className="h-3.5 w-3.5 inline mr-1" />Nhận thông báo
          </button>
        )}
      </div>
    </article>
  );
}

export default function ModulesLandingPage() {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [modules, setModules] = useState([]);
  const [catalogMeta, setCatalogMeta] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState('standard');
  const [notifyModal, setNotifyModal] = useState({ open: false, moduleId: null, moduleTitle: null });
  const [purchaseModal, setPurchaseModal] = useState({ open: false, item: null, purchaseType: 'plan' });

  const loadCatalog = useCallback(async (planId) => {
    try {
      const { data } = await publicApi.get('/catalog', { params: { plan_id: planId } });
      if (data?.plans?.length) setPlans(data.plans);
      if (data?.modules) setModules(data.modules.map(enrichSaasModule));
      setCatalogMeta({
        payment_methods_paid: data.payment_methods_paid,
        payment_methods_free: data.payment_methods_free,
        payment_bank: data.payment_bank,
      });
    } catch {
      /* fallback plans already set */
    }
  }, []);

  useEffect(() => {
    void loadCatalog(selectedPlanId);
    void preloadModuleIconsFromModules(HERO_SCENE_ICONS.map((i) => ({ imageUrl: i.src })));
  }, [loadCatalog, selectedPlanId]);

  const filteredModules = useMemo(
    () => filterModules(modules, category, sort),
    [modules, category, sort],
  );

  const handlePlanAction = (plan, action) => {
    if (action === 'preview') {
      setSelectedPlanId(plan.id);
      document.getElementById('addons')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setPurchaseModal({ open: true, item: plan, purchaseType: 'plan' });
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <SiteHeader />

      <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #0d1726 0%, #131f33 55%, #0a1322 100%)' }}>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 lg:py-9">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-lg">
              <h1 className="text-2xl sm:text-[1.85rem] font-bold leading-snug">
                <span className="text-white">TuBep Pro — </span>
                <span className="text-[#ea5a23]">4 gói SaaS</span>
                <span className="text-white"> + modun mở rộng</span>
              </h1>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                Chọn gói chính Free · Standard · Pro · Ultra trước. Sau đó mua thêm modun chỉ khi gói của bạn chưa bao gồm.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
                <Shield className="h-4 w-4" />Cấp tài khoản qua email · Bảo mật · Dùng thử 14 ngày
              </div>
            </div>
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* 4 gói chính */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-slate-900 flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Gói chính — bắt buộc trước khi dùng nền tảng
          </h2>
          <p className="mt-1 text-sm text-slate-500">Free · Standard · Pro · Ultra — mỗi gói bao gồm bộ modun lõi khác nhau</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selectedPlanId === plan.id}
              onSelect={handlePlanAction}
            />
          ))}
        </div>
      </section>

      {/* Modun mua thêm */}
      <section id="addons" className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Modun mua thêm
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Chỉ hiện modun <strong>chưa có</strong> trong gói bạn chọn. Đăng ký gói chính trước khi mua thêm.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Xem theo gói:
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="sticky top-14 z-30 bg-white border-b border-slate-100 -mx-4 px-4 sm:mx-0 sm:px-0 py-3 mb-6 flex flex-wrap gap-2 items-center">
            {MODULE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer ${category === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredModules.map((mod) => (
              <AddonModuleCard
                key={mod.id}
                mod={mod}
                selectedPlanId={selectedPlanId}
                onPurchase={(m) => setPurchaseModal({ open: true, item: m, purchaseType: 'module' })}
                onNotify={(m) => setNotifyModal({ open: true, moduleId: m.id, moduleTitle: m.title })}
              />
            ))}
          </div>
          {filteredModules.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-8">Gói {PLAN_LABELS[selectedPlanId]} đã bao gồm các modun phổ biến — không cần mua thêm.</p>
          )}
        </div>
      </section>

      <section id="contact" className="border-t border-slate-200 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 mb-6">
            <HelpCircle className="h-6 w-6 text-blue-500" />Câu hỏi thường gặp
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              ...MODULE_FAQ,
              { q: 'Gói chính và modun thêm khác nhau thế nào?', a: 'Gói Free/Standard/Pro/Ultra là nền tảng bắt buộc, đã gồm nhiều modun lõi. Modun mua thêm chỉ dành cho tính năng chưa có trong gói bạn đang dùng.' },
              { q: 'Khi nào mua được modun thêm?', a: 'Sau khi đã đăng ký gói chính và có tài khoản (cùng email). Hệ thống tự ẩn modun đã có trong gói.' },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="text-sm font-semibold text-slate-900">{item.q}</h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">© 2026 TuBep Pro</footer>

      <NotifyModal {...notifyModal} onClose={() => setNotifyModal({ open: false, moduleId: null, moduleTitle: null })} />
      <PurchaseModal {...purchaseModal} catalog={catalogMeta} onClose={() => setPurchaseModal({ open: false, item: null, purchaseType: 'plan' })} />
    </div>
  );
}
