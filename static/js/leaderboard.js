/* OSWorld-Science leaderboard. Same panel and table markup as the original leaderboard component; data comes
   inline from window.OSCI.leaderboard (static/js/osciData.js) so the page also works from a local file.
   One row per model and task set; the set switch selects the scope. Missing usage shows "--". */
(function () {
  var state = { data: null, datasetScope: "all", sortKey: "partialScore", sortDirection: "desc" };

  var SORT_OPTIONS = [
    { key: "binaryAccuracy", label: "Binary" },
    { key: "partialScore", label: "Partial" },
    { key: "costPerTaskUsd", label: "Cost / task" },
    { key: "outputTokensPerTask", label: "Tokens / task" }
  ];

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isNum(value) { return typeof value === "number" && !Number.isNaN(value); }
  function formatPercent(value) { return isNum(value) ? value.toFixed(1) + "%" : "--"; }
  function formatCost(value) { return isNum(value) ? "$" + value.toFixed(2) : "--"; }
  function formatTokens(value) {
    if (!isNum(value)) return "--";
    return value >= 1000 ? (value / 1000).toFixed(1) + "K" : String(Math.round(value));
  }
  function getDefaultDirection(key) {
    return key === "costPerTaskUsd" || key === "outputTokensPerTask" ? "asc" : "desc";
  }
  function compareValues(a, b, key, direction) {
    var dir = direction === "asc" ? 1 : -1;
    var av = a[key], bv = b[key];
    if (key === "model") return String(av || "").localeCompare(String(bv || "")) * dir;
    var aMissing = !isNum(av), bMissing = !isNum(bv);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;          // rows without a value always sort last
    if (bMissing) return -1;
    return av < bv ? -dir : (av > bv ? dir : 0);
  }
  function tieBreakRows(a, b) {
    return compareValues(a, b, "partialScore", "desc") || compareValues(a, b, "binaryAccuracy", "desc") ||
      (a.overallRank || 99) - (b.overallRank || 99);
  }
  function scopes() { return (state.data && state.data.scopes) || []; }
  function currentScope() {
    return scopes().filter(function (s) { return s.key === state.datasetScope; })[0] || scopes()[0] || { key: "all", label: "All", taskCount: "" };
  }
  function filteredResults() {
    return ((state.data && state.data.results) || []).filter(function (row) {
      return row.datasetScope === state.datasetScope;
    }).sort(function (a, b) {
      return compareValues(a, b, state.sortKey, state.sortDirection) || tieBreakRows(a, b);
    });
  }

  function renderControls() {
    return [
      '<div class="leaderboard-controls">',
      '  <span class="leaderboard-control-label">Task set</span>',
      '  <div class="leaderboard-set-switch" role="group" aria-label="Task set">',
      scopes().map(function (s) {
        var active = state.datasetScope === s.key;
        return '<button class="leaderboard-set-option' + (active ? " is-active" : "") + '" type="button" data-dataset-scope="' +
          escapeHtml(s.key) + '" aria-pressed="' + (active ? "true" : "false") + '" title="' + escapeHtml(s.fullLabel + ", " + s.taskCount + " tasks") + '">' +
          escapeHtml(s.label) + ' <small>' + escapeHtml(s.taskCount) + '</small></button>';
      }).join(""),
      '  </div>',
      '</div>'
    ].join("");
  }

  function renderListHeader() {
    function sortButton(option) {
      var active = state.sortKey === option.key;
      var direction = active ? (state.sortDirection === "asc" ? " ↑" : " ↓") : "";
      return '<button class="leaderboard-header-sort' + (active ? " is-active" : "") + '" type="button" data-sort-key="' + option.key +
        '" aria-pressed="' + (active ? "true" : "false") + '">' + escapeHtml(option.label) + direction + '</button>';
    }
    return [
      '<thead><tr>',
      '<th>Rank</th><th>Model</th><th>Setting</th>',
      SORT_OPTIONS.map(function (o) { return '<th>' + sortButton(o) + '</th>'; }).join(""),
      '</tr></thead>'
    ].join("");
  }

  function renderRows(rows) {
    if (!rows.length) {
      return '<tbody><tr><td class="leaderboard-empty-row" colspan="7">No results for this task set.</td></tr></tbody>';
    }
    return '<tbody>' + rows.map(function (row, index) {
      var harness = row.modelId === "kimik3" ? "kimi-harness" : "PromptAgent";
      function cell(key, text) {
        return '<td class="' + (state.sortKey === key ? "is-active-metric" : "") + '">' + text + '</td>';
      }
      return [
        '<tr' + (index === 0 ? ' class="first-rank-row"' : "") + '>',
        '<td><p>' + (index + 1) + '</p></td>',
        '<td style="word-break:break-word;">',
        '  <span class="leaderboard-model-cell"><img class="leaderboard-model-logo" src="' + escapeHtml(row.logo) + '" alt="" aria-hidden="true"><strong>' + escapeHtml(row.model) + '</strong></span>',
        '  <p class="institution">' + escapeHtml(row.company) + '</p>',
        '</td>',
        '<td class="leaderboard-approach-cell"><div class="leaderboard-approach-content"><div class="leaderboard-approach-copy">',
        '  Medium effort + <span style="white-space:nowrap">' + escapeHtml(harness) + '</span></div>',
        '</div></td>',
        cell("binaryAccuracy", formatPercent(row.binaryAccuracy)),
        cell("partialScore", formatPercent(row.partialScore)),
        cell("costPerTaskUsd", formatCost(row.costPerTaskUsd)),
        cell("outputTokensPerTask", formatTokens(row.outputTokensPerTask)),
        '</tr>'
      ].join("");
    }).join("") + '</tbody>';
  }

  function render(root) {
    var rows = filteredResults();
    var scope = currentScope();
    var statNote = state.datasetScope === "stat"
      ? " For Statistics the workbook records each model's total cost; output tokens, and the cost of Claude Fable 5.1 and GPT-6 Astra, come from the trajectory records."
      : "";
    root.innerHTML = [
      '<div class="leaderboard-panel">',
      renderControls(),
      '<div class="leaderboard-table-wrap table-container" aria-label="Leaderboard results">',
      '<table class="table is-hoverable is-striped performanceTable leaderboard-table">',
      renderListHeader(),
      renderRows(rows),
      '</table>',
      '</div>',
      '<div class="leaderboard-notes" aria-label="Leaderboard notes">',
      '  <p><sup>1</sup> ' + escapeHtml(scope.fullLabel || scope.label) + ': ' + escapeHtml(scope.taskCount) +
        ' tasks, one run per task and model at the default reasoning effort. Partial = mean task score with partial credit; Binary = share of tasks scored 1. Runs that end without the graded deliverable (VOID) count as 0.</p>',
      '  <p><sup>2</sup> Cost and output tokens (thinking included) are averaged over the tasks with recorded usage; "usage on n" gives that count when it is smaller than the set, and "--" marks a model without recorded usage for the set. Cost and output tokens come from the results workbook (recorded cost, or tokens at list prices) and, where it has no usage, from the released trajectory records; Kimi K3\'s Bio cost is its reported total, counted as output tokens.' + escapeHtml(statNote) + '</p>',
      '</div>',
      '<p class="leaderboard-footnote">Last update time: ' + escapeHtml(state.data.updatedAt) + '</p>',
      '</div>'
    ].join("");

    root.querySelectorAll("[data-dataset-scope]").forEach(function (button) {
      button.addEventListener("click", function () { state.datasetScope = button.getAttribute("data-dataset-scope"); render(root); });
    });
    root.querySelectorAll("[data-sort-key]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-sort-key");
        if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDirection = getDefaultDirection(key); }
        render(root);
      });
    });
  }

  function init() {
    var root = document.getElementById("leaderboard-root");
    if (!root) return;
    var data = window.OSCI && window.OSCI.leaderboard;
    if (!data) {
      root.innerHTML = '<div class="leaderboard-error">Could not load leaderboard data: static/js/osciData.js is missing.</div>';
      return;
    }
    state.data = data;
    state.datasetScope = data.defaultDatasetScope || state.datasetScope;
    state.sortKey = data.defaultMetric || state.sortKey;
    state.sortDirection = getDefaultDirection(state.sortKey);
    render(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
