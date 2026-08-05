const Stripe = require("stripe");

// Vercel's serverless functions freeze and thaw between invocations, which
// can hand Stripe's default Node HTTPS client (a persistent keep-alive
// socket) a stale connection — that shows up as a "connection to Stripe"
// error that fails consistently, not just occasionally, and retries alone
// don't fix it. Using fetch (available natively in this runtime) instead of
// Node's raw https.Agent avoids that failure mode.
function getStripeClient() {
  return Stripe(process.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 3,
  });
}

module.exports = { getStripeClient };
