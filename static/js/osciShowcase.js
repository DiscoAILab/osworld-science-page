/* task-showcase/index.html: lists the showcase tasks (several applications) from window.OSWORLD_TRAJECTORY_SHOWCASE and replays one run
   at a time. Run data is loaded as a script (static/data/showcase/runs/<task>_<model>.js) so it works from a local file.
   Step counts: the viewer counts the replayed steps (stepCount); when the harness log counts a different number of
   steps (totalSteps), the run summary says so. */
(function () {
  "use strict";
  var data = window.OSWORLD_TRAJECTORY_SHOWCASE;
  var root = document.getElementById("showcase-root");
  if (!data || !root) return;
  var ROOT = window.OSWORLD_SITE_ROOT || "../";
  var state = { taskId: null, modelId: null, step: 0 };

  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function task() { return data.tasks.filter(function (t) { return t.id === state.taskId; })[0] || data.tasks[0]; }
  function run() {
    var t = task();
    return t.runs.filter(function (r) { return r.modelId === state.modelId; })[0] || t.runs[0];
  }
  function runData() { return window.OSCI_RUNS && window.OSCI_RUNS[task().id + "_" + run().modelId]; }
  function loadRun(cb) {
    if (runData()) return cb();
    var s = document.createElement("script");
    s.src = ROOT + "static/data/showcase/runs/" + task().id + "_" + run().modelId + ".js";
    s.onload = cb;
    s.onerror = function () { root.querySelector("[data-viewer]").innerHTML = '<p class="osci-error">Run data not found.</p>'; };
    document.head.appendChild(s);
  }
  function fmtScore(v) { return typeof v === "number" ? v.toFixed(2) : "—"; }
  function stepsLabel(r) { return r.stepCount + (r.stepCount === 1 ? " step" : " steps"); }
  function datasetId(t) { return t.datasetId || t.id; }
  var STATUS = { done: "finished", max_steps: "step budget exhausted", no_action_stall: "stopped without an action" };

  function renderShell() {
    root.innerHTML = [
      '<div class="osci-task-list" role="tablist">',
      data.tasks.map(function (t) {
        return '<button class="osci-task-tab' + (t.id === task().id ? " is-active" : "") + '" type="button" data-task="' + esc(t.id) + '">' +
               '<img src="' + esc(t.coverImage) + '" alt="" loading="lazy"><span><strong>' + esc(t.shortTitle) + '</strong><small>' + esc(datasetId(t)) + ' · ' + esc(t.category) + '</small></span></button>';
      }).join(""),
      '</div>',
      '<div class="osci-task-head"><p class="osci-task-id">Task ' + esc(datasetId(task())) + '</p><h2 class="title is-3">' + esc(task().title) + '</h2>',
      '<p class="osci-instruction"><span>Instruction</span>' + esc(task().instruction) + '</p></div>',
      '<div class="osci-model-tabs" role="tablist">',
      task().runs.map(function (r) {
        return '<button class="osci-model-tab' + (r.modelId === run().modelId ? " is-active" : "") + '" type="button" data-model="' + esc(r.modelId) + '">' +
               esc(r.modelName) + ' <em>score ' + fmtScore(r.score) + ' · ' + stepsLabel(r) + '</em></button>';
      }).join(""),
      '</div>',
      '<div data-viewer class="osci-viewer"><p class="osci-loading">Loading run…</p></div>'
    ].join("");
    root.querySelectorAll("[data-task]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.taskId = b.dataset.task; state.modelId = null; state.step = 0; location.hash = "task-" + state.taskId;
        renderShell(); loadRun(function () { renderViewer(); scrollToTask(true); });
      });
    });
    root.querySelectorAll("[data-model]").forEach(function (b) {
      b.addEventListener("click", function () { state.modelId = b.dataset.model; state.step = 0; renderShell(); loadRun(renderViewer); });
    });
  }
  // the viewer sits below the task list: bring the chosen task's heading to the top of the window
  function scrollToTask(smooth) {
    var head = root.querySelector(".osci-task-head");
    if (head && head.scrollIntoView) head.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }

  // Builds the viewer once per run; stepping only updates the frame, texts and slider (showStep), so the slider
  // is not replaced while it is being dragged.
  function renderViewer() {
    var rd = runData(); var host = root.querySelector("[data-viewer]");
    if (!rd) return;
    var items = (rd.items || []).map(function (it) {
      var w = typeof it.weight === "number" ? it.weight : 0;
      return '<li><span class="osci-item-score' + (it.score >= 0.999 ? " is-pass" : (it.score > 0 ? " is-partial" : " is-fail")) + '">' + fmtScore(it.score) + '</span>' +
             '<strong>' + esc(it.label) + '</strong>' + (w ? ' <em>weight ' + w + '</em>' : ' <em>not scored</em>') + '<small>' + esc(it.note) + '</small></li>';
    }).join("");
    host.innerHTML = [
      '<div class="osci-stage">',
      '  <img data-frame src="" alt="">',
      '  <div class="osci-stage-controls">',
      '    <button type="button" data-nav="-1" class="button is-small is-rounded">← Prev</button>',
      '    <input type="range" min="0" max="' + (rd.steps.length - 1) + '" value="0" data-slider aria-label="Step">',
      '    <span class="osci-step-count" data-count></span>',
      '    <button type="button" data-nav="1" class="button is-small is-rounded">Next →</button>',
      '  </div>',
      '</div>',
      '<div class="osci-side">',
      '  <p class="osci-meta"><strong>' + esc(rd.modelName) + '</strong> · score ' + fmtScore(rd.score) + ' · ' + stepsLabel(rd) + ' replayed' +
        (rd.totalSteps && rd.totalSteps !== rd.stepCount ? ' (harness log: ' + rd.totalSteps + ')' : '') +
        (rd.status ? ' · ' + esc(STATUS[rd.status] || rd.status) : "") + (rd.costUsd ? ' · $' + rd.costUsd.toFixed(2) : "") + '</p>',
      '  <h4>What the model said</h4><p class="osci-prose" data-prose></p>',
      '  <div data-action-wrap><h4>What it executed</h4><pre class="osci-action" data-action></pre></div>',
      '  <h4>Grading</h4><ul class="osci-items">' + items + '</ul>',
      '</div>'
    ].join("");
    host.querySelectorAll("[data-nav]").forEach(function (b) {
      b.addEventListener("click", function () { go(state.step + Number(b.dataset.nav)); });
    });
    host.querySelector("[data-slider]").addEventListener("input", function (e) { go(Number(e.target.value)); });
    showStep();
  }
  function showStep() {
    var rd = runData(); var host = root.querySelector("[data-viewer]");
    if (!rd || !host.querySelector("[data-frame]")) return;
    var st = rd.steps[Math.min(state.step, rd.steps.length - 1)];
    var action = st.action && String(st.action).trim() ? String(st.action) : "";
    var img = host.querySelector("[data-frame]");
    img.src = ROOT + (st.image || "");
    img.alt = "Step " + st.step + " screenshot";
    var slider = host.querySelector("[data-slider]");
    if (Number(slider.value) !== state.step) slider.value = state.step;
    host.querySelector("[data-count]").textContent = "Step " + st.step + " / " + rd.stepCount;
    host.querySelector("[data-prose]").innerHTML = esc(st.reasoning) ||
      (action && action !== "DONE" ? "<i>(code only)</i>" : "<i>(no narration at this step)</i>");
    host.querySelector("[data-action]").textContent = action;
    host.querySelector("[data-action-wrap]").hidden = !action;
  }
  function go(n) {
    var rd = runData(); if (!rd) return;
    state.step = Math.max(0, Math.min(rd.steps.length - 1, n));
    showStep();
  }
  document.addEventListener("keydown", function (e) {
    // leave arrows to form fields (the slider steps by itself) and to browser shortcuts such as Alt+Left
    var t = e.target;
    if (e.altKey || e.ctrlKey || e.metaKey || (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable))) return;
    if (e.key === "ArrowLeft") go(state.step - 1);
    if (e.key === "ArrowRight") go(state.step + 1);
  });
  var m = /task-([A-Za-z0-9_-]+)/.exec(location.hash || "");
  state.taskId = m ? m[1] : data.tasks[0].id;
  renderShell();
  // scroll once the run is shown, so the page is long enough to bring the heading to the top
  loadRun(function () { renderViewer(); if (m) scrollToTask(false); });
})();
