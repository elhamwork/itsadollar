(function () {
  "use strict";

  var faq = document.querySelector("[data-faq]");
  if (!faq) return;

  faq.querySelectorAll(".faq__q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var expanded = btn.getAttribute("aria-expanded") === "true";
      var panel = btn.nextElementSibling;
      btn.setAttribute("aria-expanded", String(!expanded));
      if (panel) panel.setAttribute("data-open", String(!expanded));
    });
  });
})();
