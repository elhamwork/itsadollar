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
    loadMemberCount();
  }

  function centsToDollars(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Renders each cause as a labeled bar sized to its share of total weight —
  // this is what tells the admin which cause is actually leading.
  function tallyListHtml(causes) {
    var maxTotal = Math.max(1, ...causes.map(function (c) { return c.voteTotal || 0; }));
    var leadingId = causes.reduce(function (best, c) {
      return !best || (c.voteTotal || 0) > (best.voteTotal || 0) ? c : best;
    }, null)?.id;
    var anyVotes = causes.some(function (c) { return (c.voteTotal || 0) > 0; });

    return (
      '<div class="tally-list">' +
      causes
        .map(function (c) {
          var total = c.voteTotal || 0;
          var voters = c.voterCount || 0;
          var pct = Math.round((total / maxTotal) * 100);
          var leading = anyVotes && c.id === leadingId;
          return (
            '<div class="tally-row' + (leading ? " is-leading" : "") + '">' +
            '<div class="tally-row__head">' +
            '<span class="tally-row__name">' + escapeHtml(c.name) + "</span>" +
            '<span class="tally-row__meta">' + total + " pt" + (total === 1 ? "" : "s") + " &middot; " + voters + " voter" + (voters === 1 ? "" : "s") + "</span>" +
            "</div>" +
            '<div class="tally-bar"><div class="tally-bar__fill" style="width:' + pct + '%"></div></div>' +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  async function checkSession() {
    try {
      var res = await fetch("/api/admin?action=session");
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
      var res = await fetch("/api/admin?action=login", {
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
    await fetch("/api/admin?action=logout", { method: "POST" }).catch(function () {});
    showLogin();
  });

  async function loadCycles() {
    openPanel.innerHTML = "<p>Loading&hellip;</p>";
    pastList.innerHTML = "";
    try {
      var res = await fetch("/api/admin?action=cycles");
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error((data && data.error) || "Couldn't load cycles (HTTP " + res.status + ").");
      var open = data.cycles.find(function (c) {
        return c.status === "open";
      });
      var closed = data.cycles.filter(function (c) {
        return c.status !== "open";
      });

      renderOpenPanel(open);
      renderPastCycles(closed);
    } catch (err) {
      openPanel.innerHTML = '<p class="error">' + escapeHtml(err.message) + "</p>";
    }
  }

  function renderOpenPanel(cycle) {
    if (!cycle) {
      openPanel.innerHTML =
        '<span class="admin-status">No cycle open</span>' +
        '<h2 class="title" style="margin-top:.5rem">Open a new cycle</h2>' +
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
        "  </div>" +
        '  <p class="error" id="create-cycle-error" role="alert"></p>' +
        '  <div class="form__actions"><button type="submit" class="btn btn--lg btn--block">Open cycle</button></div>' +
        "</form>";
      document
        .getElementById("create-cycle-form")
        .addEventListener("submit", onCreateCycle);
      return;
    }

    var maxTotal = Math.max(1, ...cycle.causes.map(function (c) { return c.voteTotal || 0; }));
    var leadingId = cycle.causes.reduce(function (best, c) {
      return !best || (c.voteTotal || 0) > (best.voteTotal || 0) ? c : best;
    }, null)?.id;

    var causeOptions = cycle.causes
      .map(function (c) {
        var selected = c.id === leadingId ? " selected" : "";
        return '<option value="' + c.id + '"' + selected + ">" + escapeHtml(c.name) + "</option>";
      })
      .join("");

    openPanel.innerHTML =
      '<span class="admin-status is-open">Open</span>' +
      '<h2 class="title" style="margin-top:.5rem">' + escapeHtml(cycle.label) + "</h2>" +
      '<p class="step-panel__note">' +
      (cycle.emails_sent_at
        ? "Vote-link emails sent " + new Date(cycle.emails_sent_at).toLocaleString() + "."
        : "Vote-link emails haven&rsquo;t gone out yet &mdash; they send automatically on the 15th.") +
      "</p>" +
      '<button type="button" class="btn btn--quiet" id="send-emails-btn">' +
      (cycle.emails_sent_at ? "Send vote emails again now" : "Send vote emails now") +
      "</button>" +
      '<p class="error" id="send-emails-error" role="alert"></p>' +
      '<p class="fine" id="send-emails-result"></p>' +
      tallyListHtml(cycle.causes) +
      '<h3 class="title" style="margin-top:2rem">Close this cycle</h3>' +
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

    document.getElementById("send-emails-btn").addEventListener("click", function () {
      onSendVoteEmails(this);
    });
  }

  async function onSendVoteEmails(btn) {
    var errEl = document.getElementById("send-emails-error");
    var resultEl = document.getElementById("send-emails-result");
    errEl.textContent = "";
    resultEl.textContent = "";

    if (!confirm("Send the vote-link email to every member right now?")) return;

    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = "Sending…";

    try {
      var res = await fetch("/api/admin?action=send-vote-emails", { method: "POST" });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send vote emails.");
      if (data.note) {
        resultEl.textContent = data.note;
      } else {
        var msg = "Sent to " + data.sent + " member" + (data.sent === 1 ? "" : "s") + ".";
        if (data.failed) msg += " " + data.failed + " failed.";
        resultEl.textContent = msg;
      }
      loadCycles();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async function onCreateCycle(e) {
    e.preventDefault();
    var errEl = document.getElementById("create-cycle-error");
    errEl.textContent = "";
    var causeNames = ["cause-1", "cause-2", "cause-3", "cause-4"]
      .map(function (id) { return document.getElementById(id).value.trim(); })
      .filter(Boolean);

    try {
      var res = await fetch("/api/admin?action=cycles", {
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
      var res = await fetch("/api/admin?action=close-cycle", {
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
      pastList.innerHTML = '<p class="step-panel__note">Nothing closed yet.</p>';
      return;
    }
    pastList.innerHTML = cycles
      .map(function (c) {
        var donationLine = c.donation
          ? centsToDollars(c.donation.amount_cents) +
            " to " +
            escapeHtml(
              c.causes.find(function (ca) { return ca.id === c.donation.cause_id; })?.name || ""
            )
          : "No donation recorded";
        return (
          '<div class="admin-past-row">' +
          "<strong>" + escapeHtml(c.label) + "</strong>" +
          tallyListHtml(c.causes) +
          '<span class="step-panel__note">' + donationLine + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  var announceCountEl = document.getElementById("announce-count");
  var announceForm = document.getElementById("announce-form");
  var announceError = document.getElementById("announce-error");
  var announceResult = document.getElementById("announce-result");
  var memberTotal = 0;

  async function loadMemberCount() {
    try {
      var res = await fetch("/api/admin?action=member-count");
      var data = await res.json();
      if (res.ok) {
        memberTotal = data.count;
        announceCountEl.textContent =
          memberTotal + " member" + (memberTotal === 1 ? "" : "s") + " will receive this.";
      }
    } catch {
      /* Count is a nice-to-have; the send button still works without it. */
    }
  }

  announceForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    announceError.textContent = "";
    announceResult.textContent = "";

    var subject = document.getElementById("announce-subject").value.trim();
    var message = document.getElementById("announce-message").value.trim();

    if (!confirm("Send this to " + memberTotal + " member" + (memberTotal === 1 ? "" : "s") + "? This can't be undone.")) {
      return;
    }

    var submitBtn = announceForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      var res = await fetch("/api/admin?action=send-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject, message: message }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send the announcement.");
      var msg = "Sent to " + data.sent + " member" + (data.sent === 1 ? "" : "s") + ".";
      if (data.failed) msg += " " + data.failed + " failed.";
      announceResult.textContent = msg;
      announceForm.reset();
    } catch (err) {
      announceError.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send to every member";
    }
  });

  checkSession();
})();
