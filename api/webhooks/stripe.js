const { getStripeClient } = require("../../lib/stripeClient");
const { sql } = require("../../lib/db");
const { generateReferralCode } = require("../../lib/referralCode");

const BILLING_DAY = 15;
const BILLING_HOUR_UTC = 15; // The vote-email cron runs an hour after this.

// Everyone's renewal lands on the 15th, no matter when they joined. The
// first charge already happened at Checkout (full amount, no proration) —
// this only reschedules which day future renewals fall on. Because it runs
// as an update on an already-paid subscription with proration_behavior
// "none", it doesn't trigger a second charge; it just shortens or extends
// the current period to end on the anchor.
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

async function alignBillingToThe15th(stripe, session) {
  if (!session.subscription) return;
  try {
    await stripe.subscriptions.update(session.subscription, {
      billing_cycle_anchor: nextBillingAnchor(),
      proration_behavior: "none",
    });
  } catch (err) {
    console.error("Failed to reschedule billing anchor:", err.message);
  }
}

// Stripe's signature check needs the exact raw bytes Stripe sent — reading
// the request stream directly, before anything touches req.body, keeps
// Vercel's lazy JSON parsing from ever running on this request.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function generateUniqueReferralCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const { rows } = await sql`select 1 from members where referral_code = ${code}`;
    if (rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique referral code after 5 attempts.");
}

async function upsertMemberFromSession(session) {
  const customerId = session.customer;
  const firstName = session.metadata?.firstName || "";
  const lastName = session.metadata?.lastName || "";
  const referredByCode = session.metadata?.referredBy || "";
  const email = session.customer_details?.email || session.customer_email || "";

  const { rows: existing } = await sql`
    select id from members where stripe_customer_id = ${customerId}
  `;
  if (existing.length > 0) return; // duplicate webhook delivery — already recorded

  let referredByMemberId = null;
  if (referredByCode) {
    const { rows: referrer } = await sql`
      select id from members where referral_code = ${referredByCode}
    `;
    if (referrer.length > 0) referredByMemberId = referrer[0].id;
  }

  const referralCode = await generateUniqueReferralCode();

  const { rows: inserted } = await sql`
    insert into members (stripe_customer_id, email, first_name, last_name, referral_code, referred_by_member_id)
    values (${customerId}, ${email}, ${firstName}, ${lastName}, ${referralCode}, ${referredByMemberId})
    on conflict (stripe_customer_id) do nothing
    returning id
  `;
  if (inserted.length === 0) return;
  const memberId = inserted[0].id;

  if (referredByMemberId) {
    const { rows: creditedRows } = await sql`
      insert into referrals (referrer_member_id, referred_member_id, points_awarded)
      values (${referredByMemberId}, ${memberId}, 10)
      on conflict (referred_member_id) do nothing
      returning id
    `;
    if (creditedRows.length > 0) {
      await sql`update members set points = points + 10 where id = ${referredByMemberId}`;
    }
  }
}

async function applyPaidBoost(session) {
  const memberId = Number(session.metadata?.memberId);
  const cycleId = Number(session.metadata?.cycleId);
  const voteId = Number(session.metadata?.voteId);
  const points = Number(session.metadata?.points);

  if (!memberId || !cycleId || !voteId || !points) {
    console.error("Paid boost webhook missing metadata:", session.metadata);
    return;
  }

  const { rows: inserted } = await sql`
    insert into paid_boosts (stripe_session_id, member_id, cycle_id, vote_id, amount_cents, points)
    values (${session.id}, ${memberId}, ${cycleId}, ${voteId}, ${session.amount_total}, ${points})
    on conflict (stripe_session_id) do nothing
    returning id
  `;
  if (inserted.length === 0) return; // duplicate webhook delivery — already applied

  await sql`update votes set weight = weight + ${points} where id = ${voteId}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook received but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are not set.");
    return res.status(500).end();
  }

  const stripe = getStripeClient();
  const raw = await getRawBody(req);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.payment_status === "paid") {
        await upsertMemberFromSession(session);
        await alignBillingToThe15th(stripe, session);
      } else if (session.mode === "payment" && session.payment_status === "paid") {
        await applyPaidBoost(session);
      }
    }
  } catch (err) {
    // Ack the event anyway so Stripe doesn't retry indefinitely on a bug we
    // need to fix server-side; the failure is logged for follow-up.
    console.error("Webhook handler failed:", err.message);
  }

  res.status(200).json({ received: true });
};
