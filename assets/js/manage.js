(function () {
  "use strict";

  var emailInput = document.getElementById("manage-email");
  var errorEl = document.getElementById("manage-error");
  var submitBtn = document.getElementById("manage-submit");

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function submit() {
    var email = emailInput.value.trim();
    errorEl.textContent = "";

    if (!isValidEmail(email)) {
      errorEl.textContent = "Enter a valid email address.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Finding your membership…";

    try {
      var res = await fetch("/api/manage-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't find your membership.");
      window.location.href = data.url;
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue";
    }
  }

  submitBtn.addEventListener("click", submit);
  emailInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });
})();
