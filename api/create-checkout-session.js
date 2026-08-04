const Stripe = require("stripe");

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// Creates a Stripe Checkout Session for the $1/month membership and hands
// the client a URL to redirect to. Card entry, validation, and wallet
// options (Apple Pay / Google Pay) are all handled on Stripe's hosted page.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res
      .status(500)
      .json({ error: "Stripe isn't configured on this deployment." });
  }

  const { firstName, lastName, email } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res
      .status(400)
      .json({ error: "First name, last name, and email are required." });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = getBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 100,
            recurring: { interval: "month" },
            product_data: {
              name: "It's a Dollar — Membership",
              description: "$1 given every month.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { firstName, lastName },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/join.html?cancelled=1`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Failed to create checkout session:", err.message);
    res
      .status(500)
      .json({ error: "Couldn't start checkout. Please try again." });
  }
};
