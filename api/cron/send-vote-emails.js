const { getBaseUrl } = require("../../lib/baseUrl");
const { sendVoteEmailsForOpenCycle } = require("../../lib/sendVoteEmails");

// Runs on Vercel Cron (see vercel.json), shortly after the 15th's charges
// land. Finds the one open cycle awaiting emails and sends every member a
// personal, signed voting link. See lib/sendVoteEmails.js for the shared
// logic also used by the admin panel's manual "Send now" button.
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized." });
    }
  }

  const result = await sendVoteEmailsForOpenCycle(getBaseUrl(req));
  res.status(200).json(result);
};
