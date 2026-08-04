const { sql } = require("../../lib/db");
const { requireAdmin } = require("../../lib/adminAuth");

// GET: list recent cycles with their causes and (if closed) donation record —
// what the admin dashboard renders.
// POST: open a new cycle with 2-4 causes. Only one cycle may be open at a
// time, so the cron job always has an unambiguous cycle to email about.
module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const { rows: cycles } = await sql`
      select * from cycles order by created_at desc limit 24
    `;
    const { rows: causes } = await sql`select * from causes order by id asc`;
    const { rows: donations } = await sql`select * from donations`;
    const { rows: tallies } = await sql`
      select cause_id, sum(weight)::int as total, count(*)::int as voters
      from votes group by cause_id
    `;

    const result = cycles.map((cycle) => ({
      ...cycle,
      causes: causes
        .filter((c) => c.cycle_id === cycle.id)
        .map((c) => {
          const t = tallies.find((row) => row.cause_id === c.id);
          return { ...c, voteTotal: t ? t.total : 0, voterCount: t ? t.voters : 0 };
        }),
      donation: donations.find((d) => d.cycle_id === cycle.id) || null,
    }));

    return res.status(200).json({ cycles: result });
  }

  if (req.method === "POST") {
    const { label, causeNames } = req.body || {};

    if (!label || typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "A cycle label is required." });
    }
    const names = Array.isArray(causeNames)
      ? causeNames.map((n) => String(n).trim()).filter(Boolean)
      : [];
    if (names.length < 2 || names.length > 4) {
      return res.status(400).json({ error: "Provide 2 to 4 cause names." });
    }

    const { rows: openCycles } = await sql`select id from cycles where status = 'open'`;
    if (openCycles.length > 0) {
      return res.status(400).json({
        error: "A cycle is already open. Close it before opening a new one.",
      });
    }

    try {
      const { rows } = await sql`
        insert into cycles (label) values (${label.trim()}) returning id
      `;
      const cycleId = rows[0].id;
      for (const name of names) {
        await sql`insert into causes (cycle_id, name) values (${cycleId}, ${name})`;
      }
      return res.status(200).json({ ok: true, cycleId });
    } catch (err) {
      console.error("Failed to create cycle:", err.message);
      return res.status(500).json({ error: "Couldn't create the cycle." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed." });
};
