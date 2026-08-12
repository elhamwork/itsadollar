// Table-based HTML wrapper so emails render consistently across Gmail,
// Outlook, and Apple Mail — those clients strip <style> blocks and modern
// CSS unpredictably, so layout has to be tables and every style inline.
// Callers pass already-escaped HTML for any user-generated content; this
// only adds the card, typography, optional button, and footer around it.
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function emailLayout({ bodyHtml, ctaUrl, ctaLabel, footerHtml }) {
  const cta =
    ctaUrl && ctaLabel
      ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px">
                <tr>
                  <td style="background:#111113;border-radius:999px">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${ctaLabel}</a>
                  </td>
                </tr>
              </table>`
      : "";

  const footer = footerHtml
    ? `
          <tr>
            <td style="padding:20px 36px 32px;border-top:1px solid rgba(0,0,0,0.08)">
              <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#6e6e73">${footerHtml}</div>
            </td>
          </tr>`
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f3ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee">
    <tr>
      <td align="center" style="padding:40px 20px">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
          <tr>
            <td style="padding:36px 36px 8px">
              <div style="font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#111113;margin-bottom:24px">It&rsquo;s a Dollar</div>
              <div style="font-family:${FONT};font-size:16px;line-height:1.6;color:#111113">${bodyHtml}</div>${cta}
            </td>
          </tr>${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { emailLayout };
