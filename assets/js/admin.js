(function () {
  "use strict";

  var loginSection = document.getElementById("admin-login");
  var dashboardSection = document.getElementById("admin-dashboard");
  var loginForm = document.getElementById("login-form");
  var loginError = document.getElementById("login-error");
  var logoutBtn = document.getElementById("logout-btn");
  var openPanel = document.getElementById("open-cycle-panel");
  var pastList = document.getElementById("past-cycles");

  function showLogin() {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
  }

  function showDashboard() {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    loadCycles();
  }

  function centsToDollars(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  async function checkSession() {
    try {
      var res = await fetch("/api/admin/session");
      if (res.ok) showDashboard();
      else showLogin();
    } catch {
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    loginError.textContent = "";
    var password = document.getElementById("admin-password").value;
    try {
      var res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
      });
      var data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error || "Couldn't log in.";
        return;
      }
      loginForm.reset();
      showDashboard();
    } catch {
      loginError.textContent = "Can't reach the server right now.";
    }
  });

  logoutBtn.addEventListener("click", async function () {
    await fetch("/api/admin/logout", { method: "POST" }).catch(function () {});
    showLogin();
  });

  async function loadCycles() {
    openPanel.innerHTML = "<p>Loading&hellip;</p>";
    pastList.innerHTML = "";
    try {
      var res = await fetch("/api/admin/cycles");
      if (!res.ok) throw new Error("Couldn't load cycles.");
      var data = await res.json();
      var open = data.cycles.find(function (c) {
        return c.status === "open";
      });
      var closed = data.cycles.filter(function (c) {
        return c.status !== "open";
      });

      renderOpenPanel(open);
      renderPastCycles(closed);
    } catch (err) {
      openPanel.innerHTML = "<p class=\"error\">" + escapeHtml(err.message) + "</p>";
    }
  }

  function renderOpenPanel(cycle) {
    if (!cycle) {
      openPanel.innerHTML =
        '<h2 class="title">Open a new cycle</h2>' +
        '<form class="form" id="create-cycle-form">' +
        '  <div class="field-group">' +
        '    <div class="input-wrap"><input class="input" type="text" id="cycle-label" placeholder=" " required>' +
        '      <label class="input-label" for="cycle-label">Cycle label (e.g. September 2026)</label></div>' +
        '    <div class="input-wrap"><input class="input" type="text" id="cause-1" placeholder=" " required>' +
        '      <label class="input-label" for="cause-1">Cause 1</label></div>' +
        '    <div class="input-wrap"><input class="input" type="text" id="cause-2" placeholder=" " required>' +
        '      <label class="input-label" for="cause-2">Cause 2</label></div>' +
        '    <div class="input-wrap"><input class="input" type="text" id="cause-3" placeholder=" ">' +
        '      <label class="input-label" for="cause-3">Cause 3 (optional)</label></div>' +
        '    <div class="input-wrap"><input class="input" type="text" id="cause-4" placeholder=" ">' +
        '      <label class="input-label" for="cause-4">Cause 4 (optional)</label></div>' +
        '  </div>' +
        '  <p class="error" id="create-cycle-error" role="alert"></p>' +
        '  <div class="form__actions"><button type="submit" class="btn btn--lg btn--block">Open cycle</button></div>' +
        "</form>";
      document
        .getElementById("create-cycle-form")
        .addEventListener("submit", onCreateCycle);
      return;
    }

    var causeOptions = cycle.causes
      .map(function (c) {
        return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>";
      })
      .join("");

    openPanel.innerHTML =
      '<h2 class="title">Open cycle — ' + escapeHtml(cycle.label) + "</h2>" +
      "<ul>" +
      cycle.causes.map(function (c) { return "<li>" + escapeHtml(c.name) + "</li>"; }).join("") +
      "</ul>" +
      '<p class="step-panel__note">' +
      (cycle.emails_sent_at
        ? "Vote-link emails sent " + new Date(cycle.emails_sent_at).toLocaleString() + "."
        : "Vote-link emails haven&rsquo;t gone out yet &mdash; they send automatically on the 15th.") +
      "</p>" +
      '<h3 class="title">Close this cycle</h3>' +
      '<form class="form" id="close-cycle-form">' +
      '  <div class="field-group">' +
      '    <label class="input-label" for="winning-cause" style="position:static;font-size:.875rem;color:var(--ink-quiet)">Winning cause</label>' +
      '    <select class="input" id="winning-cause" required>' + causeOptions + "</select>" +
      '    <div class="input-wrap"><input class="input" type="number" min="1" step="1" id="amount-cents" placeholder=" " required>' +
      '      <label class="input-label" for="amount-cents">Amount donated (in cents)</label></div>' +
      '    <div class="input-wrap"><input class="input" type="url" id="proof-url" placeholder=" ">' +
      '      <label class="input-label" for="proof-url">Proof link (receipt, post, etc.)</label></div>' +
      '    <div class="input-wrap"><input class="input" type="text" id="donation-note" placeholder=" ">' +
      '      <label class="input-label" for="donation-note">Note (optional)</label></div>' +
      "  </div>" +
      '  <p class="error" id="close-cycle-error" role="alert"></p>' +
      '  <div class="form__actions"><button type="submit" class="btn btn--lg btn--block">Close cycle &amp; record donation</button></div>' +
      "</form>";

    document.getElementById("close-cycle-form").addEventListener("submit", function (e) {
      onCloseCycle(e, cycle.id);
    });
  }

  async function onCreateCycle(e) {
    e.preventDefault();
    var errEl = document.getElementById("create-cycle-error");
    errEl.textContent = "";
    var causeNames = ["cause-1", "cause-2", "cause-3", "cause-4"]
      .map(function (id) { return document.getElementById(id).value.trim(); })
      .filter(Boolean);

    try {
      var res = await fetch("/api/admin/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: document.getElementById("cycle-label").value.trim(),
          causeNames: causeNames,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't open the cycle.");
      loadCycles();
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  async function onCloseCycle(e, cycleId) {
    e.preventDefault();
    var errEl = document.getElementById("close-cycle-error");
    errEl.textContent = "";

    try {
      var res = await fetch("/api/admin/close-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: cycleId,
          causeId: Number(document.getElementById("winning-cause").value),
          amountCents: Number(document.getElementById("amount-cents").value),
          proofUrl: document.getElementById("proof-url").value.trim(),
          note: document.getElementById("donation-note").value.trim(),
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't close the cycle.");
      loadCycles();
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  function renderPastCycles(cycles) {
    if (cycles.length === 0) {
      pastList.innerHTML = "<p class=\"step-panel__note\">Nothing closed yet.</p>";
      return;
    }
    pastList.innerHTML = cycles
      .map(function (c) {
        var causeNames = c.causes.map(function (ca) { return ca.name; }).join(", ");
        var donationLine = c.donation
          ? centsToDollars(c.donation.amount_cents) +
            " to " +
            escapeHtml(c.causes.find(function (ca) { return ca.id === c.donation.cause_id; })?.name || "")
          : "No donation recorded";
        return (
          '<div class="admin-past-row">' +
          "<strong>" + escapeHtml(c.label) + "</strong>" +
          '<span class="step-panel__note">' + escapeHtml(causeNames) + "</span>" +
          '<span class="step-panel__note">' + donationLine + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  checkSession();
})();
