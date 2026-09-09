(function () {
  "use strict";

  var el = document.querySelector("[data-member-count]");
  if (!el) return;

  // Stays hidden below a minimum — a bare "3 members" reads as empty rather
  // than as momentum. It appears on its own once real growth clears this,
  // no redeploy needed.
  var MIN_TO_SHOW = 10;

  fetch("/api/vote?action=stats")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !data.memberCount || data.memberCount < MIN_TO_SHOW) return;
      var count = data.memberCount.toLocaleString();
      el.textContent = count + (data.memberCount === 1 ? " person is" : " people are") + " already giving $1 a month.";
      el.hidden = false;
    })
    .catch(function () {
      /* Quiet failure — the section just stays hidden, same as pre-launch. */
    });
})();
