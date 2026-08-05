(function () {
  "use strict";

  var token = new URLSearchParams(window.location.search).get("token");

  var loading = document.getElementById("vote-loading");
  var votePanel = document.getElementById("vote-panel");
  var doneSection = document.getElementById("vote-done");
  var invalidSection = document.getElementById("vote-invalid");
  var invalidNote = document.getElementById("vote-invalid-note");

  var cycleLabelEl = document.getElementById("vote-cycle-label");
  var causeList = document.getElementById("cause-list");
  var errorEl = document.getElementById("vote-error");
  var submitBtn = document.getElementById("vote-submit");

  var pickedNameEl = document.getElementById("picked-cause-name");
  var pickedWeightEl = document.getElementById("picked-weight");
  var boostBlock = document.getElementById("boost-block");
  var boostBalance = document.getElementById("boost-balance");
  var boostInput = document.getElementById("boost-points");
  var boostBtn = document.getElementById("boost-btn");
  var boostError = document.getElementById("boost-error");

  var payBoostInput = document.getElementById("pay-boost-points");
  var payBoostBtn = document.getElementById("pay-boost-btn");
  var payBoostError = document.getElementById("pay-boost-error");
  var payBoostNotice = document.getElementById("pay-boost-notice");

  var selectedCauseId = null;
  var context = null;

  function show(el) {
    [loading, votePanel, doneSection, invalidSection].forEach(function (s) {
      s.hidden = s !== el;
    });
  }

  function showInvalid(message) {
    invalidNote.textContent = message || "This voting link is no longer valid.";
    show(invalidSection);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function causeName(causeId) {
    var cause = context.causes.find(function (c) {
      return c.id === causeId;
    });
    return cause ? cause.name : "";
  }

  function renderCauses() {
    selectedCauseId = null;
    causeList.innerHTML = "";
    context.causes.forEach(function (cause) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cause-option";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.dataset.causeId = cause.id;
      btn.innerHTML =
        "<span class=\"cause-option__name\">" + escapeHtml(cause.name) + "</span>" +
        (cause.description
          ? "<span class=\"cause-option__desc\">" + escapeHtml(cause.description) + "</span>"
          : "");
      btn.addEventListener("click", function () {
        selectedCauseId = cause.id;
        causeList.querySelectorAll(".cause-option").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-checked", String(on));
        });
      });
      causeList.appendChild(btn);
    });
  }

  function renderVotePanel() {
    cycleLabelEl.textContent = context.cycleLabel;
    errorEl.textContent = "";
    renderCauses();
    show(votePanel);
  }

  function renderDone() {
    pickedNameEl.textContent = causeName(context.myVote.cause_id);
    pickedWeightEl.textContent = context.myVote.weight;

    var canBoost = context.points > 0 && context.cycleStatus === "open";
    boostBlock.hidden = !canBoost;
    if (canBoost) {
      boostBalance.textContent = context.points + " point" + (context.points === 1 ? "" : "s") + " available to boost with.";
      boostInput.max = context.points;
      boostInput.value = "";
      boostError.textContent = "";
    }

    show(doneSection);
  }

  submitBtn.addEventListener("click", async function () {
    if (!selectedCauseId) {
      errorEl.textContent = "Pick a cause first.";
      return;
    }
    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Casting your vote…";

    try {
      var res = await fetch("/api/vote?action=submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, causeId: selectedCauseId }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't record that vote.");

      context.myVote = { cause_id: data.causeId, weight: data.weight };
      renderDone();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Cast my vote";
    }
  });

  boostBtn.addEventListener("click", async function () {
    var points = Number(boostInput.value);
    boostError.textContent = "";
    if (!Number.isInteger(points) || points < 1) {
      boostError.textContent = "Enter a whole number of points, at least 1.";
      return;
    }

    boostBtn.disabled = true;
    boostBtn.textContent = "Boosting…";

    try {
      var res = await fetch("/api/vote?action=boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, points: points }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't apply that boost.");

      context.myVote.weight = data.weight;
      context.points = data.pointsRemaining;
      renderDone();
    } catch (err) {
      boostError.textContent = err.message;
    } finally {
      boostBtn.disabled = false;
      boostBtn.textContent = "Boost";
    }
  });

  payBoostBtn.addEventListener("click", async function () {
    var points = Number(payBoostInput.value);
    payBoostError.textContent = "";
    if (!Number.isInteger(points) || points < 1) {
      payBoostError.textContent = "Enter a whole number of dollars, at least 1.";
      return;
    }

    payBoostBtn.disabled = true;
    payBoostBtn.textContent = "Redirecting…";

    try {
      var res = await fetch("/api/vote?action=pay-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, points: points }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start payment.");
      window.location.href = data.url;
    } catch (err) {
      payBoostError.textContent = err.message;
      payBoostBtn.disabled = false;
      payBoostBtn.textContent = "Pay & boost";
    }
  });

  async function refreshContext() {
    var res = await fetch("/api/vote?action=context&token=" + encodeURIComponent(token));
    var data = await res.json();
    if (res.ok) context = data;
    return res.ok;
  }

  async function init() {
    if (!token) {
      showInvalid("This link is missing its token.");
      return;
    }
    try {
      var res = await fetch("/api/vote?action=context&token=" + encodeURIComponent(token));
      var data = await res.json();
      if (!res.ok) {
        showInvalid(data.error);
        return;
      }
      context = data;

      if (context.cycleStatus !== "open") {
        showInvalid("Voting has closed for this cycle.");
        return;
      }

      if (context.myVote) {
        renderDone();
      } else {
        renderVotePanel();
      }

      var params = new URLSearchParams(window.location.search);
      if (params.get("boosted") === "1") {
        history.replaceState(null, "", window.location.pathname + "?token=" + encodeURIComponent(token));
        payBoostNotice.hidden = false;
        setTimeout(async function () {
          if (await refreshContext()) renderDone();
          payBoostNotice.hidden = true;
        }, 1800);
      }
    } catch {
      showInvalid("Can't reach the server right now.");
    }
  }

  init();
})();
