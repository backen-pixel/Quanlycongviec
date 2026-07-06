import { Building2, QrCode, Wallet, CreditCard, FileText, Gift } from 'lucide-react';

export const PAYMENT_METHOD_ICONS = {
  building: Building2,
  qr: QrCode,
  wallet: Wallet,
  'credit-card': CreditCard,
  'file-text': FileText,
  gift: Gift,
};

export const PAYMENT_STATUS_LABELS = {
  awaiting: { label: 'Chờ thanh toán', tone: 'amber' },
  paid: { label: 'Đã thanh toán', tone: 'green' },
  waived: { label: 'Miễn phí', tone: 'gray' },
};

export const FALLBACK_PAYMENT_METHODS_PAID = [
  { id: 'bank_transfer', label: 'Chuyển khoản ngân hàng', desc: 'Xác nhận trong 1–2 giờ', icon: 'building' },
  { id: 'vietqr', label: 'VietQR / QR ngân hàng', desc: 'Quét mã QR', icon: 'qr' },
  { id: 'momo', label: 'Ví MoMo', desc: 'Thanh toán MoMo', icon: 'wallet' },
  { id: 'vnpay', label: 'VNPay', desc: 'Thẻ / QR VNPay', icon: 'credit-card' },
  { id: 'invoice', label: 'Hóa đơn — trả sau', desc: 'Doanh nghiệp B2B', icon: 'file-text' },
];

export const FALLBACK_PAYMENT_METHODS_FREE = [
  { id: 'free', label: 'Miễn phí', desc: 'Không cần thanh toán', icon: 'gift' },
];

export function paymentMethodsForAmount(amount, catalog) {
  const isFree = !amount || amount <= 0;
  if (catalog) {
    return isFree ? (catalog.payment_methods_free || FALLBACK_PAYMENT_METHODS_FREE) : (catalog.payment_methods_paid || FALLBACK_PAYMENT_METHODS_PAID);
  }
  return isFree ? FALLBACK_PAYMENT_METHODS_FREE : FALLBACK_PAYMENT_METHODS_PAID;
}

export const VNPAY_SANDBOX_TEST_CARDS = {
  ncb_success: {
    label: 'NCB — Thành công (khuyến nghị)',
    bank: 'NCB',
    card: '9704198526191432198',
    name: 'NGUYEN VAN A',
    issueDate: '07/15',
    otp: '123456',
    note: 'Trên VNPay: chọn «Thẻ quốc tế» nếu NCB báo lỗi. Không liên quan localhost.',
  },
  visa_success: {
    label: 'VISA quốc tế — Thành công (thử nếu NCB lỗi)',
    bank: 'VISA (No 3DS)',
    card: '4456530000001005',
    name: 'NGUYEN VAN A',
    expiry: '12/26',
    cvv: '123',
    note: 'Chọn tab Thẻ quốc tế trên VNPay.',
  },
};

export function paymentMethodLabel(id, methods) {
  const list = methods || [...FALLBACK_PAYMENT_METHODS_PAID, ...FALLBACK_PAYMENT_METHODS_FREE];
  return list.find((m) => m.id === id)?.label || id || '—';
}
