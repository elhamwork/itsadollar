const { getStripeClient, describeStripeError } = require("../lib/stripeClient");
const { getBaseUrl } = require("../lib/baseUrl");

const BILLING_DAY = 15;
const BILLING_HOUR_UTC = 15; // Anchor time; the vote-email cron runs an hour after this.

// Everyone's renewal charge lands on the 15th, no matter when they joined.
// The very first charge happens immediately (today, in full — no proration),
// then the subscription's billing_cycle_anchor snaps every charge after
// that to the 15th.
function nextBillingAnchor() {
  const now = new Date();
  let anchor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), BILLING_DAY, BILLING_HOUR_UTC, 0, 0)
  );
  if (anchor.getTime() <= now.getTime()) {
    anchor = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, BILLING_DAY, BILLING_HOUR_UTC, 0, 0)
    );
  }
  return Math.floor(anchor.getTime() / 1000);
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

  const { firstName, lastName, email, referredBy } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res
      .status(400)
      .json({ error: "First name, last name, and email are required." });
  }

  // referredBy is an untrusted referral code from the URL — cap its length
  // and let the webhook be the one to decide whether it matches a real member.
  const referralCode =
    typeof referredBy === "string" ? referredBy.trim().slice(0, 32) : "";

  const stripe = getStripeClient();
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
      subscription_data: {
        billing_cycle_anchor: nextBillingAnchor(),
        proration_behavior: "none",
      },
      metadata: { firstName, lastName, referredBy: referralCode },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/join.html?cancelled=1`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    const detail = describeStripeError(err);
    console.error("Failed to create checkout session:", detail);
    res.status(500).json({ error: "Couldn't start checkout: " + detail });
  }
};
