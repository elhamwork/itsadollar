const { sql } = require("../../lib/db");
const { verifyVoteToken } = require("../../lib/voteToken");

// POST { token, points } — spends `points` of the member's balance to add
// that many to the weight of their existing vote in this cycle. 1 point =
// 1 unit of weight. Requires having cast the free vote first.
module.exports = async (req, res) => {
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
};
