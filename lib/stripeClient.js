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

// Stripe's SDK wraps the real failure reason (a DNS/TLS/timeout error from
// the underlying HTTP client) inside properties that vary by SDK version —
// rather than guess the exact property name, dump every own property of the
// error (and one level into any nested object properties) so the actual
// cause is visible no matter where Stripe put it.
function describeStripeError(err) {
  try {
    const detail = {};
    Object.getOwnPropertyNames(err).forEach((key) => {
      if (key === "stack") return;
      const val = err[key];
      if (val && typeof val === "object") {
        const nested = {};
        Object.getOwnPropertyNames(val).forEach((k) => {
          if (k !== "stack") nested[k] = val[k];
        });
        detail[key] = nested;
      } else if (typeof val !== "function") {
        detail[key] = val;
      }
    });
    return JSON.stringify(detail);
  } catch {
    return err.message || String(err);
  }
}

module.exports = { getStripeClient, describeStripeError };
