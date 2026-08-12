// Thin wrapper around Brevo's transactional email HTTP API. No SDK needed —
// Vercel's Node runtime has a global fetch.
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY isn't configured.");
  }

  const [fromName, fromEmail] = parseFrom(
    process.env.EMAIL_FROM || "It's a Dollar <no-reply@example.com>"
  );

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }

  return res.json();
}

// EMAIL_FROM is "Name <email@domain>" or just "email@domain" — Brevo wants
// name and email as separate fields, unlike Resend's single string.
function parseFrom(value) {
  const match = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) return [match[1].trim() || undefined, match[2].trim()];
  return [undefined, value.trim()];
}

module.exports = { sendEmail };
