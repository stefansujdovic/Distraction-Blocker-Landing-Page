/**
 * Distraction Blocker — landing page behaviour.
 *
 * Three independent modules, each self-contained and safe to remove:
 *   scrollReveal  fades sections in as they enter the viewport
 *   appDemo       drives the animated Pomodoro mockup in the hero
 *   downloadGate  collects an email, logs it, then starts the download
 *
 * Loaded with `defer` after config.js, so the DOM and window.DB_CONFIG are
 * both ready by the time this runs.
 */
(function () {
  "use strict";

  var config = window.DB_CONFIG || {};
  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ===================================================================
     Module: scroll reveal
     =================================================================== */
  function initScrollReveal() {
    var targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("in"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ===================================================================
     Module: hero app demo
     A compressed Pomodoro loop — focus counts down fast, a break-time
     toast slides in, a short break runs, then it repeats.
     =================================================================== */
  function initAppDemo() {
    var app = document.getElementById("app");
    if (!app) return;

    var els = {
      clock:      document.getElementById("clock"),
      phase:      document.getElementById("phaseLabel"),
      cycle:      document.getElementById("cycleLabel"),
      startBtn:   document.getElementById("startBtn"),
      stopHint:   document.getElementById("stopHint"),
      toast:      document.getElementById("toast"),
      toastTitle: document.getElementById("toastTitle"),
      toastBody:  document.getElementById("toastBody")
    };

    var TOTAL_CYCLES = 4;
    var FOCUS_SECONDS = 25 * 60;
    var BREAK_SECONDS = 5 * 60;

    function format(totalSeconds) {
      var m = Math.floor(totalSeconds / 60);
      var s = totalSeconds % 60;
      return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }

    /* Reduced motion: show a representative still frame and stop. */
    if (prefersReducedMotion) {
      app.classList.add("focus");
      els.phase.textContent = "FOCUS";
      els.clock.textContent = "17:42";
      els.startBtn.textContent = "Stop";
      els.stopHint.textContent = "You can stop only during a break";
      return;
    }

    var state = "focus";
    var secondsLeft = FOCUS_SECONDS;
    var cycle = 1;

    function enterPhase(phase) {
      state = phase;
      var isFocus = phase === "focus";
      app.classList.toggle("focus", isFocus);
      app.classList.toggle("break", !isFocus);
      document.body.classList.toggle("phase-break", !isFocus);

      els.phase.textContent = isFocus ? "FOCUS" : "BREAK";
      els.startBtn.textContent = "Stop";
      els.stopHint.textContent = isFocus
        ? "You can stop only during a break"
        : "Break — everything is unlocked";
      els.cycle.textContent = "Cycle " + cycle + " of " + TOTAL_CYCLES;
      secondsLeft = isFocus ? FOCUS_SECONDS : BREAK_SECONDS;
    }

    function showToast(kind) {
      var isBreak = kind === "break";
      els.toast.classList.toggle("break-toast", isBreak);
      els.toastTitle.textContent = isBreak ? "Break time 🎉" : "Focus started";
      els.toastBody.textContent = isBreak
        ? "Focus session complete. Apps and websites are unlocked for 5 minutes."
        : "Cycle " + cycle + " of " + TOTAL_CYCLES + " — distractions are locked. See you in 25 minutes.";
      els.toast.classList.add("show");
      window.setTimeout(function () { els.toast.classList.remove("show"); }, 3400);
    }

    /* Accelerated time so a "25 min" session plays out in ~20 real seconds. */
    function tick() {
      secondsLeft -= state === "focus" ? 76 : 38;

      if (secondsLeft <= 0) {
        els.clock.textContent = "00:00";
        window.setTimeout(function () {
          if (state === "focus") {
            enterPhase("break");
            showToast("break");
          } else {
            cycle = cycle < TOTAL_CYCLES ? cycle + 1 : 1;
            enterPhase("focus");
            showToast("focus");
          }
        }, 600);
        return;
      }
      els.clock.textContent = format(secondsLeft);
    }

    enterPhase("focus");
    els.clock.textContent = format(FOCUS_SECONDS);
    window.setTimeout(function () { showToast("focus"); }, 1600);
    window.setInterval(tick, 1000);
  }

  /* ===================================================================
     Module: download gate
     Opens a modal, validates the email, logs it to the Google Sheet
     (fire-and-forget), then triggers the installer download.
     =================================================================== */
  function initDownloadGate() {
    var triggers = document.querySelectorAll(".js-download");
    var modal = document.getElementById("dlModal");
    if (!triggers.length || !modal) return;

    var card     = document.getElementById("dlCard");
    var form     = document.getElementById("dlForm");
    var emailIn  = document.getElementById("dlEmail");
    var errorEl  = document.getElementById("dlError");
    var submit   = document.getElementById("dlSubmit");
    var subLabel = document.getElementById("dlSubmitLabel");
    var closeBtn = document.getElementById("dlClose");
    var relink   = document.getElementById("dlRelink");

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var lastFocus = null;

    function isValidEmail(value) {
      return EMAIL_RE.test(value);
    }

    function startDownload() {
      if (!config.downloadUrl) return;
      var link = document.createElement("a");
      link.href = config.downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function setSubmitting(isBusy) {
      submit.disabled = isBusy;
      subLabel.innerHTML = isBusy
        ? '<span class="m-spinner" aria-hidden="true"></span>'
        : "Get the download";
    }

    /* Keep keyboard focus inside the dialog while it is open. */
    function trapFocus(e) {
      if (e.key !== "Tab") return;
      var focusables = modal.querySelectorAll(
        'button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      var visible = Array.prototype.filter.call(focusables, function (el) {
        return el.offsetParent !== null && !el.disabled;
      });
      if (!visible.length) return;
      var first = visible[0];
      var last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    function openModal() {
      lastFocus = document.activeElement;
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      window.setTimeout(function () { emailIn.focus(); }, 60);
    }

    function closeModal() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      window.setTimeout(function () {
        card.classList.remove("done");
        form.reset();
        errorEl.classList.remove("show");
        emailIn.classList.remove("invalid");
        setSubmitting(false);
      }, 300);
      if (lastFocus) lastFocus.focus();
    }

    function logEmail(email) {
      if (!config.sheetEndpoint) return Promise.resolve();
      var payload = new URLSearchParams({
        email: email,
        source: "landing",
        ts: new Date().toISOString()
      });
      /* no-cors: the append succeeds even though the response is opaque. */
      return fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        body: payload
      });
    }

    function handleSubmit(e) {
      e.preventDefault();
      var email = emailIn.value.trim();

      if (!isValidEmail(email)) {
        errorEl.classList.add("show");
        emailIn.classList.add("invalid");
        emailIn.focus();
        return;
      }

      setSubmitting(true);

      function finish() {
        card.classList.add("done");
        startDownload();
      }
      /* Always download, even if logging fails. */
      logEmail(email).then(finish, finish);
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        openModal();
      });
    });

    closeBtn.addEventListener("click", closeModal);
    relink.addEventListener("click", startDownload);
    form.addEventListener("submit", handleSubmit);

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (!modal.classList.contains("open")) return;
      if (e.key === "Escape") closeModal();
      else trapFocus(e);
    });

    /* Clear the error state as soon as the input becomes valid. */
    emailIn.addEventListener("input", function () {
      if (errorEl.classList.contains("show") && isValidEmail(emailIn.value.trim())) {
        errorEl.classList.remove("show");
        emailIn.classList.remove("invalid");
      }
    });
  }

  /* ===================================================================
     Boot
     =================================================================== */
  initScrollReveal();
  initAppDemo();
  initDownloadGate();
})();
