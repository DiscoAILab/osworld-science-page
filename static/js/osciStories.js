/* OSWorld-Science: tabs of the "Case Studies" and "Failures and Successes, Side by Side" sections, and the step
   viewers of the side-by-side runs. The markup (all panels and frames) is written by build_site.py; this script only
   switches which tab panel and which frame is visible. */
(function () {
  "use strict";

  function initTabs(block) {
    var tabs = Array.prototype.slice.call(block.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      var list = tab.parentNode;   /* on phones the tab list scrolls sideways: bring the chosen tab into view */
      if (list.scrollWidth > list.clientWidth + 1) {
        var left = list.scrollLeft + tab.getBoundingClientRect().left - list.getBoundingClientRect().left - 8;
        list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      }
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { select(tab, false); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = tabs[(index + 1) % tabs.length];
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === "Home") next = tabs[0];
        else if (event.key === "End") next = tabs[tabs.length - 1];
        if (next) { event.preventDefault(); select(next, true); }
      });
    });
  }

  function initStepper(stepper) {
    var frames = Array.prototype.slice.call(stepper.querySelectorAll("[data-step]"));
    var prev = stepper.querySelector("[data-step-prev]");
    var next = stepper.querySelector("[data-step-next]");
    var count = stepper.querySelector("[data-step-count]");
    var current = 0;
    function show(index) {
      var focused = document.activeElement;
      current = Math.max(0, Math.min(frames.length - 1, index));
      frames.forEach(function (frame, k) {
        frame.hidden = k !== current;
        frame.classList.toggle("is-active", k === current);
      });
      if (prev) prev.disabled = current === 0;
      if (next) next.disabled = current === frames.length - 1;
      if (count) count.textContent = (current + 1) + " / " + frames.length;
      /* a button that just became disabled drops keyboard focus: hand it to the other one */
      if (focused === next && next.disabled && prev && !prev.disabled) prev.focus();
      else if (focused === prev && prev.disabled && next && !next.disabled) next.focus();
      /* fetch the following screenshot ahead of the next click */
      var ahead = frames[current + 1] && frames[current + 1].querySelector("img");
      if (ahead && ahead.loading === "lazy") ahead.loading = "eager";
    }
    if (prev) prev.addEventListener("click", function () { show(current - 1); });
    if (next) next.addEventListener("click", function () { show(current + 1); });
    stepper.addEventListener("keydown", function (event) {
      if (event.target.closest("button") === null && event.target !== stepper) return;
      if (event.key === "ArrowRight") { event.preventDefault(); show(current + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); show(current - 1); }
    });
    show(0);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-osci-tabs]"), initTabs);
    Array.prototype.forEach.call(document.querySelectorAll("[data-stepper]"), initStepper);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
