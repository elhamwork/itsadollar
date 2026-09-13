(function () {
  "use strict";

  var el = document.querySelector("[data-member-count]");
  if (!el) return;

  // Stays hidden below a minimum — a bare "3 members" reads as empty rather
  // than as momentum. It appears on its own once real growth clears this,
  // no redeploy needed.
  var MIN_TO_SHOW = 10;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function countUp(span, target) {
    if (reduceMotion) {
      span.textContent = target.toLocaleString();
      return;
    }
    var start = performance.now();
    var duration = 900;
    function tick(now) {
      var progress = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      span.textContent = Math.round(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  fetch("/api/vote?action=stats")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !data.memberCount || data.memberCount < MIN_TO_SHOW) return;
      var suffix = data.memberCount === 1 ? " person is" : " people are";
      el.innerHTML = '<span data-count>0</span>' + suffix + " already giving $1 a month.";
      el.hidden = false;
      countUp(el.querySelector("[data-count]"), data.memberCount);
    })
    .catch(function () {
      /* Quiet failure — the section just stays hidden, same as pre-launch. */
    });
})();
