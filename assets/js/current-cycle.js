(function () {
  "use strict";

  var section = document.getElementById("current-cycle-section");
  var labelEl = document.getElementById("current-cycle-label");
  var talliesEl = document.getElementById("current-cycle-tallies");
  if (!section) return;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  fetch("/api/vote?action=current")
    .then(function (res) {
      return res.ok ? res.json() : Promise.reject(new Error("Couldn't load the current cycle."));
    })
    .then(function (data) {
      if (!data.cycle) return; // no open cycle right now — section stays hidden

      var causes = data.cycle.causes;
      var maxTotal = Math.max(1, ...causes.map(function (c) { return c.voteTotal || 0; }));
      var anyVotes = causes.some(function (c) { return (c.voteTotal || 0) > 0; });
      var leading = causes.reduce(function (best, c) {
        return !best || (c.voteTotal || 0) > (best.voteTotal || 0) ? c : best;
      }, null);

      labelEl.textContent = data.cycle.label;
      talliesEl.innerHTML = causes
        .map(function (c) {
          var total = c.voteTotal || 0;
          var pct = Math.round((total / maxTotal) * 100);
          var isLeading = anyVotes && c === leading;
          return (
            '<div class="tally-row' + (isLeading ? " is-leading" : "") + '">' +
            '<div class="tally-row__head">' +
            '<span class="tally-row__name">' + escapeHtml(c.name) + "</span>" +
            '<span class="tally-row__meta">' + total + " pt" + (total === 1 ? "" : "s") + "</span>" +
            "</div>" +
            '<div class="tally-bar"><div class="tally-bar__fill" style="width:' + pct + '%"></div></div>' +
            "</div>"
          );
        })
        .join("");

      section.hidden = false;
    })
    .catch(function () {
      /* No open cycle, or the lookup failed — the section just stays hidden. */
    });
})();
