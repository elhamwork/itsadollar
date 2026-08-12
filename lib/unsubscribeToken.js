const crypto = require("crypto");

// Unsubscribe links shouldn't expire — reuses VOTE_TOKEN_SECRET (same HMAC
// pattern as lib/voteToken.js, different payload shape) rather than adding
// another secret env var just for this.
function sign(payload) {
  return crypto
    .createHmac("sha256", process.env.VOTE_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
}

function createUnsubscribeToken(memberId) {
  const payload = Buffer.from(JSON.stringify({ u: memberId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyUnsubscribeToken(token) {
  if (!token || !process.env.VOTE_TOKEN_SECRET) return null;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.u === "number" ? data.u : null;
  } catch {
    return null;
  }
}

module.exports = { createUnsubscribeToken, verifyUnsubscribeToken };
