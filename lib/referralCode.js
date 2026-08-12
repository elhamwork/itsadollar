const crypto = require("crypto");
const { sql } = require("./db");

// No 0/O/1/I — avoids codes that are ambiguous to read or type back in.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReferralCode(length = 7) {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

async function generateUniqueReferralCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const { rows } = await sql`select 1 from members where referral_code = ${code}`;
    if (rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique referral code after 5 attempts.");
}

module.exports = { generateReferralCode, generateUniqueReferralCode };
