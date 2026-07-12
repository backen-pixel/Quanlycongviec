const { OAuth2Client } = require('google-auth-library');

function getGoogleLoginClientId() {
  return (
    process.env.GOOGLE_LOGIN_CLIENT_ID
    || process.env.GOOGLE_OAUTH_CLIENT_ID
    || process.env.GDRIVE_OAUTH_CLIENT_ID
    || ''
  ).trim();
}

function isGoogleLoginEnabled() {
  return !!getGoogleLoginClientId();
}

async function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleLoginClientId();
  if (!clientId) {
    const err = new Error('Google Login chưa cấu hình (GOOGLE_LOGIN_CLIENT_ID)');
    err.code = 'google_not_configured';
    throw err;
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    const err = new Error('Token Google thiếu email');
    err.code = 'google_invalid_token';
    throw err;
  }
  if (payload.email_verified === false) {
    const err = new Error('Email Google chưa xác minh');
    err.code = 'google_email_unverified';
    throw err;
  }
  return payload;
}

module.exports = {
  getGoogleLoginClientId,
  isGoogleLoginEnabled,
  verifyGoogleIdToken,
};
