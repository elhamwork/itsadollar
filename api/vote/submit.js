const { sql } = require("../../lib/db");
const { verifyVoteToken } = require("../../lib/voteToken");

// POST { token, causeId } — casts a member's one free vote per cycle, at
// weight 1. To add more weight to it later, see api/vote/boost.js.
module.exports = async (req, res) => {
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
};
