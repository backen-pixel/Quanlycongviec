const crypto = require('crypto');
const config = require('../config');

const VNPAY_BANK_MAP = {
  Vietcombank: '970436',
  VCB: '970436',
  Techcombank: '970407',
  TCB: '970407',
  MB: '970422',
  MBBank: '970422',
};

function isSandboxMode() {
  return String(process.env.SAAS_PAYMENT_SANDBOX || '').trim() === '1'
    || String(process.env.SAAS_PAYMENT_SANDBOX || '').toLowerCase() === 'true';
}

function getGatewayStatus() {
  const vnpay = !!(process.env.VNPAY_TMN_CODE && process.env.VNPAY_HASH_SECRET);
  const vietqr = !!(process.env.SAAS_PAYMENT_BANK_ACCOUNT && process.env.SAAS_PAYMENT_BANK_BIN);
  const momo = !!(process.env.MOMO_PARTNER_CODE && process.env.MOMO_ACCESS_KEY && process.env.MOMO_SECRET_KEY);
  return {
    sandbox: isSandboxMode(),
    vnpay: vnpay || isSandboxMode(),
    vietqr: vietqr || isSandboxMode(),
    momo: momo || isSandboxMode(),
    bank_transfer: true,
    invoice: true,
  };
}

function enrichMethodForWeb(method) {
  const gw = getGatewayStatus();
  const onlineMap = {
    vnpay: gw.vnpay,
    vietqr: gw.vietqr,
    momo: gw.momo,
    bank_transfer: false,
    invoice: false,
    free: false,
  };
  const online = !!onlineMap[method.id];
  return {
    ...method,
    online,
    sandbox: isSandboxMode() && online,
    web_integrated: online,
  };
}

function formatVnpayDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Chuẩn VNPay demo — encode key/value, sort, space → + */
function sortVnpayObject(obj) {
  const sorted = {};
  const encodedKeys = [];
  for (const key of Object.keys(obj || {})) {
    if (obj[key] != null && obj[key] !== '') {
      encodedKeys.push(encodeURIComponent(key));
    }
  }
  encodedKeys.sort();
  for (const encKey of encodedKeys) {
    const originalKey = decodeURIComponent(encKey);
    sorted[encKey] = encodeURIComponent(String(obj[originalKey])).replace(/%20/g, '+');
  }
  return sorted;
}

function buildVnpaySignData(sortedParams) {
  return Object.keys(sortedParams)
    .sort()
    .map((k) => `${k}=${sortedParams[k]}`)
    .join('&');
}

function vnpayHash(params, secret) {
  const sorted = sortVnpayObject(params);
  const signData = buildVnpaySignData(sorted);
  return crypto.createHmac('sha512', secret).update(Buffer.from(signData, 'utf-8')).digest('hex');
}

function normalizeVnpayIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw || raw === '::1' || raw === '::ffff:127.0.0.1') return '127.0.0.1';
  if (raw.includes(':')) return '127.0.0.1';
  return raw.slice(0, 45);
}

function buildVnpayOrderInfo(purchase) {
  const type = purchase.purchase_type === 'plan' ? 'goi' : 'modun';
  const id = purchase.plan_id || purchase.module_id || '';
  return `Thanh toan TuBep ${type} ${id}`.slice(0, 255);
}

function getApiBaseUrl(req) {
  if (process.env.SAAS_PAYMENT_API_BASE_URL) {
    return String(process.env.SAAS_PAYMENT_API_BASE_URL).replace(/\/+$/, '');
  }
  if (req) {
    return `${req.protocol}://${req.get('host')}`;
  }
  return `http://localhost:${process.env.PORT || 4000}`;
}

function buildVnpayPaymentUrl(purchase, req) {
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const hashSecret = process.env.VNPAY_HASH_SECRET;
  const isReal = !!(tmnCode && hashSecret);

  if (!isReal && isSandboxMode()) {
    const base = getApiBaseUrl(req);
    return `${base}/api/saas/payment/sandbox/${purchase.id}?provider=vnpay`;
  }
  if (!isReal) return null;

  const vnpUrl = (process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html').trim();
  const returnUrl = process.env.VNPAY_RETURN_URL
    || `${getApiBaseUrl(req)}/api/saas/payment/vnpay/return`;

  const rawId = String(purchase.id).replace(/-/g, '');
  const txnRef = `TB${Date.now().toString().slice(-10)}${rawId.slice(0, 8)}`;
  const amount = Math.max(0, Number(purchase.amount) || 0);
  const createDate = formatVnpayDate();
  const expire = new Date(Date.now() + 15 * 60 * 1000);
  const expireDate = formatVnpayDate(expire);

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Amount: String(amount * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: buildVnpayOrderInfo(purchase),
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
    vnp_IpAddr: normalizeVnpayIp(purchase.ip_address),
  };

  // Không ép vnp_BankCode=NCB — để user chọn Thẻ quốc tế / QR trên cổng VNPay

  const sortedParams = sortVnpayObject(params);
  const secureHash = vnpayHash(params, hashSecret);
  sortedParams.vnp_SecureHash = secureHash;
  const qs = buildVnpaySignData(sortedParams);
  return { url: `${vnpUrl}?${qs}`, txnRef };
}

function buildMomoSandboxUrl(purchase, req) {
  if (!isSandboxMode()) return null;
  return `${getApiBaseUrl(req)}/api/saas/payment/sandbox/${purchase.id}?provider=momo`;
}

function buildVietQrImageUrl(purchase) {
  const account = process.env.SAAS_PAYMENT_BANK_ACCOUNT;
  const bin = process.env.SAAS_PAYMENT_BANK_BIN
    || VNPAY_BANK_MAP[process.env.SAAS_PAYMENT_BANK_NAME || 'Vietcombank']
    || '970436';
  const holder = encodeURIComponent(process.env.SAAS_PAYMENT_BANK_HOLDER || 'TUBEP PRO');
  if (!account && !isSandboxMode()) return null;

  const amount = Math.max(0, Number(purchase.amount) || 0);
  const info = encodeURIComponent(`TUBEP ${purchase.buyer_email || ''}`.slice(0, 50));

  if (!account) {
    return `https://img.vietqr.io/image/${bin}-0000000000-compact2.png?amount=${amount}&addInfo=${info}&accountName=${holder}`;
  }
  return `https://img.vietqr.io/image/${bin}-${account}-compact2.png?amount=${amount}&addInfo=${info}&accountName=${holder}`;
}

function verifyVnpayCallback(query) {
  const hashSecret = process.env.VNPAY_HASH_SECRET;
  if (!hashSecret) return { ok: false, error: 'VNPay chưa cấu hình' };

  const secureHash = String(query.vnp_SecureHash || '').trim();
  const params = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (!key.startsWith('vnp_') || key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
    if (value != null && value !== '') params[key] = String(value);
  }

  const signed = vnpayHash(params, hashSecret);
  if (signed !== secureHash) return { ok: false, error: 'Chữ ký VNPay không hợp lệ' };

  const responseCode = params.vnp_ResponseCode;
  const txnRef = params.vnp_TxnRef;
  const success = responseCode === '00';
  return { ok: true, success, txnRef, responseCode, params };
}

function resolveWebPayment(purchase, req) {
  const method = purchase.payment_method;
  const result = { redirect_url: null, vietqr_url: null, txn_ref: null, mode: 'manual' };

  if (!purchase.amount || purchase.amount <= 0 || method === 'free') {
    result.mode = 'waived';
    return result;
  }

  if (method === 'vnpay') {
    const built = buildVnpayPaymentUrl(purchase, req);
    if (typeof built === 'string') {
      result.redirect_url = built;
      result.mode = isSandboxMode() ? 'sandbox' : 'vnpay';
    } else if (built?.url) {
      result.redirect_url = built.url;
      result.txn_ref = built.txnRef;
      result.mode = process.env.VNPAY_TMN_CODE ? 'vnpay' : 'sandbox';
    }
    return result;
  }

  if (method === 'momo') {
    const url = buildMomoSandboxUrl(purchase, req);
    if (url) {
      result.redirect_url = url;
      result.mode = 'sandbox';
    }
    return result;
  }

  if (method === 'vietqr' || method === 'bank_transfer') {
    result.vietqr_url = buildVietQrImageUrl(purchase);
    result.mode = result.vietqr_url ? 'vietqr' : 'manual';
    return result;
  }

  return result;
}

module.exports = {
  isSandboxMode,
  getGatewayStatus,
  enrichMethodForWeb,
  buildVnpayPaymentUrl,
  buildVietQrImageUrl,
  verifyVnpayCallback,
  resolveWebPayment,
  getApiBaseUrl,
};
