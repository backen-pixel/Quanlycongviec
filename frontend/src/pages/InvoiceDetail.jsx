import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, User, Phone, MapPin, DollarSign, X, Building2, Download, Printer, Send, FileCheck, AlertCircle, Mail, Loader2, Pencil, Link2, Calendar, FileText } from 'lucide-react';
import CrmLineItemsReadonly from '../components/CrmLineItemsReadonly';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showMisaEmail, setShowMisaEmail] = useState(false);
  const [misaLoading, setMisaLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  useEffect(() => { load(); }, [id]);
  const load = async () => { setLoading(true); const { data } = await api.get(`/crm/invoices/${id}`); setInvoice(data); setLoading(false); };

  const publishToMisa = async () => {
    if (!confirm('Phát hành hóa đơn điện tử lên MISA meInvoice?')) return;
    setMisaLoading(true);
    try {
      const { data } = await api.post(`/crm/invoices/${id}/misa-publish`);
      alert(`Phát hành thành công!\nSố HĐ MISA: ${data.invoiceNo || 'N/A'}`);
      load();
    } catch (e) {
      alert('Lỗi phát hành MISA: ' + (e.response?.data?.error || e.message));
    } finally { setMisaLoading(false); }
  };

  const sendMisaEmail = async (email) => {
    setMisaLoading(true);
    try {
      await api.post(`/crm/invoices/${id}/misa-send-email`, { email });
      alert('Đã gửi email hóa đơn điện tử thành công!');
      setShowMisaEmail(false);
      load();
    } catch (e) {
      alert('Lỗi gửi email: ' + (e.response?.data?.error || e.message));
    } finally { setMisaLoading(false); }
  };

  const recordPayment = async (amount, method, ref) => {
    if (payLoading) return;
    setPayLoading(true);
    try {
      await api.post(`/crm/invoices/${id}/payments`, { amount: parseFloat(amount), payment_method: method, reference_number: ref });
      setShowPay(false);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setPayLoading(false);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.code || 'hoa-don'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
    setPdfLoading(false);
  };

  const printInvoice = async () => {
    if (printLoading) return;
    setPrintLoading(true);
    try {
      const response = await api.get(`/crm/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.addEventListener('load', () => { printWindow.print(); });
      }
    } catch (e) { alert('Lỗi in hóa đơn'); }
    setPrintLoading(false);
  };

  if (loading || !invoice) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full" /></div>;

  const remaining = (invoice.total || 0) - (invoice.paid_amount || 0);
  const paidPct = invoice.total > 0 ? Math.min(((invoice.paid_amount || 0) / invoice.total) * 100, 100) : 0;

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/invoices')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-purple-600 font-bold">{invoice.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{invoice.title || 'Hóa đơn'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(`/crm/invoices/${id}/edit`)} className="h-9 px-4 border border-purple-300 text-purple-600 hover:bg-purple-50 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Pencil className="h-4 w-4" /> Sửa
          </button>
          <button onClick={downloadPdf} disabled={pdfLoading} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {pdfLoading ? 'Đang tải...' : 'Xuất PDF'}
          </button>
          <button onClick={printInvoice} disabled={printLoading} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            {printLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printLoading ? 'Đang in...' : 'In hóa đơn'}
          </button>
          {invoice.misa_status === 'not_sent' || !invoice.misa_status ? (
            <button onClick={publishToMisa} disabled={misaLoading} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
              <FileCheck className="h-4 w-4" /> {misaLoading ? 'Đang phát hành...' : 'Phát hành HĐĐT'}
            </button>
          ) : invoice.misa_status === 'published' ? (
            <button onClick={() => setShowMisaEmail(true)} disabled={misaLoading} className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
              <Mail className="h-4 w-4" /> Gửi email HĐĐT
            </button>
          ) : null}
          {remaining > 0 && (
            <button onClick={() => setShowPay(true)} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><DollarSign className="h-4 w-4" /> Thu tiền</button>
          )}
        </div>
      </div>

      {/* Payment Progress */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-500">Tiến độ thanh toán</p>
            <p className="text-2xl font-bold text-gray-900">{formatVND(invoice.paid_amount || 0)} <span className="text-sm font-normal text-gray-400">/ {formatVND(invoice.total)}</span></p>
          </div>
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${paidPct >= 100 ? 'bg-emerald-100 text-emerald-700' : paidPct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {paidPct >= 100 ? '✅ Đã thanh toán đủ' : paidPct > 0 ? `${Math.round(paidPct)}% đã TT` : 'Chưa thanh toán'}
          </div>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${paidPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${paidPct}%` }} />
        </div>
        {remaining > 0 && <p className="text-sm text-red-600 font-medium mt-2">Còn nợ: {formatVND(remaining)}</p>}
      </div>

      {/* MISA meInvoice Status Panel */}
      <MisaStatusPanel invoice={invoice} onPublish={publishToMisa} onSendEmail={() => setShowMisaEmail(true)} loading={misaLoading} />

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Khách hàng</h3>
            {invoice.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400 shrink-0" />{invoice.customer_name}</p>}
            {invoice.customer_phone && <p className="text-xs text-gray-600 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />{invoice.customer_phone}</p>}
            {(invoice.customer?.email || invoice.customer_email) && (
              <p className="text-xs text-gray-600 flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />{invoice.customer?.email || invoice.customer_email}</p>
            )}
            {invoice.customer_address && <p className="text-xs text-gray-600 flex items-start gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" /><span>{invoice.customer_address}</span></p>}
            {(invoice.customer_tax_code || invoice.customer?.tax_code) && (
              <p className="text-xs text-gray-600 flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />MST: {invoice.customer_tax_code || invoice.customer?.tax_code}</p>
            )}
          </div>

          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-600" /> Chứng từ & điều khoản
            </h3>
            {invoice.invoice_date && (
              <p className="text-sm text-gray-800 flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /> Ngày HĐ: <span className="font-medium">{formatDate(invoice.invoice_date)}</span></p>
            )}
            {invoice.due_date && (
              <p className="text-sm text-gray-800 flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-500" /> Hạn TT: <span className="font-medium">{formatDate(invoice.due_date)}</span></p>
            )}
            {invoice.payment_terms && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase">Điều khoản thanh toán</span>
                <p className="text-gray-800 mt-1 whitespace-pre-wrap text-sm">{invoice.payment_terms}</p>
              </div>
            )}
            {invoice.payment_method && (
              <p className="text-xs text-gray-600">Hình thức (ghi trên HĐ): <span className="font-medium">{invoice.payment_method}</span></p>
            )}
            {invoice.bank_account && (
              <p className="text-xs text-gray-600 whitespace-pre-wrap">TK NH: {invoice.bank_account}</p>
            )}
            {invoice.description && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase">Mô tả</span>
                <p className="text-gray-800 mt-1 whitespace-pre-wrap text-sm">{invoice.description}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase">Ghi chú</span>
                <pre className="text-gray-800 mt-1 whitespace-pre-wrap text-sm font-sans">{invoice.notes}</pre>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {invoice.order_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/crm/orders/${invoice.order_id}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" /> Đơn hàng liên quan
                </button>
              )}
              {invoice.quotation_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/crm/quotations/${invoice.quotation_id}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" /> Báo giá gốc
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Lịch sử thanh toán</h3>
          {(invoice.payments || []).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Chưa có thanh toán</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-emerald-600">{formatVND(p.amount)}</p>
                    <p className="text-[10px] text-gray-500">{p.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'} {p.reference_number ? `· ${p.reference_number}` : ''}</p>
                    {p.notes && <p className="text-[10px] text-gray-400 mt-1">{p.notes}</p>}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(p.payment_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <CrmLineItemsReadonly items={invoice.items || []} document={invoice} accent="purple" />
      </div>

      {showPay && <PayModal remaining={remaining} code={invoice.code} onPay={recordPayment} onClose={() => setShowPay(false)} loading={payLoading} />}
      {showMisaEmail && (
        <MisaEmailModal
          defaultEmail={invoice.customer?.email || ''}
          onSend={sendMisaEmail}
          onClose={() => setShowMisaEmail(false)}
          loading={misaLoading}
        />
      )}
    </div>
  );
}

const MISA_STATUS_MAP = {
  not_sent: { label: 'Chưa phát hành', color: 'bg-gray-100 text-gray-600', icon: '📄' },
  published: { label: 'Đã phát hành HĐĐT', color: 'bg-blue-100 text-blue-700', icon: '✅' },
  sent_email: { label: 'Đã gửi email', color: 'bg-indigo-100 text-indigo-700', icon: '📧' },
  cancelled: { label: 'Đã hủy HĐĐT', color: 'bg-red-100 text-red-700', icon: '❌' },
};

function MisaStatusPanel({ invoice, onPublish, onSendEmail, loading }) {
  const status = invoice.misa_status || 'not_sent';
  const info = MISA_STATUS_MAP[status] || MISA_STATUS_MAP.not_sent;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hóa đơn điện tử (MISA meInvoice)</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${info.color}`}>{info.icon} {info.label}</span>
              {invoice.misa_invoice_no && (
                <span className="text-xs text-gray-500">Số HĐ: <span className="font-bold text-gray-800">{invoice.misa_invoice_no}</span></span>
              )}
              {invoice.misa_published_at && (
                <span className="text-xs text-gray-400">· {new Date(invoice.misa_published_at).toLocaleString('vi-VN')}</span>
              )}
            </div>
            {invoice.misa_error_message && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {invoice.misa_error_message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(status === 'not_sent') && (
            <button onClick={onPublish} disabled={loading} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Send className="h-3.5 w-3.5" /> {loading ? 'Đang xử lý...' : 'Phát hành HĐĐT'}
            </button>
          )}
          {(status === 'published' || status === 'sent_email') && (
            <button onClick={onSendEmail} disabled={loading} className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Mail className="h-3.5 w-3.5" /> {status === 'sent_email' ? 'Gửi lại email' : 'Gửi email'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MisaEmailModal({ defaultEmail, onSend, onClose, loading }) {
  const [email, setEmail] = useState(defaultEmail);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Mail className="h-4 w-4 text-indigo-600" /> Gửi email HĐĐT</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Hệ thống sẽ gửi hóa đơn điện tử đã phát hành qua MISA đến địa chỉ email bên dưới.</p>
        <div>
          <label className="text-xs font-medium text-gray-600">Email người nhận</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full h-10 px-3 border rounded-lg text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button
            onClick={() => onSend(email)}
            disabled={loading || !email}
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            <Send className="h-4 w-4" /> {loading ? 'Đang gửi...' : 'Gửi ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ remaining, code, onPay, onClose, loading }) {
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState('transfer');
  const [ref, setRef] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Thu tiền — {code}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-gray-600">Số tiền (còn nợ: {formatVND(remaining)})</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-gray-600">Hình thức</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1"><option value="transfer">🏦 Chuyển khoản</option><option value="cash">💵 Tiền mặt</option></select>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Số GD / Ghi chú</label><input value={ref} onChange={e => setRef(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} disabled={loading} className="h-9 px-4 border rounded-lg text-sm cursor-pointer disabled:opacity-50">Hủy</button>
          <button onClick={() => onPay(amount, method, ref)} disabled={loading} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60 flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Đang lưu...' : 'Xác nhận thu'}
          </button>
        </div>
      </div>
    </div>
  );
}
