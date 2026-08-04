(function () {
  "use strict";

  var list = document.getElementById("donation-list");
  if (!list) return;

  function centsToDollars(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  fetch("/api/donations")
    .then(function (res) {
      return res.ok ? res.json() : Promise.reject(new Error("Couldn't load donations."));
    })
    .then(function (data) {
      if (!data.donations || data.donations.length === 0) {
        list.innerHTML = '<p class="step-panel__note">Nothing donated yet &mdash; check back after the first cycle closes.</p>';
        return;
      }
      list.innerHTML = data.donations
        .map(function (d) {
          var when = new Date(d.donated_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
          });
          var proof = d.proof_url
            ? '<a class="link" href="' + escapeHtml(d.proof_url) + '" target="_blank" rel="noopener">Proof <span class="chev">&rarr;</span></a>'
            : "";
          return (
            '<div class="donation-row">' +
            '<span class="donation-row__when">' + escapeHtml(when) + "</span>" +
            '<span class="donation-row__what">' + centsToDollars(d.amount_cents) + " to " + escapeHtml(d.cause_name) + "</span>" +
            proof +
            "</div>"
          );
        })
        .join("");
    })
    .catch(function () {
      list.innerHTML = '<p class="step-panel__note">Couldn&rsquo;t load this right now.</p>';
    });
})();
