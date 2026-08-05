const Stripe = require("stripe");
const { sql } = require("../lib/db");

// Used by success.html to greet the member by name and, once the webhook
// has recorded them (usually within a second or two of payment), surface
// their referral link.
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res
      .status(500)
      .json({ error: "Stripe isn't configured on this deployment." });
  }

  const { session_id } = req.query || {};

  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id." });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 3 });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const result = {
      status: session.status,
      customerEmail:
        session.customer_details?.email || session.customer_email || "",
      firstName: session.metadata?.firstName || "",
    };

    try {
      const { rows } = await sql`
        select referral_code, points from members where stripe_customer_id = ${session.customer}
      `;
      if (rows.length > 0) {
        result.referralCode = rows[0].referral_code;
        result.points = rows[0].points;
      }
    } catch (dbErr) {
      // The webhook may not have landed yet, or Postgres isn't configured —
      // either way, the thank-you page still works without the share block.
      console.error("Member lookup failed:", dbErr.message);
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err.message);
    res.status(500).json({ error: "Couldn't retrieve that session: " + err.message });
  }
};
