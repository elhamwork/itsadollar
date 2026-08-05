const { getStripeClient, describeStripeError } = require("../lib/stripeClient");
const { getBaseUrl } = require("../lib/baseUrl");

const BASE_AMOUNT_CENTS = 100;
const FEE_COVER_CENTS = 35;

// Creates a Stripe Checkout Session for the $1/month membership and hands
// the client a URL to redirect to. Card entry, validation, and wallet
// options (Apple Pay / Google Pay) are all handled on Stripe's hosted page.
//
// Charges the full amount today. The subscription's billing_cycle_anchor
// gets rescheduled to the 15th afterward, in the webhook once payment is
// confirmed — not here. Setting billing_cycle_anchor at creation time
// charges nothing for the stub period and waits until the anchor for the
// first charge, which isn't what "charged today, then aligned to the 15th"
// means.
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

  const { firstName, lastName, email, referredBy, coverFee } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res
      .status(400)
      .json({ error: "First name, last name, and email are required." });
  }

  // referredBy is an untrusted referral code from the URL — cap its length
  // and let the webhook be the one to decide whether it matches a real member.
  const referralCode =
    typeof referredBy === "string" ? referredBy.trim().slice(0, 32) : "";

  const coversFee = coverFee === true;
  const unitAmount = BASE_AMOUNT_CENTS + (coversFee ? FEE_COVER_CENTS : 0);

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
            unit_amount: unitAmount,
            recurring: { interval: "month" },
            product_data: {
              name: "It's a Dollar — Membership",
              description: coversFee
                ? "$1 given every month, plus 35¢ to cover the card processing fee."
                : "$1 given every month.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { firstName, lastName, referredBy: referralCode, coverFee: String(coversFee) },
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
