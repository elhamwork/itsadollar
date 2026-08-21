const { getStripeClient, describeStripeError } = require("../lib/stripeClient");
const { getBaseUrl } = require("../lib/baseUrl");
const { sendEmail } = require("../lib/email");
const { emailLayout } = require("../lib/emailTemplate");

// Looks up a member's Stripe customer by email and emails them a link to
// Stripe's hosted Customer Portal, where they can update payment info or
// cancel — no separate account system or login needed on our side.
//
// The portal link is emailed rather than returned directly, and the
// response is identical whether or not the email matches a member: typing
// in someone else's email would otherwise hand back a live link to *their*
// billing (able to cancel their subscription or swap their card) with
// nothing proving the requester owns that inbox.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe isn't configured on this deployment." });
  }
  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: "Email isn't configured on this deployment." });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Enter the email you joined with." });
  }
  const trimmedEmail = email.trim();

  const stripe = getStripeClient();

  try {
    const customers = await stripe.customers.list({ email: trimmedEmail, limit: 1 });
    if (customers.data.length > 0) {
      const baseUrl = getBaseUrl(req);
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${baseUrl}/index.html`,
      });

      try {
        await sendEmail({
          to: trimmedEmail,
          subject: "Manage your It's a Dollar membership",
          html: emailLayout({
            bodyHtml: `<p style="margin:0">Use the button below to update your payment method or cancel your membership. This link is single-use and expires soon, so use it right away.</p>`,
            ctaUrl: portalSession.url,
            ctaLabel: "Manage membership",
          }),
          text: `Use this link to update your payment method or cancel your membership:\n${portalSession.url}\n\nThis link is single-use and expires soon.`,
        });
      } catch (err) {
        // Logged, not surfaced — the response has to be identical to the
        // "no such member" case either way, so this failure can't leak
        // through to the client.
        console.error(`Failed to email billing portal link to ${trimmedEmail}:`, err.message);
      }
    }

    res.status(200).json({
      ok: true,
      message: "If that email has a membership, check your inbox for a link to manage it.",
    });
  } catch (err) {
    const detail = describeStripeError(err);
    console.error("Failed to create billing portal session:", detail);
    res.status(500).json({ error: "Something went wrong: " + detail });
  }
};
