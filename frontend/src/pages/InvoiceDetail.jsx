import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, Receipt, User, Phone, MapPin, DollarSign, Plus, X, Building2, Download, Printer, Send, FileCheck, AlertCircle, Mail, Loader2, Pencil } from 'lucide-react';

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
  const totalVat = (invoice.items || []).reduce((s, i) => s + (i.vat_amount || (i.amount || 0) * (i.vat_rate || 0) / 100), 0);

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
        {/* Customer + Payment History - horizontal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Khách hàng</h3>
            {invoice.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{invoice.customer_name}</p>}
            {invoice.customer_phone && <p className="text-xs text-gray-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{invoice.customer_phone}</p>}
            {invoice.customer_address && <p className="text-xs text-gray-500 flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" />{invoice.customer_address}</p>}
            {invoice.customer_tax_code && <p className="text-xs text-gray-500 flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gray-400" />MST: {invoice.customer_tax_code}</p>}
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Lịch sử thanh toán</h3>
            {(invoice.payments || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Chưa có thanh toán</p>
            ) : (
              <div className="space-y-2">
                {invoice.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-bold text-emerald-600">{formatVND(p.amount)}</p>
                      <p className="text-[10px] text-gray-400">{p.payment_method === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'} {p.reference_number ? `· ${p.reference_number}` : ''}</p>
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(p.payment_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Items with VAT */}
        <div className="bg-white rounded-xl border p-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Chi tiết hàng hóa</h3>
          <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-[1200px] w-full text-xs">
            <thead><tr className="border-b text-[9px] text-gray-500 uppercase tracking-wider">
              <th className="py-1.5 px-1 text-left">STT</th><th className="py-1.5 px-1 text-left">Mã HH</th><th className="py-1.5 px-1 text-left min-w-[160px]">Tên</th><th className="py-1.5 px-1 text-left min-w-[120px]">Diễn giải</th><th className="py-1.5 px-1 text-center">ĐVT</th>
              <th className="py-1.5 px-1 text-right">Cao</th><th className="py-1.5 px-1 text-right">Rộng</th><th className="py-1.5 px-1 text-right">Dài</th>
              <th className="py-1.5 px-1 text-right">SL</th><th className="py-1.5 px-1 text-right">Đơn giá</th><th className="py-1.5 px-1 text-right">Thành tiền</th>
              <th className="py-1.5 px-1 text-right">CK%</th><th className="py-1.5 px-1 text-right">Tiền CK</th>
              <th className="py-1.5 px-1 text-right">%VAT</th><th className="py-1.5 px-1 text-right">Tiền thuế</th>
              <th className="py-1.5 px-1 text-right">Tổng</th><th className="py-1.5 px-1 text-left">CTKM</th><th className="py-1.5 px-1 text-center">KM</th>
            </tr></thead>
            <tbody>
              {(invoice.items || []).map((item, i) => {
                const vatAmount = item.vat_amount || (item.amount || 0) * (item.vat_rate || 0) / 100;
                const discAmt = item.discount_amount || (item.quantity || 0) * (item.unit_price || 0) * (item.discount_percent || 0) / 100;
                const total = item.total || ((item.amount || 0) + vatAmount);
                return (
                  <tr key={item.id} className="border-b text-xs">
                    <td className="py-1 px-1 text-gray-400">{i + 1}</td>
                    <td className="py-1 px-1 text-gray-500">{item.product_code || '-'}</td>
                    <td className="py-1 px-1 font-medium text-gray-900">{item.name}</td>
                    <td className="py-1 px-1 text-gray-500">{item.description || ''}</td>
                    <td className="py-1 px-1 text-center text-gray-500">{item.unit}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.height || '-'}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.width || '-'}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.length || '-'}</td>
                    <td className="py-1 px-1 text-right">{item.quantity}</td>
                    <td className="py-1 px-1 text-right">{formatVND(item.unit_price)}</td>
                    <td className="py-1 px-1 text-right font-medium">{formatVND(item.amount)}</td>
                    <td className="py-1 px-1 text-right text-gray-500">{item.discount_percent || 0}%</td>
                    <td className="py-1 px-1 text-right text-orange-600">{formatVND(discAmt)}</td>
                    <td className="py-1 px-1 text-right text-gray-500">{item.vat_rate || 0}%</td>
                    <td className="py-1 px-1 text-right text-gray-600">{formatVND(vatAmount)}</td>
                    <td className="py-1 px-1 text-right font-bold text-blue-700">{formatVND(total)}</td>
                    <td className="py-1 px-1 text-gray-500">{item.promo_code || ''}</td>
                    <td className="py-1 px-1 text-center">{item.is_promo ? '🎁' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Tổng tiền hàng</span><span>{formatVND(invoice.subtotal)}</span></div>
              {invoice.discount_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">Chiết khấu</span><span className="text-red-600">-{formatVND(invoice.discount_amount)}</span></div>}
              {totalVat > 0 && <div className="flex justify-between"><span className="text-gray-500">Thuế GTGT</span><span>{formatVND(totalVat)}</span></div>}
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>TỔNG CỘNG</span><span className="text-purple-600">{formatVND(invoice.total)}</span></div>
            </div>
          </div>
        </div>
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
