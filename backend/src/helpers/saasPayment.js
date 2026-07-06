const config = require('../config');

/** @typedef {{ id: string, label: string, desc: string, icon: string, forPaid: boolean, forFree: boolean }} PaymentMethodDef */

const PAYMENT_METHODS = [
  {
    id: 'bank_transfer',
    label: 'Chuyển khoản ngân hàng',
    desc: 'Chuyển khoản — kích hoạt sau khi xác nhận',
    icon: 'building',
    forPaid: true,
    forFree: false,
  },
  {
    id: 'vietqr',
    label: 'VietQR / QR ngân hàng',
    desc: 'Quét mã QR — nhanh, không phí',
    icon: 'qr',
    forPaid: true,
    forFree: false,
  },
  {
    id: 'momo',
    label: 'Ví MoMo',
    desc: 'Thanh toán qua ứng dụng MoMo',
    icon: 'wallet',
    forPaid: true,
    forFree: false,
  },
  {
    id: 'vnpay',
    label: 'VNPay (Thẻ / QR)',
    desc: 'Thẻ nội địa, quốc tế hoặc QR VNPay',
    icon: 'credit-card',
    forPaid: true,
    forFree: false,
  },
  {
    id: 'invoice',
    label: 'Xuất hóa đơn — thanh toán sau',
    desc: 'Dành doanh nghiệp — nhân viên liên hệ xác nhận',
    icon: 'file-text',
    forPaid: true,
    forFree: false,
  },
  {
    id: 'free',
    label: 'Miễn phí',
    desc: 'Không cần thanh toán',
    icon: 'gift',
    forPaid: false,
    forFree: true,
  },
];

const PAYMENT_METHOD_IDS = new Set(PAYMENT_METHODS.map((m) => m.id));

const PAYMENT_STATUS = {
  awaiting: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  waived: 'Miễn phí / không thu',
};

function listPaymentMethods({ amount = 0 } = {}) {
  const isFree = !amount || amount <= 0;
  return PAYMENT_METHODS.filter((m) => (isFree ? m.forFree : m.forPaid));
}

function validatePaymentMethod(methodId, amount) {
  const id = String(methodId || '').trim();
  const isFree = !amount || amount <= 0;
  if (isFree) {
    return { ok: true, method: 'free', status: 'waived' };
  }
  if (!id) return { ok: false, error: 'Chọn phương thức thanh toán' };
  if (!PAYMENT_METHOD_IDS.has(id) || id === 'free') {
    return { ok: false, error: 'Phương thức thanh toán không hợp lệ' };
  }
  return { ok: true, method: id, status: 'awaiting' };
}

function getPaymentInstructions(methodId) {
  const bank = {
    bank_name: process.env.SAAS_PAYMENT_BANK_NAME || 'Vietcombank',
    account_number: process.env.SAAS_PAYMENT_BANK_ACCOUNT || '',
    account_holder: process.env.SAAS_PAYMENT_BANK_HOLDER || 'CONG TY TUBEP PRO',
    transfer_note: process.env.SAAS_PAYMENT_TRANSFER_NOTE || 'TUBEP {email} {plan}',
    momo_phone: process.env.SAAS_PAYMENT_MOMO_PHONE || '',
    support_email: process.env.SAAS_PAYMENT_SUPPORT_EMAIL || 'support@tubep.vn',
    support_phone: process.env.SAAS_PAYMENT_SUPPORT_PHONE || '',
  };

  const guides = {
    bank_transfer: bank.account_number
      ? {
          title: 'Chuyển khoản ngân hàng',
          lines: [
            `Ngân hàng: ${bank.bank_name}`,
            `Số TK: ${bank.account_number}`,
            `Chủ TK: ${bank.account_holder}`,
            `Nội dung CK: ${bank.transfer_note.replace('{email}', 'email của bạn').replace('{plan}', 'tên gói')}`,
            'Sau khi chuyển khoản, đội ngũ xác nhận trong 1–2 giờ làm việc.',
          ],
        }
      : {
          title: 'Chuyển khoản ngân hàng',
          lines: ['Nhân viên sẽ gửi thông tin TK qua email sau khi nhận đơn.'],
        },
    vietqr: {
      title: 'VietQR',
      lines: [
        'Dùng app ngân hàng quét mã VietQR (sẽ gửi qua email) hoặc chuyển khoản theo hướng dẫn.',
        bank.account_number ? `TK: ${bank.bank_name} — ${bank.account_number}` : null,
      ].filter(Boolean),
    },
    momo: {
      title: 'Ví MoMo',
      lines: [
        bank.momo_phone ? `Chuyển tới SĐT MoMo: ${bank.momo_phone}` : 'Nhân viên gửi link/QR MoMo qua email.',
        'Ghi rõ email đăng ký trong nội dung chuyển tiền.',
      ],
    },
    vnpay: {
      title: 'Thanh toán VNPay',
      lines: [
        'Bấm nút «Thanh toán VNPay» để chuyển sang cổng thanh toán an toàn.',
        'Hỗ trợ thẻ nội địa, thẻ quốc tế và QR VNPay.',
        `Hỗ trợ: ${bank.support_email}${bank.support_phone ? ` · ${bank.support_phone}` : ''}`,
      ],
    },
    invoice: {
      title: 'Hóa đơn — thanh toán sau',
      lines: [
        'Kế toán liên hệ trong 24h để xuất báo giá / hóa đơn.',
        'Tài khoản kích hoạt sau khi ký xác nhận hoặc theo thỏa thuận.',
      ],
    },
    free: {
      title: 'Miễn phí',
      lines: ['Không cần thanh toán — tài khoản sẽ được cấp sau khi xác nhận.'],
    },
  };

  return guides[methodId] || null;
}

function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || id || '—';
}

module.exports = {
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  listPaymentMethods,
  validatePaymentMethod,
  getPaymentInstructions,
  paymentMethodLabel,
};
