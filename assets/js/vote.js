(function () {
  "use strict";

  var token = new URLSearchParams(window.location.search).get("token");

  var loading = document.getElementById("vote-loading");
  var votePanel = document.getElementById("vote-panel");
  var doneSection = document.getElementById("vote-done");
  var doneNote = document.getElementById("vote-done-note");
  var invalidSection = document.getElementById("vote-invalid");
  var invalidNote = document.getElementById("vote-invalid-note");

  var cycleLabelEl = document.getElementById("vote-cycle-label");
  var causeList = document.getElementById("cause-list");
  var errorEl = document.getElementById("vote-error");
  var submitBtn = document.getElementById("vote-submit");
  var extraPickBlock = document.getElementById("extra-pick");
  var pointsNote = document.getElementById("points-note");
  var extraPickBtn = document.getElementById("extra-pick-btn");

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

  function renderCauses(causes) {
    selectedCauseId = null;
    causeList.innerHTML = "";
    causes.forEach(function (cause) {
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
    extraPickBlock.hidden = true;
    renderCauses(context.causes);
    show(votePanel);
  }

  function renderDone(justVoted) {
    if (justVoted && justVoted.wasFree === false) {
      doneNote.textContent = "Extra pick counted. Thanks for making it count twice.";
    } else {
      doneNote.textContent = "Thanks for picking where this month’s dollars go.";
    }

    var canExtra = context.points >= 10 && context.cycleStatus === "open";
    var extraBtn = document.getElementById("done-extra-pick-btn");
    if (!extraBtn && canExtra) {
      extraBtn = document.createElement("button");
      extraBtn.type = "button";
      extraBtn.id = "done-extra-pick-btn";
      extraBtn.className = "btn btn--quiet";
      extraBtn.style.marginTop = "1.5rem";
      extraBtn.addEventListener("click", function () {
        renderVotePanel();
      });
      doneSection.querySelector(".confirm__actions").insertAdjacentElement("afterend", extraBtn);
    }
    if (extraBtn) {
      extraBtn.hidden = !canExtra;
      extraBtn.textContent = "Use 10 points for an extra pick (" + context.points + " available)";
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
      var res = await fetch("/api/vote/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, causeId: selectedCauseId }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't record that vote.");

      context.points -= data.pointsSpent || 0;
      context.votesCast.push(selectedCauseId);
      renderDone(data);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Cast my vote";
    }
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  async function init() {
    if (!token) {
      showInvalid("This link is missing its token.");
      return;
    }
    try {
      var res = await fetch("/api/vote/context?token=" + encodeURIComponent(token));
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

      if (context.votesCast.length > 0) {
        renderDone(null);
      } else {
        renderVotePanel();
      }
    } catch {
      showInvalid("Can't reach the server right now.");
    }
  }

  init();
})();
