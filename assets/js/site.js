(function () {
  "use strict";

  var docEl = document.documentElement;
  docEl.classList.remove("no-js");
  docEl.classList.add("js");

  /* ---------------- Header: solidify on scroll, invert over dark sections --------------- */

  var header = document.querySelector("[data-header]");

  if (header) {
    var darkSections = Array.prototype.slice.call(
      document.querySelectorAll(".section--dark, .section--black")
    );

    var setStuck = function () {
      header.classList.toggle("is-stuck", window.scrollY > 4);
    };
    setStuck();
    window.addEventListener("scroll", setStuck, { passive: true });

    if (darkSections.length && "IntersectionObserver" in window) {
      var headerH = header.offsetHeight || 60;
      var invertObserver = new IntersectionObserver(
        function () {
          var probeY = headerH / 2;
          var probeX = window.innerWidth / 2;
          var el = document.elementFromPoint(probeX, probeY);
          var onDark = el ? el.closest(".section--dark, .section--black") : null;
          header.classList.toggle("is-inverted", !!onDark);
        },
        { rootMargin: "-" + Math.round(headerH / 2) + "px 0px -100% 0px", threshold: 0 }
      );
      darkSections.forEach(function (s) {
        invertObserver.observe(s);
      });
      window.addEventListener("scroll", function () {
        var probeY = headerH / 2;
        var probeX = window.innerWidth / 2;
        var el = document.elementFromPoint(probeX, probeY);
        var onDark = el ? el.closest(".section--dark, .section--black") : null;
        header.classList.toggle("is-inverted", !!onDark);
      }, { passive: true });
    }
  }

  /* ---------------- Mobile menu ---------------- */

  var toggle = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-mobile-menu]");

  if (toggle && menu) {
    var closeMenu = function () {
      toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      document.body.classList.remove("is-locked");
    };
    var openMenu = function () {
      toggle.setAttribute("aria-expanded", "true");
      menu.classList.add("is-open");
      document.body.classList.add("is-locked");
    };
    toggle.addEventListener("click", function () {
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 720) closeMenu();
    });
  }

  /* ---------------- Scroll reveal ---------------- */

  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (revealEls.length) {
    if ("IntersectionObserver" in window) {
      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
      );
      revealEls.forEach(function (el) {
        revealObserver.observe(el);
      });
    } else {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
  }

  /* ---------------- Field of dots (Section 3) ---------------- */

  var field = document.querySelector("[data-field]");

  if (field) {
    var cols = window.innerWidth < 640 ? 12 : window.innerWidth < 1024 ? 18 : 26;
    var rows = 4;
    var total = cols * rows;
    var litCount = Math.max(3, Math.round(total * 0.045));
    var litIndexes = new Set();
    while (litIndexes.size < litCount) {
      litIndexes.add(Math.floor(Math.random() * total));
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < total; i++) {
      var dot = document.createElement("span");
      dot.className = "field__dot" + (litIndexes.has(i) ? " field__dot--on" : "");
      dot.style.setProperty("--d", (i % cols) * 12 + Math.floor(i / cols) * 40 + "ms");
      frag.appendChild(dot);
    }
    field.appendChild(frag);

    if ("IntersectionObserver" in window) {
      var fieldObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              field.classList.add("is-visible");
              fieldObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      fieldObserver.observe(field);
    } else {
      field.classList.add("is-visible");
    }
  }

  /* ---------------- Footer year ---------------- */

  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
