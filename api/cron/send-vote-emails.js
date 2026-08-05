const { sql } = require("../../lib/db");
const { createVoteToken } = require("../../lib/voteToken");
const { sendEmail } = require("../../lib/email");
const { getBaseUrl } = require("../../lib/baseUrl");

// Runs on Vercel Cron (see vercel.json), shortly after the 15th's charges
// land. Finds the one open cycle awaiting emails and sends every member a
// personal, signed voting link.
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized." });
    }
  }

  const { rows: cycles } = await sql`
    select * from cycles where status = 'open' and emails_sent_at is null
    order by created_at desc limit 1
  `;
  if (cycles.length === 0) {
    return res.status(200).json({ sent: 0, note: "No open cycle awaiting emails." });
  }
  const cycle = cycles[0];

  const { rows: causes } = await sql`select id from causes where cycle_id = ${cycle.id}`;
  if (causes.length < 2) {
    return res.status(200).json({ sent: 0, note: "Cycle has fewer than 2 causes — skipped." });
  }

  const { rows: members } = await sql`select id, email, first_name from members`;
  const baseUrl = getBaseUrl(req);
  let sent = 0;
  let failed = 0;

  for (const member of members) {
    try {
      const token = createVoteToken(member.id, cycle.id);
      const link = `${baseUrl}/vote.html?token=${token}`;
      const greeting = member.first_name ? `Hi ${member.first_name},` : "Hi,";
      await sendEmail({
        to: member.email,
        subject: "Pick where this month's dollars go",
        html: `<p>${greeting}</p><p>This month's $1s are in. Pick where they go:</p><p><a href="${link}">${link}</a></p><p>It's a Dollar</p>`,
        text: `${greeting}\n\nThis month's $1s are in. Pick where they go:\n${link}\n\nIt's a Dollar`,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to email member ${member.id}:`, err.message);
    }
  }

  await sql`update cycles set emails_sent_at = now() where id = ${cycle.id}`;

  res.status(200).json({ sent, failed });
};
