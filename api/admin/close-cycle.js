const { sql } = require("../../lib/db");
const { requireAdmin } = require("../../lib/adminAuth");

// Marks a cycle closed and records the actual donation made (amount, and a
// proof link/note) — this is what the public donations page reads from.
module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { cycleId, causeId, amountCents, proofUrl, note } = req.body || {};

  if (!cycleId || !causeId || !amountCents || Number(amountCents) <= 0) {
    return res
      .status(400)
      .json({ error: "cycleId, causeId, and a positive amountCents are required." });
  }

  try {
    const { rows: causeRows } = await sql`
      select id from causes where id = ${causeId} and cycle_id = ${cycleId}
    `;
    if (causeRows.length === 0) {
      return res.status(400).json({ error: "That cause doesn't belong to this cycle." });
    }

    await sql`update cycles set status = 'closed', closed_at = now() where id = ${cycleId}`;
    await sql`
      insert into donations (cycle_id, cause_id, amount_cents, proof_url, note)
      values (${cycleId}, ${causeId}, ${amountCents}, ${proofUrl || null}, ${note || null})
      on conflict (cycle_id) do update set
        cause_id = excluded.cause_id,
        amount_cents = excluded.amount_cents,
        proof_url = excluded.proof_url,
        note = excluded.note
    `;

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to close cycle:", err.message);
    res.status(500).json({ error: "Couldn't close the cycle." });
  }
};
