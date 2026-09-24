const crypto = require('crypto');

function facebookAppSecretConfigured(env = process.env) {
  return typeof env.FB_APP_SECRET === 'string' && env.FB_APP_SECRET.trim().length > 0;
}

function facebookWebhookSignatureIsValid({ rawBody, signature, appSecret }) {
  const secret = String(appSecret || '').trim();
  const provided = String(signature || '').trim();
  if (!secret || !rawBody || !/^sha256=[a-f0-9]{64}$/i.test(provided)) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  return expectedBytes.length === providedBytes.length
    && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function verifyFacebookWebhookSignature({ rawBody, signature, env = process.env }) {
  const configured = facebookAppSecretConfigured(env);
  if (!configured) return { configured: false, valid: false, reason: 'fb_app_secret_not_configured' };
  const valid = facebookWebhookSignatureIsValid({
    rawBody,
    signature,
    appSecret: env.FB_APP_SECRET,
  });
  return { configured: true, valid, reason: valid ? null : 'invalid_facebook_webhook_signature' };
}

module.exports = {
  facebookAppSecretConfigured,
  facebookWebhookSignatureIsValid,
  verifyFacebookWebhookSignature,
};
