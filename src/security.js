const crypto = require('crypto');
const config = require('./config');

function hmac(data) {
  return crypto.createHmac('sha256', config.sessionSecret).update(data).digest('hex');
}

function signSession(sessionId, discordId) {
  return hmac(`${sessionId}:${discordId}`);
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifySessionToken(sessionId, discordId, token) {
  return safeEqual(signSession(sessionId, discordId), token);
}

function signOAuthState(sessionId) {
  const payload = Buffer.from(JSON.stringify({ sessionId, ts: Date.now() })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

function verifyOAuthState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig || !safeEqual(hmac(payload), sig)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.sessionId) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = { signSession, verifySessionToken, signOAuthState, verifyOAuthState };
