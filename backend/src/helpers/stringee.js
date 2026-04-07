const jwt = require('jsonwebtoken');

const STRINGEE_SID = process.env.STRINGEE_API_SID || '';
const STRINGEE_SECRET = process.env.STRINGEE_API_SECRET || '';

// Tạo REST API token để gọi Stringee API
function generateRestToken(expireSeconds = 3600) {
  if (!STRINGEE_SID || !STRINGEE_SECRET) throw new Error('Thiếu STRINGEE_API_SID hoặc STRINGEE_API_SECRET');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    jti: `${STRINGEE_SID}-${now}`,
    iss: STRINGEE_SID,
    exp: now + expireSeconds,
    rest_api: true,
  };
  return jwt.sign(payload, STRINGEE_SECRET, { algorithm: 'HS256' });
}

// Gọi Stringee REST API
async function stringeeAPI(method, path, body = null) {
  const token = generateRestToken();
  const url = `https://api.stringee.com/v1${path}`;
  const opts = {
    method,
    headers: {
      'X-STRINGEE-AUTH': token,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  return { status: res.status, data };
}

module.exports = { generateRestToken, stringeeAPI, STRINGEE_SID, STRINGEE_SECRET };
