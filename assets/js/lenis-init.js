(function () {
  "use strict";

  // Respects the same reduced-motion preference the rest of the site's
  // animations already honor (see site.css's Motion preferences block).
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  if (typeof Lenis === "undefined") return;

  var lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // In-page anchor links (e.g. index.html's "Learn more" link) still need
  // Lenis's easing, not the instant native jump — the fixed 60px header
  // (--header-h in site.css) means every target needs a matching offset so
  // the heading doesn't land underneath it.
  document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -76 });
    });
  });
})();
