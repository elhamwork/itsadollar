(function () {
  "use strict";

  var membersEl = document.querySelector("[data-stat-members]");
  var raisedEl = document.querySelector("[data-stat-raised]");
  var leaderboardSection = document.getElementById("leaderboard-section");
  var leaderboardList = document.getElementById("leaderboard-list");

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  if (membersEl || leaderboardSection) {
    fetch("/api/vote?action=stats")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;

        if (membersEl && data.memberCount) {
          membersEl.textContent = data.memberCount.toLocaleString();
        }

        if (leaderboardSection && leaderboardList && data.topReferrers && data.topReferrers.length > 0) {
          leaderboardList.innerHTML = data.topReferrers
            .map(function (r, i) {
              var name = r.first_name ? escapeHtml(r.first_name) : "A member";
              var count = r.referral_count === 1 ? "1 referral" : r.referral_count + " referrals";
              return (
                '<div class="donation-row">' +
                '<span class="donation-row__when">#' + (i + 1) + "</span>" +
                '<span class="donation-row__what">' + name + " &mdash; " + count + "</span>" +
                "</div>"
              );
            })
            .join("");
          leaderboardSection.hidden = false;
        }
      })
      .catch(function () {
        /* Both sections have sensible defaults (an em dash, staying hidden) if this fails. */
      });
  }

  if (raisedEl) {
    fetch("/api/donations")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.donations) return;
        var totalCents = data.donations.reduce(function (sum, d) { return sum + d.amount_cents; }, 0);
        raisedEl.textContent = "$" + (totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 });
      })
      .catch(function () {
        /* Stays as the em dash placeholder already in the markup. */
      });
  }
})();
