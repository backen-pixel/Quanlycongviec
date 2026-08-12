import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, User, Phone, MapPin, Truck, Download, Loader2, Pencil, Mail, FileText, Link2, Calendar } from 'lucide-react';
import CrmLineItemsReadonly from '../components/CrmLineItemsReadonly';
import { mergeOrderWithSourceQuotation, getDepositRemainingDisplay } from '../lib/quotationTermsDisplay';

const STATUS_MAP = { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
const STATUS_STEPS = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusLoadingStep, setStatusLoadingStep] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => { load(); }, [id]);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/crm/orders/${id}`);
      let next = data;
      if (!(data.items || []).length && data.quotation_id) {
        try {
          const { data: quote } = await api.get(`/crm/quotations/${data.quotation_id}`);
          if (quote?.items?.length) next = { ...data, items: quote.items };
        } catch (_) { /* ignore */ }
      }
      setOrder(next);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus) => {
    if (statusLoadingStep) return;
    if (!confirm(`Chuyển trạng thái sang "${STATUS_MAP[newStatus]}"?`)) return;
    setStatusLoadingStep(newStatus);
    try {
      const { data } = await api.put(`/crm/orders/${id}`, { status: newStatus });
      if (data.auto_project) {
        alert(`🚀 Đã tự động tạo dự án ${data.auto_project.code}!\nĐơn hàng → Project + Tasks đã được gen tự động.`);
      }
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setStatusLoadingStep(null);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/orders/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order?.code || 'don-hang'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
    setPdfLoading(false);
  };

  const displayDoc = useMemo(() => {
    if (!order) return null;
    return mergeOrderWithSourceQuotation(order, order.source_quotation);
  }, [order]);

  const { depositShow, remainingShow } = useMemo(
    () => getDepositRemainingDisplay(displayDoc || {}),
    [displayDoc],
  );

  /** Cọc đã nhận được cộng vào “tổng đã thu”; đã thanh toán = paid_amount trên đơn (thu bổ sung, không trùng cọc). */
  const paymentSummary = useMemo(() => {
    const total = Number(order?.total) || 0;
    const paidRecorded = Number(order?.paid_amount) || 0;
    let dep = 0;
    if (depositShow && depositShow.amount > 0) dep = Number(depositShow.amount);
    else if (Number(displayDoc?.deposit_amount) > 0) dep = Number(displayDoc.deposit_amount);
    let recv = false;
    let notRecv = false;
    if (depositShow) {
      recv = depositShow.received === true;
      notRecv = depositShow.received === false;
    } else if (displayDoc) {
      recv = displayDoc.deposit_received === true;
      notRecv = displayDoc.deposit_received === false;
    }
    const depositCounted = recv && dep > 0 ? dep : 0;
    const totalPaidEffective = paidRecorded + depositCounted;
    const remainingCalc = Math.max(0, total - totalPaidEffective);
    const progressPct = total > 0 ? Math.min((totalPaidEffective / total) * 100, 100) : 0;
    const labelText = String(depositShow?.label || displayDoc?.deposit_label || '').trim();
    const hasDepositLine = dep > 0 || !!labelText || recv || notRecv;
    return {
      total,
      paidRecorded,
      dep,
      recv,
      notRecv,
      depositCounted,
      totalPaidEffective,
      remainingCalc,
      progressPct,
      labelText,
      hasDepositLine,
    };
  }, [order, displayDoc, depositShow]);

  if (loading || !order) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full" /></div>;

  const depositTotalsFooter = (depositShow || remainingShow) ? (
    <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-2 text-xs rounded-lg bg-rose-50/80 px-3 py-2 -mx-1">
      <div className="font-semibold text-rose-900 text-[11px] uppercase tracking-wide">Tiền cọc & khoản còn lại</div>
      {depositShow && (
        <div className="space-y-0.5">
          {(depositShow.installments?.length > 1) ? (
            <div className="space-y-1">
              {depositShow.installments.map((inst, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-rose-900 truncate">
                    {inst.label || `Cọc lần ${i + 1}`}
                    {inst.received === true ? ' · Đã nhận' : inst.received === false ? ' · Chưa nhận' : ''}
                  </span>
                  <span className="font-bold text-rose-950 tabular-nums shrink-0">
                    {inst.amount > 0 ? formatVND(inst.amount) : '—'}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-rose-100 pt-1 mt-1">
                <span className="text-rose-900 font-semibold">Tổng cọc</span>
                <span className="font-bold text-rose-950 tabular-nums">
                  {depositShow.amount > 0 ? formatVND(depositShow.amount) : '—'}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-rose-900">Tiền cọc (theo báo giá)</span>
                <span className="font-bold text-rose-950 tabular-nums">
                  {depositShow.amount > 0 ? formatVND(depositShow.amount) : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-rose-800">
                <span>Trạng thái nhận cọc</span>
                <span className="font-medium">
                  {depositShow.received === true ? 'Đã nhận' : depositShow.received === false ? 'Chưa nhận' : '—'}
                </span>
              </div>
              {depositShow.label && (
                <p className="text-[11px] text-rose-800/90 whitespace-pre-wrap leading-snug border-t border-rose-100 pt-1 mt-1">{depositShow.label}</p>
              )}
            </>
          )}
          {depositShow.fromNotesOnly && order.source_quotation?.code && (
            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
              Một phần lấy từ ghi chú — chi tiết đầy đủ trên báo giá <strong>{order.source_quotation.code}</strong>.
            </p>
          )}
        </div>
      )}
      {remainingShow && (remainingShow.amount > 0 || remainingShow.note) && (
        <div className={`space-y-0.5 ${depositShow ? 'border-t border-rose-100 pt-2' : ''}`}>
          <div className="flex justify-between gap-2">
            <span className="text-slate-700">Còn lại (khi bàn giao / nghiệm thu)</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {remainingShow.amount > 0 ? formatVND(remainingShow.amount) : '—'}
            </span>
          </div>
          {remainingShow.note && (
            <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-snug">{remainingShow.note}</p>
          )}
        </div>
      )}
    </div>
  ) : null;

  const currentStep = STATUS_STEPS.indexOf(order.status);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/orders')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-emerald-600 font-bold">{order.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{order.title || 'Đơn hàng'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/crm/orders/${id}/edit`)} className="h-9 px-4 border border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Pencil className="h-4 w-4" /> Sửa
          </button>
          <button onClick={downloadPdf} disabled={pdfLoading} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {pdfLoading ? 'Đang tải...' : 'Xuất PDF'}
          </button>
        </div>
      </div>

      {/* Progress Steps - Clickable */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <button onClick={() => updateStatus(step)} disabled={!!statusLoadingStep}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-all disabled:cursor-not-allowed ${i <= currentStep ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                title={`Chuyển sang: ${STATUS_MAP[step]}`}>
                {statusLoadingStep === step ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </button>
              <span className={`text-xs font-medium ml-2 ${i <= currentStep ? 'text-emerald-700' : 'text-gray-400'}`}>{STATUS_MAP[step]}</span>
              {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${i < currentStep ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        {order.status !== 'cancelled' && (
          <div className="mt-3 flex justify-end">
            <button onClick={() => updateStatus('cancelled')} className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Hủy đơn hàng</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* 1. Thông tin khách hàng — cùng thứ tự như báo giá */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Thông tin khách hàng</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-medium text-gray-600">Tiêu đề đơn hàng</span>
              <p className="mt-1 font-medium text-gray-900">{order.title || '—'}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-600">Mã đơn</span>
              <p className="mt-1 font-mono text-emerald-700 font-semibold">{order.code}</p>
            </div>
            <div className="md:col-span-2 space-y-2">
              {order.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400 shrink-0" />{order.customer_name}</p>}
              {order.customer_phone && <p className="text-xs text-gray-600 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />{order.customer_phone}</p>}
              {order.customer?.email && <p className="text-xs text-gray-600 flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />{order.customer.email}</p>}
              {order.customer_address && <p className="text-xs text-gray-600 flex items-start gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" /><span>{order.customer_address}</span></p>}
              {order.customer?.tax_code && <p className="text-xs text-gray-600">MST: {order.customer.tax_code}</p>}
              {order.delivery_date && <p className="text-xs text-gray-600 flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-gray-400 shrink-0" />Giao dự kiến: {formatDate(order.delivery_date)}</p>}
            </div>
          </div>
        </div>

        {/* 2. Chi tiết hàng hóa / dịch vụ + tổng + cọc (CrmLineItemsReadonly) */}
        <CrmLineItemsReadonly
          items={order.items || []}
          document={displayDoc}
          accent="emerald"
          extraTotalsFooter={depositTotalsFooter}
        />

        {/* 3. Tiến độ thanh toán đơn — chỉ đơn hàng, đặt sau bảng như phần “thực thu” */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Thanh toán đơn hàng</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-xs text-gray-500">Tổng tiền (sau thuế)</span><span className="font-bold">{formatVND(paymentSummary.total)}</span></div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{displayDoc.discount_type === 'percent' ? `Chiết khấu (${displayDoc.discount_value ?? 0}%)` : 'Chiết khấu (VNĐ)'}</span>
              <span className="text-red-600 font-medium">−{formatVND(displayDoc.discount_amount || 0)}</span>
            </div>
            {paymentSummary.hasDepositLine && (
              <div className="border-t border-dashed border-gray-200 pt-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Cọc (theo báo giá)</p>
                {paymentSummary.dep > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Tiền cọc</span>
                    <span className="font-medium tabular-nums">{formatVND(paymentSummary.dep)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Trạng thái / phương thức</span>
                  <span className="font-medium text-right max-w-[65%]">
                    {paymentSummary.recv ? 'Đã nhận cọc' : paymentSummary.notRecv ? 'Chưa nhận cọc' : '—'}
                  </span>
                </div>
                {paymentSummary.labelText && (
                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap leading-snug rounded-md bg-amber-50/80 border border-amber-100 px-2 py-1.5">{paymentSummary.labelText}</p>
                )}
                {paymentSummary.recv && paymentSummary.depositCounted > 0 && (
                  <p className="text-[10px] text-emerald-800">Số cọc đã nhận được tính vào <strong>Tổng đã thu</strong> bên dưới.</p>
                )}
              </div>
            )}
            <div className="border-t pt-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Đã thanh toán (ghi trên đơn)</span>
                <span className="font-semibold text-emerald-700 tabular-nums">{formatVND(paymentSummary.paidRecorded)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-medium text-gray-700">Tổng đã thu</span>
                <span className="font-bold text-emerald-700 tabular-nums">{formatVND(paymentSummary.totalPaidEffective)}</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-snug">Tổng đã thu = Đã thanh toán trên đơn + Cọc đã nhận (theo báo giá).</p>
            </div>
            {paymentSummary.remainingCalc > 0 ? (
              <div className="flex justify-between border-t pt-2">
                <span className="text-xs font-medium text-red-600">Còn phải thu</span>
                <span className="text-sm font-bold text-red-600 tabular-nums">{formatVND(paymentSummary.remainingCalc)}</span>
              </div>
            ) : (
              <div className="flex justify-between border-t pt-2">
                <span className="text-xs font-medium text-emerald-700">Còn phải thu</span>
                <span className="text-sm font-bold text-emerald-700">0đ</span>
              </div>
            )}
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paymentSummary.progressPct}%` }} />
          </div>
        </div>

        {/* 4. Điều khoản — cuối trang như form báo giá */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" /> Điều khoản
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              {order.order_date && (
                <p className="text-gray-700 flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400 shrink-0" /> Ngày đơn: <span className="font-medium">{formatDate(order.order_date)}</span></p>
              )}
              {displayDoc.valid_until && (
                <p className="text-gray-700 flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-500 shrink-0" /> Ngày HĐ / hiệu lực: <span className="font-medium">{formatDate(displayDoc.valid_until)}</span></p>
              )}
              {displayDoc.payment_terms && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Điều khoản thanh toán</span>
                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">{displayDoc.payment_terms}</p>
                </div>
              )}
              {displayDoc.delivery_address && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Địa chỉ giao hàng</span>
                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">{displayDoc.delivery_address}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {displayDoc.delivery_terms && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Điều khoản giao hàng</span>
                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">{displayDoc.delivery_terms}</p>
                </div>
              )}
              {displayDoc.description && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Mô tả</span>
                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">{displayDoc.description}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {order.quotation_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/crm/quotations/${order.quotation_id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Báo giá gốc{order.source_quotation?.code ? ` (${order.source_quotation.code})` : ''}
                  </button>
                )}
              </div>
            </div>
          </div>
          {displayDoc.notes && (
            <div className="border-t pt-4">
              <span className="text-xs font-semibold text-gray-500 uppercase">Ghi chú / Điều khoản</span>
              <pre className="text-gray-800 mt-2 whitespace-pre-wrap text-sm font-sans max-h-[min(50vh,420px)] overflow-y-auto rounded-lg bg-gray-50 p-3 border border-gray-100">{displayDoc.notes}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
