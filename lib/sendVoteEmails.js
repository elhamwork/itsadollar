const { sql } = require("./db");
const { createVoteToken } = require("./voteToken");
const { sendEmail } = require("./email");

// Shared by the cron job (automatic, on the 15th) and the admin panel's
// "Send now" button (manual, any time). `force` skips the
// emails_sent_at guard — the cron needs that guard so an accidental
// re-run doesn't re-email everyone, but an admin explicitly clicking
// "send now" should always be able to.
async function sendVoteEmailsForOpenCycle(baseUrl, { force = false } = {}) {
  const result = force
    ? await sql`select * from cycles where status = 'open' order by created_at desc limit 1`
    : await sql`
        select * from cycles where status = 'open' and emails_sent_at is null
        order by created_at desc limit 1
      `;
  const cycles = result.rows;

  if (cycles.length === 0) {
    return { sent: 0, failed: 0, note: "No open cycle awaiting emails." };
  }
  const cycle = cycles[0];

  const { rows: causes } = await sql`select id from causes where cycle_id = ${cycle.id}`;
  if (causes.length < 2) {
    return { sent: 0, failed: 0, note: "Cycle has fewer than 2 causes — skipped." };
  }

  const { rows: members } = await sql`select id, email, first_name from members`;
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

  return { sent, failed };
}

module.exports = { sendVoteEmailsForOpenCycle };
