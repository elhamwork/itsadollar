require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8123";
const PORT = process.env.PORT || 4242;

if (!STRIPE_SECRET_KEY) {
  console.error(
    "Missing STRIPE_SECRET_KEY. Copy server/.env.example to server/.env and add your Stripe TEST secret key."
  );
  process.exit(1);
}

if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  console.warn(
    "Warning: STRIPE_SECRET_KEY does not look like a test key (sk_test_...). " +
      "This server is meant for the Stripe sandbox — double-check before using a live key."
  );
}

const stripe = Stripe(STRIPE_SECRET_KEY);
const app = express();

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Creates a Stripe Checkout Session for the $1/month membership and hands
// the client a URL to redirect to. Card entry, validation, and wallet
// options (Apple Pay / Google Pay) are all handled on Stripe's hosted page.
app.post("/api/create-checkout-session", async (req, res) => {
  const { firstName, lastName, email } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res
      .status(400)
      .json({ error: "First name, last name, and email are required." });
  }

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
      success_url: `${CLIENT_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/join.html?cancelled=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Failed to create checkout session:", err.message);
    res
      .status(500)
      .json({ error: "Couldn't start checkout. Please try again." });
  }
});

// Used by success.html to greet the member by name after Stripe redirects back.
app.get("/api/checkout-session", async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id." });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({
      status: session.status,
      customerEmail: session.customer_details?.email || session.customer_email || "",
      firstName: session.metadata?.firstName || "",
    });
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err.message);
    res.status(500).json({ error: "Couldn't retrieve that session." });
  }
});

app.listen(PORT, () => {
  console.log(`It's a Dollar API (Stripe sandbox) listening on :${PORT}`);
});
