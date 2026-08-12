(function () {
  "use strict";

  var form = document.querySelector("[data-join-form]");
  if (!form) return;

  var API_BASE = window.ITSADOLLAR_API_BASE || "";

  var panels = {
    1: document.getElementById("step-1"),
    2: document.getElementById("step-2"),
  };
  var segs = document.querySelectorAll("[data-seg]");
  var progressBar = document.querySelector("[data-progress]");

  var fields = {
    firstName: { el: document.getElementById("firstName"), msg: "Enter your first name." },
    lastName: { el: document.getElementById("lastName"), msg: "Enter your last name." },
    email: { el: document.getElementById("email"), msg: "Enter a valid email address." },
  };

  var coverFeeCheckbox = document.getElementById("cover-fee");
  var amountEls = document.querySelectorAll(".js-amount");

  function updateAmountDisplays() {
    var text = coverFeeCheckbox && coverFeeCheckbox.checked ? "$1.35" : "$1";
    amountEls.forEach(function (el) {
      el.textContent = text;
    });
  }

  if (coverFeeCheckbox) {
    coverFeeCheckbox.addEventListener("change", updateAmountDisplays);
    updateAmountDisplays();
  }

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

  function goTo(step) {
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = Number(key) !== step;
    });
    segs.forEach(function (seg) {
      seg.classList.toggle("is-done", Number(seg.dataset.seg) <= step);
    });
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(step));
    panels[step].querySelector(".step-panel__title, .confirm__title")?.focus?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  var redirectTitle = document.querySelector("[data-redirect-title]");
  var redirectNote = document.querySelector("[data-redirect-note]");
  var redirectError = document.getElementById("err-redirect");
  var redirectActions = document.getElementById("redirect-actions");

  function showRedirectError(message) {
    if (redirectTitle) redirectTitle.textContent = "Something went wrong.";
    if (redirectNote) redirectNote.hidden = true;
    if (redirectError) redirectError.textContent = message;
    if (redirectActions) redirectActions.hidden = false;
    document.querySelector(".spinner")?.setAttribute("hidden", "true");
  }

  async function startCheckout() {
    goTo(2);
    try {
      var res = await fetch(API_BASE + "/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fields.firstName.el.value.trim(),
          lastName: fields.lastName.el.value.trim(),
          email: fields.email.el.value.trim(),
          referredBy: new URLSearchParams(window.location.search).get("ref") || "",
          coverFee: !!(coverFeeCheckbox && coverFeeCheckbox.checked),
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start checkout.");
      window.location.href = data.url;
    } catch (err) {
      showRedirectError(
        err.message === "Failed to fetch"
          ? "Can't reach the payment server right now. Please try again in a moment."
          : err.message
      );
    }
  }

  document.querySelectorAll("[data-next]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (validateStep1()) startCheckout();
      else fields.firstName.el.focus();
    });
  });

  var bypassActions = document.getElementById("admin-bypass-actions");
  var bypassNote = document.getElementById("admin-bypass-note");
  var bypassBtn = document.getElementById("admin-bypass-btn");

  if (bypassActions && bypassNote && bypassBtn) {
    fetch(API_BASE + "/api/admin?action=session")
      .then(function (res) {
        if (res.ok) {
          bypassActions.hidden = false;
          bypassNote.hidden = false;
        }
      })
      .catch(function () {
        /* Not logged in as admin, or the check failed — leave it hidden. */
      });

    bypassBtn.addEventListener("click", function () {
      if (!validateStep1()) {
        fields.firstName.el.focus();
        return;
      }
      startAdminBypass();
    });
  }

  async function startAdminBypass() {
    goTo(2);
    if (redirectTitle) redirectTitle.textContent = "Adding you as a test member…";
    if (redirectNote) redirectNote.textContent = "No charge — this is the admin bypass.";
    try {
      var res = await fetch(API_BASE + "/api/admin?action=add-test-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fields.firstName.el.value.trim(),
          lastName: fields.lastName.el.value.trim(),
          email: fields.email.el.value.trim(),
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add test member.");
      window.location.href =
        "success.html?admin_bypass=1" +
        "&firstName=" + encodeURIComponent(fields.firstName.el.value.trim()) +
        "&ref=" + encodeURIComponent(data.referralCode);
    } catch (err) {
      showRedirectError(err.message);
    }
  }

  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goTo(1);
    });
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get("cancelled") === "1") {
    var notice = document.getElementById("cancelled-notice");
    if (notice) notice.hidden = false;
  }
})();
