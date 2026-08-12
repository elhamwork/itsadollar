(function () {
  "use strict";

  var API_BASE = window.ITSADOLLAR_API_BASE || "";
  var nameEl = document.querySelector("[data-confirm-name]");
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get("session_id");

  if (!nameEl) return;

  if (params.get("admin_bypass") === "1") {
    var bypassName = params.get("firstName");
    var bypassRef = params.get("ref");
    if (bypassName) nameEl.textContent = bypassName;
    if (bypassRef) showShareBlock(bypassRef);
    return;
  }

  if (!sessionId) return;

  fetch(API_BASE + "/api/checkout-session?session_id=" + encodeURIComponent(sessionId))
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data) return;
      if (data.firstName) nameEl.textContent = data.firstName;
      if (data.referralCode) showShareBlock(data.referralCode);
    })
    .catch(function () {
      /* Keep the default "friend" greeting if the lookup fails. */
    });

  function showShareBlock(referralCode) {
    var block = document.querySelector("[data-share-block]");
    var input = document.getElementById("referral-link");
    var copyBtn = document.getElementById("copy-link-btn");
    if (!block || !input || !copyBtn) return;

    var link = window.location.origin + "/join.html?ref=" + encodeURIComponent(referralCode);
    input.value = link;
    block.hidden = false;

    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(link).then(
        function () {
          var original = copyBtn.textContent;
          copyBtn.textContent = "Copied";
          setTimeout(function () {
            copyBtn.textContent = original;
          }, 1500);
        },
        function () {
          input.select();
        }
      );
    });
  }
})();
