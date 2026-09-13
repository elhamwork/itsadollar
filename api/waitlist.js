const { sql } = require("../lib/db");

// While real payments are locked pre-launch, join.html captures name+email
// here instead of running Stripe checkout. Deliberately separate from the
// members table — no points, no referral code, no vote emails.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { firstName, lastName, email } = req.body || {};
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    await sql`
      insert into waitlist (email, first_name, last_name)
      values (${email.trim()}, ${firstName ? String(firstName).trim() : null}, ${lastName ? String(lastName).trim() : null})
      on conflict (email) do nothing
    `;
    // Same response whether this email was already on the list or brand
    // new — nothing meaningful for the visitor to distinguish either way.
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to add to waitlist:", err.message);
    res.status(500).json({ error: "Something went wrong. Try again in a moment." });
  }
};
