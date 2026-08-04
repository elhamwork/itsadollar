const { sql } = require("../../lib/db");
const { verifyVoteToken } = require("../../lib/voteToken");

// GET ?token=... — what vote.html needs to render: the cycle's causes, this
// member's points balance, and their current pick + its weight, if any.
module.exports = async (req, res) => {
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
};
