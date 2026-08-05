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
// the underlying HTTP client) inside properties that plain err.message
// doesn't show — this pulls them out so logs and error responses carry the
// actual cause instead of just "connection error, retried N times".
function describeStripeError(err) {
  const parts = [err.message];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.type) parts.push(`type=${err.type}`);
  if (err.cause?.code) parts.push(`cause=${err.cause.code}`);
  else if (err.cause?.message) parts.push(`cause=${err.cause.message}`);
  if (err.raw?.message && err.raw.message !== err.message) parts.push(`raw=${err.raw.message}`);
  return parts.join(" | ");
}

module.exports = { getStripeClient, describeStripeError };
