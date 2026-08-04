const Stripe = require("stripe");

// Used by success.html to greet the member by name after Stripe redirects back.
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

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.status(200).json({
      status: session.status,
      customerEmail:
        session.customer_details?.email || session.customer_email || "",
      firstName: session.metadata?.firstName || "",
    });
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err.message);
    res.status(500).json({ error: "Couldn't retrieve that session." });
  }
};
