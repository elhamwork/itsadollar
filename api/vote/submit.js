const { sql } = require("../../lib/db");
const { verifyVoteToken } = require("../../lib/voteToken");

const EXTRA_PICK_COST = 10;

// POST { token, causeId } — the first vote a member casts in a cycle is
// free; every vote after that costs 10 points, deducted here.
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
    const { rows: cycleRows } = await sql`select * from cycles where id = ${decoded.cycleId}`;
    if (cycleRows.length === 0 || cycleRows[0].status !== "open") {
      return res.status(400).json({ error: "Voting isn't open for this cycle anymore." });
    }

    const { rows: causeRows } = await sql`
      select id from causes where id = ${causeId} and cycle_id = ${decoded.cycleId}
    `;
    if (causeRows.length === 0) {
      return res.status(400).json({ error: "That cause isn't part of this cycle." });
    }

    const { rows: existingVotes } = await sql`
      select id from votes where cycle_id = ${decoded.cycleId} and member_id = ${decoded.memberId}
    `;
    const isFree = existingVotes.length === 0;
    let pointsSpent = 0;

    if (!isFree) {
      const { rows: memberRows } = await sql`
        select points from members where id = ${decoded.memberId}
      `;
      if (memberRows.length === 0 || memberRows[0].points < EXTRA_PICK_COST) {
        return res.status(400).json({
          error: `You need ${EXTRA_PICK_COST} points for an extra pick. Share your link to earn more.`,
        });
      }
      pointsSpent = EXTRA_PICK_COST;
      await sql`update members set points = points - ${EXTRA_PICK_COST} where id = ${decoded.memberId}`;
    }

    await sql`
      insert into votes (cycle_id, member_id, cause_id, points_spent)
      values (${decoded.cycleId}, ${decoded.memberId}, ${causeId}, ${pointsSpent})
    `;

    res.status(200).json({ ok: true, wasFree: isFree, pointsSpent });
  } catch (err) {
    console.error("Vote submit failed:", err.message);
    res.status(500).json({ error: "Couldn't record that vote." });
  }
};
