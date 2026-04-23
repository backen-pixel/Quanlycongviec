/**
 * MISA meInvoice Service
 * Tích hợp phát hành hóa đơn điện tử qua MISA meInvoice Open API
 * Tài liệu: https://www.misa.vn/154989/
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const _envConfig = require('../config/misaConfig');

const MISA_CONFIG_FILE = path.join(__dirname, '../../data/misa-config.json');
const BASE_URL_TEST = 'https://testapi.meinvoice.vn/api/integration';
const BASE_URL_PROD = 'https://api.meinvoice.vn/api/integration';

/**
 * Đọc config MISA: ưu tiên misa-config.json, fallback về .env
 */
function getMisaConfig() {
  try {
    if (fs.existsSync(MISA_CONFIG_FILE)) {
      const raw = fs.readFileSync(MISA_CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
      const saved = JSON.parse(raw);
      const isProduction = saved.isProduction === true;
      return {
        appId: saved.appId || _envConfig.appId || '',
        taxcode: saved.taxcode || _envConfig.taxcode || '',
        username: saved.username || _envConfig.username || '',
        password: saved.password || _envConfig.password || '',
        invSeries: saved.invSeries || _envConfig.invSeries || '1C26TYY',
        signType: saved.signType != null ? Number(saved.signType) : _envConfig.signType,
        isProduction,
        baseUrl: isProduction ? BASE_URL_PROD : BASE_URL_TEST,
      };
    }
  } catch (e) {
    console.warn('[misaService] Cannot read misa-config.json, fallback to .env:', e.message);
  }
  return _envConfig;
}

// Expose misaConfig (computed lazily) for backwards compat
const misaConfig = _envConfig;

// Cache token trong memory để tránh gọi /auth/token liên tục
// Key = appId so we bust cache when credentials change
let _tokenCache = { token: null, expiresAt: 0, appId: null };

/**
 * Lấy Bearer token từ MISA meInvoice API
 */
async function getMisaToken(config) {
  if (!config) config = getMisaConfig();
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.appId === config.appId && now < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }

  const resp = await axios.post(
    `${config.baseUrl}/auth/token`,
    {
      appid: config.appId,
      taxcode: config.taxcode,
      username: config.username,
      password: config.password,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (!resp.data?.success) {
    throw new Error(`MISA auth failed: ${resp.data?.errorCode} — ${resp.data?.descriptionErrorCode}`);
  }

  const token = resp.data.data;
  _tokenCache = { token, expiresAt: now + 3_600_000, appId: config.appId };
  return token;
}

/**
 * Chuyển số tiền sang chữ tiếng Việt
 * Vd: 5500000 → "Năm triệu năm trăm nghìn đồng"
 */
function numberToWords(amount) {
  const ones = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];

  function readGroup(n) {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    let result = '';
    if (h > 0) result += ones[h] + ' trăm';
    if (t > 0) {
      result += (result ? ' ' : '') + tens[t];
      if (o > 0) result += ' ' + ones[o];
    } else if (o > 0) {
      result += (result ? ' lẻ ' : '') + ones[o];
    }
    return result;
  }

  const n = Math.round(amount);
  if (n === 0) return 'không đồng';

  const ty = Math.floor(n / 1_000_000_000);
  const trieu = Math.floor((n % 1_000_000_000) / 1_000_000);
  const nghin = Math.floor((n % 1_000_000) / 1_000);
  const donVi = n % 1_000;

  let parts = [];
  if (ty > 0) parts.push(readGroup(ty) + ' tỷ');
  if (trieu > 0) parts.push(readGroup(trieu) + ' triệu');
  if (nghin > 0) parts.push(readGroup(nghin) + ' nghìn');
  if (donVi > 0) parts.push(readGroup(donVi));

  const result = parts.join(' ');
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
}

/**
 * Map payment_method CRM → PaymentMethodName MISA
 */
function mapPaymentMethod(method) {
  const map = { cash: 'TM', transfer: 'CK', both: 'TM/CK' };
  return map[method] || 'TM/CK';
}

/**
 * Map dữ liệu từ CRM invoices/invoice_items sang format MISA InvoiceData
 */
function mapInvoiceToMisa(invoice, items, config) {
  if (!config) config = getMisaConfig();
  const invoiceData = {
    RefID: invoice.id,
    InvSeries: invoice.misa_inv_series || config.invSeries,
    InvDate: invoice.invoice_date
      ? new Date(invoice.invoice_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    CurrencyCode: 'VND',
    ExchangeRate: 1.0,
    PaymentMethodName: mapPaymentMethod(invoice.payment_method),

    // Thông tin người mua
    BuyerLegalName: invoice.customer_name || '',
    BuyerTaxCode: invoice.customer_tax_code || '',
    BuyerAddressLine: invoice.customer_address || '',
    BuyerEmail: invoice.customer_email || '',

    // Tổng tiền
    TotalAmountOC: invoice.total || 0,
    TotalAmountInWords: numberToWords(invoice.total || 0),

    // Chi tiết hàng hóa
    OriginalInvoiceDetail: (items || []).map((item, idx) => ({
      ItemType: 1,
      LineNumber: idx + 1,
      ItemCode: item.product_code || '',
      ItemName: item.name || '',
      UnitName: item.unit || '',
      Quantity: item.quantity || 1,
      UnitPriceOC: item.unit_price || 0,
      DiscountPercentage: item.discount_percent || 0,
      DiscountAmountOC: item.discount_amount || 0,
      AmountOC: item.amount || 0,
      TaxRate: item.vat_rate != null ? item.vat_rate / 100 : 0.1,
      VATAmountOC: item.vat_amount || 0,
    })),

    // Thông tin thuế tổng hợp theo từng mức thuế suất
    TaxRateInfo: buildTaxRateInfo(items),

    // Cấu hình số thập phân
    OptionUserDefined: {
      MainCurrency: 'VND',
      AmountDecimalDigits: '0',
      AmountOCDecimalDigits: '0',
      UnitPriceOCDecimalDigits: '0',
      UnitPriceDecimalDigits: '0',
      QuantityDecimalDigits: '2',
      ExchangRateDecimalDigits: '0',
    },
  };

  return invoiceData;
}

/**
 * Tổng hợp TaxRateInfo theo từng mức thuế suất (MISA yêu cầu group by tax rate)
 */
function buildTaxRateInfo(items) {
  const groups = {};
  for (const item of items || []) {
    const rate = item.vat_rate != null ? item.vat_rate / 100 : 0.1;
    const key = String(rate);
    if (!groups[key]) {
      groups[key] = { TaxRate: rate, AmountOC: 0, VATAmountOC: 0 };
    }
    groups[key].AmountOC += item.amount || 0;
    groups[key].VATAmountOC += item.vat_amount || 0;
  }
  return Object.values(groups);
}

/**
 * Phát hành hóa đơn lên MISA meInvoice
 * @param {object} invoice - row từ bảng invoices (đã join items)
 * @param {object[]} items - mảng invoice_items
 * @param {object} config - override config nếu cần
 */
async function publishInvoice(invoice, items, config) {
  if (!config) config = getMisaConfig();
  if (!config.appId) throw new Error('MISA_APP_ID chưa được cấu hình');

  const token = await getMisaToken(config);
  const invoiceData = mapInvoiceToMisa(invoice, items, config);

  const payload = {
    SignType: config.signType,
    InvoiceData: [invoiceData],
  };

  const resp = await axios.post(
    `${config.baseUrl}/invoice`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.data?.success) {
    throw new Error(
      `MISA publish failed: ${resp.data?.errorCode || ''} — ${resp.data?.descriptionErrorCode || resp.data?.errors || 'Unknown error'}`
    );
  }

  // resp.data.data là mảng kết quả, lấy kết quả đầu tiên
  const result = Array.isArray(resp.data.data) ? resp.data.data[0] : resp.data.data;
  return {
    invoiceNo: result?.InvoiceNo || result?.invoiceNo || null,
    lookupCode: result?.LookupCode || result?.lookupCode || null,
    refId: invoice.id,
  };
}

/**
 * Gửi email hóa đơn điện tử qua MISA
 * @param {string} invoiceNo - Số hóa đơn MISA đã cấp
 * @param {string} email - Email người nhận
 * @param {string} customerName - Tên khách hàng
 */
async function sendEmailInvoice(invoiceNo, email, customerName = '', config) {
  if (!config) config = getMisaConfig();
  if (!config.appId) throw new Error('MISA_APP_ID chưa được cấu hình');
  if (!invoiceNo) throw new Error('Chưa có số hóa đơn MISA (cần phát hành trước)');

  const token = await getMisaToken(config);

  const resp = await axios.post(
    `${config.baseUrl}/invoice/sendemail`,
    {
      SendEmailDatas: [
        {
          InvoiceNo: invoiceNo,
          Email: email,
          ReceiverName: customerName,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.data?.success) {
    throw new Error(
      `MISA send email failed: ${resp.data?.errorCode || ''} — ${resp.data?.descriptionErrorCode || 'Unknown error'}`
    );
  }

  return true;
}

/**
 * Lấy trạng thái hóa đơn từ MISA theo RefID
 */
async function getInvoiceStatus(refId, config) {
  if (!config) config = getMisaConfig();
  if (!config.appId) throw new Error('MISA_APP_ID chưa được cấu hình');

  const token = await getMisaToken(config);

  const resp = await axios.get(`${config.baseUrl}/invoice/status`, {
    params: { RefID: refId },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.data?.success) {
    throw new Error(
      `MISA status check failed: ${resp.data?.errorCode || ''}`
    );
  }

  return resp.data.data;
}

module.exports = {
  getMisaConfig,
  getMisaToken,
  mapInvoiceToMisa,
  publishInvoice,
  sendEmailInvoice,
  getInvoiceStatus,
  numberToWords,
};
