const crypto = require("crypto");
const { sql } = require("../lib/db");
const { requireAdmin, createSessionToken } = require("../lib/adminAuth");
const { getBaseUrl } = require("../lib/baseUrl");
const { sendVoteEmailsForOpenCycle } = require("../lib/sendVoteEmails");
const { sendEmail } = require("../lib/email");
const { sendInBatches } = require("../lib/sendBatch");
const { escapeHtml } = require("../lib/escapeHtml");
const { createUnsubscribeToken } = require("../lib/unsubscribeToken");

const ANNOUNCEMENT_BATCH_SIZE = 10;

// Every admin operation lives in this one file (dispatched by ?action=) so
// the whole admin surface counts as a single serverless function — Vercel's
// Hobby plan caps a deployment at 12, and splitting this across 5 files
// like it used to be was enough on its own to blow that budget.
module.exports = async (req, res) => {
  const action = (req.query || {}).action;

  switch (action) {
    case "login":
      return login(req, res);
    case "logout":
      return logout(req, res);
    case "session":
      return session(req, res);
    case "cycles":
      return cycles(req, res);
    case "close-cycle":
      return closeCycle(req, res);
    case "send-vote-emails":
      return sendVoteEmailsNow(req, res);
    case "send-announcement":
      return sendAnnouncement(req, res);
    case "member-count":
      return memberCount(req, res);
    case "members":
      return listMembers(req, res);
    default:
      return res.status(404).json({ error: "Unknown admin action." });
  }
};

const MAX_LOGIN_ATTEMPTS = 5;

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0].trim() : req.socket?.remoteAddress) || "unknown";
}

async function login(req, res) {
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
    if (rows[0].attempts >= MAX_LOGIN_ATTEMPTS) {
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
}

async function logout(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  res.setHeader(
    "Set-Cookie",
    "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  res.status(200).json({ ok: true });
}

async function session(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireAdmin(req, res)) return;
  res.status(200).json({ ok: true });
}

// GET: list recent cycles with their causes, vote tallies, and (if closed)
// donation record — what the admin dashboard renders.
// POST: open a new cycle with 2-4 causes. Only one cycle may be open at a
// time, so the cron job always has an unambiguous cycle to email about.
async function cycles(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    try {
      const { rows: cycleRows } = await sql`
        select * from cycles order by created_at desc limit 24
      `;
      const { rows: causeRows } = await sql`select * from causes order by id asc`;
      const { rows: donationRows } = await sql`select * from donations`;
      const { rows: tallies } = await sql`
        select cause_id, sum(weight)::int as total, count(*)::int as voters
        from votes group by cause_id
      `;

      const result = cycleRows.map((cycle) => ({
        ...cycle,
        causes: causeRows
          .filter((c) => c.cycle_id === cycle.id)
          .map((c) => {
            const t = tallies.find((row) => row.cause_id === c.id);
            return { ...c, voteTotal: t ? t.total : 0, voterCount: t ? t.voters : 0 };
          }),
        donation: donationRows.find((d) => d.cycle_id === cycle.id) || null,
      }));

      return res.status(200).json({ cycles: result });
    } catch (err) {
      console.error("Failed to load cycles:", err.message);
      return res.status(500).json({ error: "Couldn't load cycles: " + err.message });
    }
  }

  if (req.method === "POST") {
    const { label, causeNames } = req.body || {};

    if (!label || typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "A cycle label is required." });
    }
    const names = Array.isArray(causeNames)
      ? causeNames.map((n) => String(n).trim()).filter(Boolean)
      : [];
    if (names.length < 2 || names.length > 4) {
      return res.status(400).json({ error: "Provide 2 to 4 cause names." });
    }

    try {
      const { rows: openCycles } = await sql`select id from cycles where status = 'open'`;
      if (openCycles.length > 0) {
        return res.status(400).json({
          error: "A cycle is already open. Close it before opening a new one.",
        });
      }

      const { rows } = await sql`
        insert into cycles (label) values (${label.trim()}) returning id
      `;
      const cycleId = rows[0].id;
      for (const name of names) {
        await sql`insert into causes (cycle_id, name) values (${cycleId}, ${name})`;
      }
      return res.status(200).json({ ok: true, cycleId });
    } catch (err) {
      console.error("Failed to create cycle:", err.message);
      return res.status(500).json({ error: "Couldn't create the cycle: " + err.message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed." });
}

// Marks a cycle closed and records the actual donation made (amount, and a
// proof link/note) — this is what the public donations page reads from.
async function closeCycle(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { cycleId, causeId, amountCents, proofUrl, note } = req.body || {};

  if (!cycleId || !causeId || !amountCents || Number(amountCents) <= 0) {
    return res
      .status(400)
      .json({ error: "cycleId, causeId, and a positive amountCents are required." });
  }

  try {
    const { rows: causeRows } = await sql`
      select id from causes where id = ${causeId} and cycle_id = ${cycleId}
    `;
    if (causeRows.length === 0) {
      return res.status(400).json({ error: "That cause doesn't belong to this cycle." });
    }

    await sql`update cycles set status = 'closed', closed_at = now() where id = ${cycleId}`;
    await sql`
      insert into donations (cycle_id, cause_id, amount_cents, proof_url, note)
      values (${cycleId}, ${causeId}, ${amountCents}, ${proofUrl || null}, ${note || null})
      on conflict (cycle_id) do update set
        cause_id = excluded.cause_id,
        amount_cents = excluded.amount_cents,
        proof_url = excluded.proof_url,
        note = excluded.note
    `;

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to close cycle:", err.message);
    res.status(500).json({ error: "Couldn't close the cycle: " + err.message });
  }
}

// Manually triggers the vote-link email for the open cycle right now,
// instead of waiting for the 15th's cron. See lib/sendVoteEmails.js.
async function sendVoteEmailsNow(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "Email isn't configured on this deployment." });
  }

  try {
    const result = await sendVoteEmailsForOpenCycle(getBaseUrl(req), { force: true });
    res.status(200).json(result);
  } catch (err) {
    console.error("Failed to send vote emails:", err.message);
    res.status(500).json({ error: "Couldn't send vote emails: " + err.message });
  }
}

// Broadcasts a one-off announcement (subject + message) to every member.
async function sendAnnouncement(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "Email isn't configured on this deployment." });
  }

  const { subject, message } = req.body || {};
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return res.status(400).json({ error: "A subject is required." });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "A message is required." });
  }

  try {
    const { rows: members } = await sql`
      select id, email, first_name from members where unsubscribed = false
    `;
    const trimmedMessage = message.trim();
    const safeHtml = escapeHtml(trimmedMessage)
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
    const baseUrl = getBaseUrl(req);

    const { sent, failed } = await sendInBatches(members, ANNOUNCEMENT_BATCH_SIZE, async (member) => {
      const safeName = escapeHtml(member.first_name);
      const greeting = member.first_name ? `Hi ${safeName},` : "Hi,";
      const plainGreeting = member.first_name ? `Hi ${member.first_name},` : "Hi,";
      const unsubUrl = `${baseUrl}/api/vote?action=unsubscribe&token=${createUnsubscribeToken(member.id)}`;
      try {
        await sendEmail({
          to: member.email,
          subject: subject.trim(),
          html: `<p>${greeting}</p>${safeHtml}<p>It's a Dollar</p><p style="font-size:12px;color:#888"><a href="${unsubUrl}">Unsubscribe from announcements</a></p>`,
          text: `${plainGreeting}\n\n${trimmedMessage}\n\nIt's a Dollar\n\nUnsubscribe from announcements: ${unsubUrl}`,
        });
      } catch (err) {
        console.error(`Failed to email member ${member.email}:`, err.message);
        throw err;
      }
    });

    res.status(200).json({ sent, failed });
  } catch (err) {
    console.error("Failed to send announcement:", err.message);
    res.status(500).json({ error: "Couldn't send the announcement: " + err.message });
  }
}

// Lets the admin panel show "this will email N members" before sending.
async function memberCount(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const { rows } = await sql`select count(*)::int as count from members where unsubscribed = false`;
    res.status(200).json({ count: rows[0].count });
  } catch (err) {
    console.error("Failed to count members:", err.message);
    res.status(500).json({ error: "Couldn't count members: " + err.message });
  }
}

// Full member list for the admin dashboard — most recent first, capped at
// 500 (plenty for this project's scale; a real pagination UI can come later
// if it's ever needed).
async function listMembers(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const { rows } = await sql`
      select
        m.id, m.email, m.first_name, m.last_name, m.points, m.referral_code,
        m.unsubscribed, m.created_at,
        (select count(*)::int from referrals where referrer_member_id = m.id) as referral_count
      from members m
      order by m.created_at desc
      limit 500
    `;
    res.status(200).json({ members: rows });
  } catch (err) {
    console.error("Failed to load members:", err.message);
    res.status(500).json({ error: "Couldn't load members: " + err.message });
  }
}
