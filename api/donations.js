const { sql } = require("../lib/db");

// Public, read-only — powers the "where your dollars went" list on impact.html.
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { rows } = await sql`
      select d.amount_cents, d.proof_url, d.note, d.donated_at,
             c.label as cycle_label, ca.name as cause_name
      from donations d
      join cycles c on c.id = d.cycle_id
      join causes ca on ca.id = d.cause_id
      order by d.donated_at desc
      limit 50
    `;
    res.status(200).json({ donations: rows });
  } catch (err) {
    console.error("Failed to load donations:", err.message);
    res.status(500).json({ error: "Couldn't load donations." });
  }
};
