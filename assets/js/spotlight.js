(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  function trackCursor(el, xVar, yVar) {
    el.addEventListener("mousemove", function (e) {
      var rect = el.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty(xVar, x + "%");
      el.style.setProperty(yVar, y + "%");
    });
  }

  document.querySelectorAll(".idea, .final").forEach(function (el) {
    trackCursor(el, "--spot-x", "--spot-y");
  });

  document.querySelectorAll(".step, .stat").forEach(function (card) {
    trackCursor(card, "--mx", "--my");
  });
})();
