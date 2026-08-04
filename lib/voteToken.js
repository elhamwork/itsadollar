const crypto = require("crypto");

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payload) {
  return crypto
    .createHmac("sha256", process.env.VOTE_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
}

function createVoteToken(memberId, cycleId, ttlMs = DEFAULT_TTL_MS) {
  const payload = Buffer.from(
    JSON.stringify({ m: memberId, c: cycleId, exp: Date.now() + ttlMs })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyVoteToken(token) {
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
    if (typeof data.exp !== "number" || Date.now() >= data.exp) return null;
    return { memberId: data.m, cycleId: data.c };
  } catch {
    return null;
  }
}

module.exports = { createVoteToken, verifyVoteToken };
