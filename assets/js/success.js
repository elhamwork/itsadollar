(function () {
  "use strict";

  var API_BASE = window.ITSADOLLAR_API_BASE || "http://localhost:4242";
  var nameEl = document.querySelector("[data-confirm-name]");
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get("session_id");

  if (!sessionId || !nameEl) return;

  fetch(API_BASE + "/api/checkout-session?session_id=" + encodeURIComponent(sessionId))
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (data && data.firstName) nameEl.textContent = data.firstName;
    })
    .catch(function () {
      /* Keep the default "friend" greeting if the lookup fails. */
    });
})();
