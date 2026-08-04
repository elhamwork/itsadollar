(function () {
  "use strict";

  var form = document.querySelector("[data-join-form]");
  if (!form) return;

  var panels = {
    1: document.getElementById("step-1"),
    2: document.getElementById("step-2"),
    3: document.getElementById("step-3"),
  };
  var segs = document.querySelectorAll("[data-seg]");
  var progressBar = document.querySelector("[data-progress]");

  var fields = {
    firstName: { el: document.getElementById("firstName"), msg: "Enter your first name." },
    lastName: { el: document.getElementById("lastName"), msg: "Enter your last name." },
    email: { el: document.getElementById("email"), msg: "Enter a valid email address." },
    cardNumber: { el: document.getElementById("cardNumber"), msg: "Enter a valid card number." },
    cardExpiry: { el: document.getElementById("cardExpiry"), msg: "Enter a valid expiry date." },
    cardCvc: { el: document.getElementById("cardCvc"), msg: "Enter a valid security code." },
  };

  function setError(name, message) {
    var f = fields[name];
    if (!f) return;
    var errEl = document.getElementById("err-" + name);
    if (message) {
      f.el.setAttribute("aria-invalid", "true");
      if (errEl) errEl.textContent = message;
    } else {
      f.el.removeAttribute("aria-invalid");
      if (errEl) errEl.textContent = "";
    }
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function digitsOnly(v) {
    return v.replace(/\D/g, "");
  }

  function validateStep1() {
    var ok = true;
    var first = fields.firstName.el.value.trim();
    var last = fields.lastName.el.value.trim();
    var email = fields.email.el.value.trim();

    if (!first) { setError("firstName", fields.firstName.msg); ok = false; }
    else setError("firstName", "");

    if (!last) { setError("lastName", fields.lastName.msg); ok = false; }
    else setError("lastName", "");

    if (!email || !isValidEmail(email)) { setError("email", fields.email.msg); ok = false; }
    else setError("email", "");

    return ok;
  }

  function validateStep2() {
    var ok = true;
    var num = digitsOnly(fields.cardNumber.el.value);
    var exp = fields.cardExpiry.el.value.trim();
    var cvc = digitsOnly(fields.cardCvc.el.value);

    if (num.length < 13 || num.length > 19) { setError("cardNumber", fields.cardNumber.msg); ok = false; }
    else setError("cardNumber", "");

    var expMatch = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(exp);
    if (!expMatch) { setError("cardExpiry", fields.cardExpiry.msg); ok = false; }
    else setError("cardExpiry", "");

    if (cvc.length < 3 || cvc.length > 4) { setError("cardCvc", fields.cardCvc.msg); ok = false; }
    else setError("cardCvc", "");

    return ok;
  }

  // Light input formatting
  fields.cardNumber.el.addEventListener("input", function (e) {
    var v = digitsOnly(e.target.value).slice(0, 19);
    e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
  });
  fields.cardExpiry.el.addEventListener("input", function (e) {
    var v = digitsOnly(e.target.value).slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2);
    e.target.value = v;
  });
  fields.cardCvc.el.addEventListener("input", function (e) {
    e.target.value = digitsOnly(e.target.value).slice(0, 4);
  });

  function goTo(step) {
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = Number(key) !== step;
    });
    segs.forEach(function (seg) {
      seg.classList.toggle("is-done", Number(seg.dataset.seg) < step || Number(seg.dataset.seg) === step);
    });
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(step));
    panels[step].querySelector("h1, .step-panel__title")?.focus?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-next]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (validateStep1()) goTo(2);
      else fields.firstName.el.focus();
    });
  });

  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goTo(1);
    });
  });

  var submitBtn = document.querySelector("[data-submit]");
  if (submitBtn) {
    submitBtn.addEventListener("click", function () {
      if (!validateStep2()) return;
      submitBtn.classList.add("is-busy");
      submitBtn.textContent = "Joining…";
      // Simulated processing delay. Wire this up to a real payment
      // processor (e.g. Stripe) before going live.
      window.setTimeout(function () {
        var nameEl = document.querySelector("[data-confirm-name]");
        var first = fields.firstName.el.value.trim();
        if (nameEl) nameEl.textContent = first || "friend";
        goTo(3);
      }, 900);
    });
  }
})();
