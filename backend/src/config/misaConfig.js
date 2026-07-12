require('dotenv').config();

const BASE_URL_TEST = 'https://testapi.meinvoice.vn/api/integration';
const BASE_URL_PROD = 'https://api.meinvoice.vn/api/integration';

const isProduction = process.env.MISA_USE_PRODUCTION === 'true';

module.exports = {
  appId: process.env.MISA_APP_ID || '',
  taxcode: process.env.MISA_TAXCODE || '',
  username: process.env.MISA_USERNAME || '',
  password: process.env.MISA_PASSWORD || '',
  invSeries: process.env.MISA_INV_SERIES || '1C26TYY',
  signType: parseInt(process.env.MISA_SIGN_TYPE || '2', 10),
  isProduction,
  baseUrl: isProduction ? BASE_URL_PROD : BASE_URL_TEST,
};
