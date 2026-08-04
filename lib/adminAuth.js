const crypto = require("crypto");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

// Checks the admin_session cookie. On failure, writes the 401 itself and
// returns false so callers can just `if (!requireAdmin(req, res)) return;`.
function requireAdmin(req, res) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!verifySessionToken(token)) {
    res.status(401).json({ error: "Not authenticated." });
    return false;
  }
  return true;
}

module.exports = { createSessionToken, verifySessionToken, requireAdmin };
