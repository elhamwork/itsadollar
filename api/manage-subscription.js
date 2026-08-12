const { getStripeClient, describeStripeError } = require("../lib/stripeClient");
const { getBaseUrl } = require("../lib/baseUrl");

// Looks up a member's Stripe customer by email and redirects them to
// Stripe's hosted Customer Portal, where they can update payment info or
// cancel — no separate account system or login needed on our side.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe isn't configured on this deployment." });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Enter the email you joined with." });
  }

  const stripe = getStripeClient();

  try {
    const customers = await stripe.customers.list({ email: email.trim(), limit: 1 });
    if (customers.data.length === 0) {
      return res.status(404).json({
        error: "We couldn't find a membership for that email. Check the address you used to join.",
      });
    }

    const baseUrl = getBaseUrl(req);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${baseUrl}/index.html`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    const detail = describeStripeError(err);
    console.error("Failed to create billing portal session:", detail);
    res.status(500).json({ error: "Couldn't open your membership settings: " + detail });
  }
};
