const crypto = require('crypto');

function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tenant';
}

async function sendTransactionalEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY || process.env.SAAS_EMAIL_API_KEY;
  const from = process.env.SAAS_EMAIL_FROM || process.env.RESEND_FROM || 'TuBep Pro <noreply@tubep.vn>';

  if (!apiKey || !String(apiKey).startsWith('re_')) {
    console.log('[saasEmail] SMTP/API chưa cấu hình — log email:');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${text || html?.replace(/<[^>]+>/g, '')}`);
    return { ok: false, skipped: true, reason: 'email_not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[saasEmail] Resend error:', res.status, errText);
      return { ok: false, error: errText };
    }
    const json = await res.json();
    return { ok: true, id: json.id };
  } catch (e) {
    console.error('[saasEmail]', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendWelcomeCredentialsEmail({ email, fullName, password, loginUrl, moduleTitle, companyName }) {
  const subject = `[TuBep Pro] Tài khoản của bạn đã sẵn sàng — ${moduleTitle || 'Modun'}`;
  const text = [
    `Xin chào ${fullName || email},`,
    '',
    `Tài khoản TuBep Pro cho ${companyName || 'doanh nghiệp của bạn'} đã được kích hoạt.`,
    moduleTitle ? `Gói: ${moduleTitle}` : '',
    '',
    `Email đăng nhập: ${email}`,
    `Mật khẩu tạm: ${password}`,
    '',
    `Đăng nhập tại: ${loginUrl}`,
    '',
    'Vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.',
    'Hoặc đăng nhập bằng Google trên trang login (cùng email).',
    '',
    '— TuBep Pro',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#0d9488">TuBep Pro</h2>
      <p>Xin chào <strong>${fullName || email}</strong>,</p>
      <p>Tài khoản của bạn${companyName ? ` cho <strong>${companyName}</strong>` : ''} đã được kích hoạt${moduleTitle ? ` — gói <strong>${moduleTitle}</strong>` : ''}.</p>
      <table style="background:#f8fafc;border-radius:8px;padding:16px;width:100%;margin:16px 0">
        <tr><td style="color:#64748b;padding:4px 0">Email</td><td><strong>${email}</strong></td></tr>
        <tr><td style="color:#64748b;padding:4px 0">Mật khẩu tạm</td><td><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">${password}</code></td></tr>
      </table>
      <p><a href="${loginUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Đăng nhập ngay</a></p>
      <p style="color:#64748b;font-size:13px">Đổi mật khẩu sau lần đăng nhập đầu tiên, hoặc dùng <strong>Đăng nhập Google</strong> với cùng email.</p>
    </div>`;

  return sendTransactionalEmail({ to: email, subject, html, text });
}

async function sendPurchaseConfirmationEmail({
  email, fullName, moduleTitle, statusLabel,
  paymentMethod, paymentStatus, paymentInstructions, amount,
}) {
  const subject = `[TuBep Pro] Đã nhận đăng ký — ${moduleTitle}`;
  const amountLine = amount > 0 ? `Số tiền: ${Number(amount).toLocaleString('vi-VN')} đ/tháng\n` : '';
  const payLines = (paymentInstructions?.lines || []).join('\n');
  const text = [
    `Xin chào ${fullName || email},`,
    '',
    `Yêu cầu: ${moduleTitle}`,
    `Trạng thái đơn: ${statusLabel}`,
    paymentMethod ? `Thanh toán: ${paymentMethod} — ${paymentStatus || ''}` : '',
    amountLine,
    payLines ? `\nHướng dẫn:\n${payLines}` : '',
    '',
    '— TuBep Pro',
  ].filter(Boolean).join('\n');

  const instrHtml = paymentInstructions?.lines?.length
    ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:14px;margin:16px 0"><strong>${paymentInstructions.title}</strong><ul style="margin:8px 0 0;padding-left:18px;color:#0f766e;font-size:13px">${paymentInstructions.lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`
    : '';

  const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px">
    <h2 style="color:#0d9488">Đã nhận yêu cầu</h2>
    <p>Xin chào <strong>${fullName || email}</strong>,</p>
    <p>Đăng ký <strong>${moduleTitle}</strong> đã được ghi nhận.</p>
    ${paymentMethod ? `<p>Phương thức: <strong>${paymentMethod}</strong>${paymentStatus ? ` · ${paymentStatus}` : ''}</p>` : ''}
    ${amount > 0 ? `<p>Số tiền: <strong>${Number(amount).toLocaleString('vi-VN')} đ</strong>/tháng</p>` : ''}
    ${instrHtml}
    <p style="color:#64748b;font-size:13px">Tài khoản kích hoạt sau khi xác nhận thanh toán (hoặc theo thỏa thuận với gói hóa đơn).</p>
  </div>`;
  return sendTransactionalEmail({ to: email, subject, html, text });
}

function loginBlock(loginUrl, email) {
  const googleHint = 'Sau khi admin cấp tài khoản, bạn có thể đăng nhập bằng Google với cùng email đã đăng ký.';
  return `
    <div style="background:#f8fafc;border-radius:8px;padding:14px;margin:16px 0;border:1px solid #e2e8f0">
      <p style="margin:0 0 8px;font-size:13px;color:#334155"><strong>Đăng nhập</strong> — dùng email <strong>${email}</strong></p>
      <p style="margin:0 0 10px;font-size:12px;color:#64748b">${googleHint}</p>
      <a href="${loginUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Mở trang đăng nhập</a>
    </div>`;
}

async function sendPaymentResultEmail({
  email,
  fullName,
  productTitle,
  amount,
  amountLabel,
  paymentMethod,
  provider,
  success,
  errorMessage,
  errorCode,
  purchaseId,
  loginUrl,
  accountStatus,
}) {
  const isSuccess = !!success;
  const subject = isSuccess
    ? `[TuBep Pro] Thanh toán thành công — ${productTitle}`
    : `[TuBep Pro] Thanh toán chưa hoàn tất — ${productTitle}`;

  const statusLine = isSuccess
    ? 'Thanh toán đã được ghi nhận thành công.'
    : `Thanh toán chưa hoàn tất${errorMessage ? `: ${errorMessage}` : ''}${errorCode ? ` (mã ${errorCode})` : ''}.`;

  const nextStep = isSuccess
    ? (accountStatus === 'provisioned'
      ? 'Tài khoản đã sẵn sàng — đăng nhập ngay.'
      : 'Admin sẽ cấp tài khoản qua email trong thời gian sớm nhất. Bạn có thể đăng nhập bằng Google khi đã được kích hoạt.')
    : 'Bạn có thể thử thanh toán lại từ trang gói hoặc liên hệ hỗ trợ.';

  const text = [
    `Xin chào ${fullName || email},`,
    '',
    `Gói/dịch vụ: ${productTitle}`,
    amount > 0 ? `Số tiền: ${amountLabel || amount}` : '',
    paymentMethod ? `Phương thức: ${paymentMethod}${provider ? ` (${provider})` : ''}` : '',
    '',
    statusLine,
    nextStep,
    '',
    `Mã đơn: ${purchaseId?.slice(0, 8) || '—'}…`,
    '',
    `Đăng nhập tại: ${loginUrl}`,
    'Hoặc bấm «Đăng nhập bằng Google» trên trang login — dùng cùng email đã mua gói.',
    '',
    '— TuBep Pro',
  ].filter(Boolean).join('\n');

  const color = isSuccess ? '#0d9488' : '#dc2626';
  const title = isSuccess ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất';

  const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px">
    <h2 style="color:${color}">${title}</h2>
    <p>Xin chào <strong>${fullName || email}</strong>,</p>
    <p>Đơn <strong>${productTitle}</strong>${amount > 0 ? ` · <strong>${amountLabel}</strong>` : ''}</p>
    ${paymentMethod ? `<p style="font-size:13px;color:#64748b">${paymentMethod}${provider ? ` · ${provider.toUpperCase()}` : ''}</p>` : ''}
    <p>${statusLine}</p>
    <p style="font-size:13px;color:#475569">${nextStep}</p>
    <p style="font-size:11px;color:#94a3b8;font-family:monospace">Mã đơn: ${purchaseId?.slice(0, 8) || '—'}…</p>
    ${loginBlock(loginUrl, email)}
  </div>`;

  return sendTransactionalEmail({ to: email, subject, html, text });
}

module.exports = {
  generateTempPassword,
  slugify,
  sendTransactionalEmail,
  sendWelcomeCredentialsEmail,
  sendPurchaseConfirmationEmail,
  sendPaymentResultEmail,
};
