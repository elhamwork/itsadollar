const crypto = require("crypto");
const { sql } = require("../../lib/db");
const { createSessionToken } = require("../../lib/adminAuth");

const MAX_ATTEMPTS = 5;

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0].trim() : req.socket?.remoteAddress) || "unknown";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(500).json({ error: "Admin login isn't configured." });
  }

  const ip = getIp(req);

  try {
    const { rows } = await sql`
      select count(*)::int as attempts from admin_login_attempts
      where ip = ${ip}
        and success = false
        and attempted_at > now() - interval '15 minutes'
    `;
    if (rows[0].attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many attempts. Try again in a bit." });
    }
  } catch (err) {
    // If the rate-limit check itself fails, fail open on availability but
    // log it — an admin locked out by a DB hiccup is worse than a missed check.
    console.error("Admin rate-limit check failed:", err.message);
  }

  const { password } = req.body || {};
  const submittedHash = crypto.createHash("sha256").update(password || "").digest();
  const expectedHash = crypto
    .createHash("sha256")
    .update(process.env.ADMIN_PASSWORD)
    .digest();
  const ok =
    submittedHash.length === expectedHash.length &&
    crypto.timingSafeEqual(submittedHash, expectedHash);

  try {
    await sql`insert into admin_login_attempts (ip, success) values (${ip}, ${ok})`;
  } catch (err) {
    console.error("Failed to log admin login attempt:", err.message);
  }

  if (!ok) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = createSessionToken();
  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${12 * 60 * 60}`
  );
  res.status(200).json({ ok: true });
};
