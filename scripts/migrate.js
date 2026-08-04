require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { sql } = require("@vercel/postgres");

async function main() {
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "schema.sql"),
    "utf8"
  );
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
  }

  console.log(`Ran ${statements.length} schema statements.`);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
