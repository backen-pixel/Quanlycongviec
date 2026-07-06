#!/usr/bin/env node
/**
 * Gửi email test SaaS (đăng ký / thanh toán OK / thanh toán fail / tài khoản mới).
 *
 * Cần RESEND_API_KEY (bắt đầu re_) trong backend/.env
 *   hoặc truyền: RESEND_API_KEY=re_xxx node scripts/send-saas-email-test.js email@...
 *
 * Tuỳ chọn: SAAS_EMAIL_FROM="TuBep Pro <backen@vanphuthanh.net>"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  sendPaymentResultEmail,
  sendWelcomeCredentialsEmail,
  sendPurchaseConfirmationEmail,
} = require('../src/helpers/saasEmail');

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/send-saas-email-test.js <email>');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY || process.env.SAAS_EMAIL_API_KEY;
if (!apiKey || !String(apiKey).startsWith('re_')) {
  console.error('Thiếu RESEND_API_KEY hợp lệ (phải bắt đầu bằng re_).');
  console.error('Lấy key tại https://resend.com → thêm vào backend/.env');
  process.exit(1);
}

const loginUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173'}/login?email=${encodeURIComponent(email)}`;

async function main() {
  const cases = [
    {
      label: '1/4 Đã nhận đăng ký',
      fn: () => sendPurchaseConfirmationEmail({
        email,
        fullName: 'Khách test TuBep Pro',
        moduleTitle: 'Gói Standard',
        statusLabel: 'Chờ xử lý',
        paymentMethod: 'VNPay',
        paymentStatus: 'Chờ thanh toán',
        paymentInstructions: getPaymentInstructions('vnpay'),
        amount: 990000,
      }),
    },
    {
      label: '2/4 Thanh toán thành công',
      fn: () => sendPaymentResultEmail({
        email,
        fullName: 'Khách test TuBep Pro',
        productTitle: 'Gói Standard — TuBep Pro',
        amount: 990000,
        amountLabel: '990.000 đ',
        paymentMethod: 'VNPay',
        provider: 'vnpay',
        success: true,
        purchaseId: `test-ok-${Date.now()}`,
        loginUrl,
        accountStatus: 'pending',
      }),
    },
    {
      label: '3/4 Thanh toán thất bại',
      fn: () => sendPaymentResultEmail({
        email,
        fullName: 'Khách test TuBep Pro',
        productTitle: 'Gói Standard — TuBep Pro',
        amount: 990000,
        amountLabel: '990.000 đ',
        paymentMethod: 'VNPay',
        provider: 'vnpay',
        success: false,
        errorMessage: 'Giao dịch bị huỷ hoặc thất bại (email test)',
        errorCode: 'TEST99',
        purchaseId: `test-fail-${Date.now()}`,
        loginUrl,
      }),
    },
    {
      label: '4/4 Tài khoản mới (mật khẩu tạm)',
      fn: () => sendWelcomeCredentialsEmail({
        email,
        fullName: 'Khách test TuBep Pro',
        password: 'Test@2026X',
        loginUrl,
        moduleTitle: 'Gói Standard',
        companyName: 'Công ty Test TuBep',
      }),
    },
  ];

  for (const { label, fn } of cases) {
    const r = await fn();
    if (r.ok) console.log(`✓ ${label} → id ${r.id}`);
    else console.error(`✗ ${label} →`, r.error || r.reason || r);
    await sleep(600);
  }
}

function getPaymentInstructions(method) {
  if (method === 'vnpay') {
    return { title: 'Thanh toán VNPay', lines: ['Bấm link thanh toán trên trang checkout', 'Quay lại sau khi hoàn tất'] };
  }
  return { title: 'Hướng dẫn', lines: ['Liên hệ hỗ trợ nếu cần'] };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
