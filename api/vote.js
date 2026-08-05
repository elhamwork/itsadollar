const { getStripeClient, describeStripeError } = require("../lib/stripeClient");
const { sql } = require("../lib/db");
const { verifyVoteToken } = require("../lib/voteToken");
const { getBaseUrl } = require("../lib/baseUrl");

const DOLLARS_PER_BOOST_POINT = 1;

// All voting operations live in this one file (dispatched by ?action=) so
// the vote surface counts as a single serverless function — see api/admin.js
// for why that matters on Vercel's Hobby plan.
module.exports = async (req, res) => {
  const action = (req.query || {}).action;

  switch (action) {
    case "context":
      return context(req, res);
    case "submit":
      return submit(req, res);
    case "boost":
      return boost(req, res);
    case "pay-boost":
      return payBoost(req, res);
    case "current":
      return current(req, res);
    default:
      return res.status(404).json({ error: "Unknown vote action." });
  }
};

// GET ?action=current — public, no token needed. Powers the "This cycle"
// section on impact.html: the open cycle's causes and their live point
// totals, so anyone can see standings without being a member.
async function current(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { rows: cycleRows } = await sql`
      select id, label from cycles where status = 'open' order by created_at desc limit 1
    `;
    if (cycleRows.length === 0) {
      return res.status(200).json({ cycle: null });
    }
    const cycle = cycleRows[0];

    const { rows: causes } = await sql`
      select id, name from causes where cycle_id = ${cycle.id} order by id asc
    `;
    const { rows: tallies } = await sql`
      select cause_id, sum(weight)::int as total
      from votes where cycle_id = ${cycle.id} group by cause_id
    `;

    res.status(200).json({
      cycle: {
        label: cycle.label,
        causes: causes.map((c) => {
          const t = tallies.find((row) => row.cause_id === c.id);
          return { name: c.name, voteTotal: t ? t.total : 0 };
        }),
      },
    });
  } catch (err) {
    console.error("Failed to load current cycle:", err.message);
    res.status(500).json({ error: "Couldn't load the current cycle." });
  }
}

// GET ?action=context&token=... — what vote.html needs to render: the
// cycle's causes, this member's points balance, and their current pick +
// its weight, if any.
async function context(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const decoded = verifyVoteToken((req.query || {}).token);
  if (!decoded) {
    return res.status(401).json({ error: "This link has expired or is invalid." });
  }

  try {
    const { rows: cycleRows } = await sql`select * from cycles where id = ${decoded.cycleId}`;
    if (cycleRows.length === 0) {
      return res.status(404).json({ error: "This cycle no longer exists." });
    }
    const cycle = cycleRows[0];

    const { rows: causes } = await sql`
      select id, name, description from causes where cycle_id = ${cycle.id} order by id asc
    `;
    const { rows: memberRows } = await sql`
      select points, first_name from members where id = ${decoded.memberId}
    `;
    if (memberRows.length === 0) {
      return res.status(404).json({ error: "Member not found." });
    }

    const { rows: voteRows } = await sql`
      select cause_id, weight from votes where cycle_id = ${cycle.id} and member_id = ${decoded.memberId}
    `;

    res.status(200).json({
      cycleLabel: cycle.label,
      cycleStatus: cycle.status,
      firstName: memberRows[0].first_name,
      points: memberRows[0].points,
      causes,
      myVote: voteRows[0] || null,
    });
  } catch (err) {
    console.error("Vote context lookup failed:", err.message);
    res.status(500).json({ error: "Couldn't load this vote." });
  }
}

// POST ?action=submit { token, causeId } — casts a member's one free vote
// per cycle, at weight 1. To add more weight to it later, see boost() below.
async function submit(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { token, causeId } = req.body || {};
  const decoded = verifyVoteToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "This link has expired or is invalid." });
  }
  if (!causeId) {
    return res.status(400).json({ error: "Pick a cause." });
  }

  try {
    const { rows: cycleRows } = await sql`select status from cycles where id = ${decoded.cycleId}`;
    if (cycleRows.length === 0 || cycleRows[0].status !== "open") {
      return res.status(400).json({ error: "Voting isn't open for this cycle anymore." });
    }

    const { rows: causeRows } = await sql`
      select id from causes where id = ${causeId} and cycle_id = ${decoded.cycleId}
    `;
    if (causeRows.length === 0) {
      return res.status(400).json({ error: "That cause isn't part of this cycle." });
    }

    const { rows: inserted } = await sql`
      insert into votes (cycle_id, member_id, cause_id, weight)
      values (${decoded.cycleId}, ${decoded.memberId}, ${causeId}, 1)
      on conflict (cycle_id, member_id) do nothing
      returning id
    `;
    if (inserted.length === 0) {
      return res.status(400).json({
        error: "You've already voted this cycle — use a boost to add weight to it instead.",
      });
    }

    res.status(200).json({ ok: true, causeId, weight: 1 });
  } catch (err) {
    console.error("Vote submit failed:", err.message);
    res.status(500).json({ error: "Couldn't record that vote." });
  }
}

// POST ?action=boost { token, points } — spends `points` of the member's
// balance to add that many to the weight of their existing vote in this
// cycle. 1 point = 1 unit of weight. Requires having cast the free vote first.
async function boost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const decoded = verifyVoteToken((req.body || {}).token);
  if (!decoded) {
    return res.status(401).json({ error: "This link has expired or is invalid." });
  }

  const points = Number((req.body || {}).points);
  if (!Number.isInteger(points) || points < 1) {
    return res.status(400).json({ error: "Enter a whole number of points, at least 1." });
  }

  try {
    const { rows: cycleRows } = await sql`select status from cycles where id = ${decoded.cycleId}`;
    if (cycleRows.length === 0 || cycleRows[0].status !== "open") {
      return res.status(400).json({ error: "Voting isn't open for this cycle anymore." });
    }

    const { rows: voteRows } = await sql`
      select id, cause_id, weight from votes where cycle_id = ${decoded.cycleId} and member_id = ${decoded.memberId}
    `;
    if (voteRows.length === 0) {
      return res.status(400).json({ error: "Cast your vote for a cause first." });
    }

    // Conditional decrement — the WHERE clause makes this safe even if two
    // boost requests from the same member somehow overlap.
    const { rows: deducted } = await sql`
      update members set points = points - ${points}
      where id = ${decoded.memberId} and points >= ${points}
      returning points
    `;
    if (deducted.length === 0) {
      return res.status(400).json({ error: "You don't have that many points to spend." });
    }

    const { rows: updated } = await sql`
      update votes set weight = weight + ${points}
      where id = ${voteRows[0].id}
      returning weight
    `;

    res.status(200).json({
      ok: true,
      causeId: voteRows[0].cause_id,
      weight: updated[0].weight,
      pointsRemaining: deducted[0].points,
    });
  } catch (err) {
    console.error("Vote boost failed:", err.message);
    res.status(500).json({ error: "Couldn't apply that boost." });
  }
}

// POST ?action=pay-boost { token, points } — starts a Stripe Checkout
// Session (one-time payment, not a subscription) for `points` dollars.
// The actual weight bump happens in the webhook once payment succeeds, not
// here — this only creates the session and hands back a URL to redirect to.
async function payBoost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Payments aren't configured on this deployment." });
  }

  const token = (req.body || {}).token;
  const decoded = verifyVoteToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "This link has expired or is invalid." });
  }

  const points = Number((req.body || {}).points);
  if (!Number.isInteger(points) || points < 1) {
    return res.status(400).json({ error: "Enter a whole number of dollars, at least 1." });
  }

  try {
    const { rows: cycleRows } = await sql`select status from cycles where id = ${decoded.cycleId}`;
    if (cycleRows.length === 0 || cycleRows[0].status !== "open") {
      return res.status(400).json({ error: "Voting isn't open for this cycle anymore." });
    }

    const { rows: voteRows } = await sql`
      select id, cause_id from votes where cycle_id = ${decoded.cycleId} and member_id = ${decoded.memberId}
    `;
    if (voteRows.length === 0) {
      return res.status(400).json({ error: "Cast your vote for a cause first." });
    }

    const { rows: memberRows } = await sql`select email from members where id = ${decoded.memberId}`;
    if (memberRows.length === 0) {
      return res.status(404).json({ error: "Member not found." });
    }

    const stripe = getStripeClient();
    const baseUrl = getBaseUrl(req);
    const returnUrl = `${baseUrl}/vote.html?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: memberRows[0].email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: DOLLARS_PER_BOOST_POINT * 100,
            product_data: {
              name: "Boost your vote",
              description: `Adds ${points} to your pick's weight.`,
            },
          },
          quantity: points,
        },
      ],
      metadata: {
        memberId: String(decoded.memberId),
        cycleId: String(decoded.cycleId),
        voteId: String(voteRows[0].id),
        points: String(points),
      },
      success_url: `${returnUrl}&boosted=1`,
      cancel_url: returnUrl,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    const detail = describeStripeError(err);
    console.error("Failed to create boost payment:", detail);
    res.status(500).json({ error: "Couldn't start payment: " + detail });
  }
}
