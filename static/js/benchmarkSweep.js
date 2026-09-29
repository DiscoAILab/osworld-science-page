/* OSWorld-Science interactive sweep: model score against output tokens or cost per task.
   Keeps the markup and CSS classes of the original sweep component (chart, tooltip, crosshair, axis value
   labels, model toggles, sortable table). Data: window.OSCI.sweep from static/js/osciData.js.
   One point per model and task set. A point with no recorded usage for the current X metric is left off the
   chart and shows "--" in the table. Every .benchmark-sweep on the page is initialised independently and reads
   its starting X metric, Y metric and task set from the buttons marked aria-pressed="true". */
(function () {
  "use strict";

  var SWEEP = (window.OSCI && window.OSCI.sweep) || { models: {}, points: [], scopes: [] };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var roots = document.querySelectorAll(".benchmark-sweep");
  Array.prototype.forEach.call(roots, initBenchmarkSweep);

  function initBenchmarkSweep(root) {
    var MODEL_META = SWEEP.models;
    var MODEL_KEYS = Object.keys(MODEL_META).sort(function (a, b) {
      return (MODEL_META[a].rank || 99) - (MODEL_META[b].rank || 99);
    });
    var SCOPES = {};
    (SWEEP.scopes || []).forEach(function (scope) { SCOPES[scope.key] = scope; });
    var DATA = SWEEP.points || [];
    var RELEASE_VERSION = "v2026.09";

    var METRICS = {
      tokens: { label: "Output tokens / task", axis: "Output tokens per task", format: formatTokens,
                steps: [2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000] },
      cost: { label: "Cost / task", axis: "Cost per task (USD)", format: formatCost,
              steps: [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10] }
    };
    var Y_METRICS = {
      mean: { label: "Partial score" },
      binary: { label: "Binary score" }
    };

    var chart = root.querySelector("[data-benchmark-chart], #benchmarkSweepChart");
    var chartWrap = root.querySelector("[data-benchmark-chart-wrap], #benchmarkSweepChartWrap");
    var tooltip = root.querySelector("[data-benchmark-tooltip], #benchmarkSweepTooltip");
    var resultRows = root.querySelector("[data-benchmark-rows], #benchmarkSweepRows");
    var modelToggles = root.querySelector("[data-benchmark-model-toggles], #benchmarkModelToggles");
    var scoreHeader = root.querySelector("[data-benchmark-score-header], #benchmarkSweepScoreHeader");
    var otherHeader = root.querySelector("[data-benchmark-other-header], #benchmarkSweepOtherHeader");
    var xHeader = root.querySelector("[data-benchmark-x-header], #benchmarkSweepXHeader");
    var scopeButtons = root.querySelectorAll("[data-benchmark-scope]");
    if (!chart || !chartWrap || !tooltip) return;
    var embedded = root.classList.contains("benchmark-sweep-embed") || root.classList.contains("is-findings-sweep");

    function pressed(selector, attr, fallback) {
      var button = root.querySelector(selector + '[aria-pressed="true"]');
      return button ? button.getAttribute(attr) : fallback;
    }

    var state = {
      metric: pressed("[data-benchmark-x-metric]", "data-benchmark-x-metric", "tokens"),
      yMetric: pressed("[data-benchmark-y-metric]", "data-benchmark-y-metric", "mean"),
      datasetScope: pressed("[data-benchmark-scope]", "data-benchmark-scope", "all"),
      visibleModels: new Set(MODEL_KEYS),
      selectedId: null,
      pinnedId: null,
      sortKey: "score",
      sortDir: "desc"
    };
    var view = createView();
    var pinnedDismissTimer = null;

    /* ---------- formatting ---------- */
    function formatTokens(value) {
      if (value === 0) return "0";
      if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
      if (value >= 1000) {
        return Number(value / 1000).toLocaleString("en-US", { maximumFractionDigits: value >= 100000 ? 0 : 1 }) + "K";
      }
      return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    function formatCost(value) {
      var number = Number(value);
      var cents = Math.abs(number % 1) > 0.0001;
      return "$" + number.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
    }
    function formatPercent(value) {
      return (value * 100).toFixed(1) + "%";
    }
    function clamp(min, value, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }
    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    /* ---------- data access ---------- */
    function scoreOf(point) { return state.yMetric === "binary" ? point.binary : point.score; }
    function otherOf(point) { return state.yMetric === "binary" ? point.score : point.binary; }
    function xOf(point) { return point.values ? point.values[state.metric] : null; }
    function hasX(point) { var v = xOf(point); return v !== null && v !== undefined && Number.isFinite(Number(v)); }
    function inScope(point) { return point.datasetScope === state.datasetScope; }
    function scopePoints() { return DATA.filter(inScope); }
    function tablePoints() {
      return scopePoints().filter(function (p) { return state.visibleModels.has(p.model); });
    }
    function chartPoints() { return tablePoints().filter(hasX); }
    function findPoint(id) { return DATA.find(function (p) { return p.id === id; }) || null; }
    function scopeLabel() {
      var scope = SCOPES[state.datasetScope];
      return scope ? (scope.key === "all" ? "All domains" : scope.fullLabel || scope.label) + " (" + scope.taskCount + " tasks)" : state.datasetScope;
    }

    /* ---------- geometry ---------- */
    function createView() {
      var measured = Math.floor(chartWrap && (chartWrap.clientWidth || chartWrap.getBoundingClientRect().width) || 860);
      var compact = measured < 560;
      var width = compact ? Math.max(300, measured) : Math.max(560, measured || 800);
      var height = compact ? 380 : 460;
      if (embedded) height = compact ? 380 : 470;
      var left = compact ? 50 : 70;
      var right = compact ? 14 : 30;
      var top = 30;
      var bottom = compact ? 62 : 70;
      return { width: width, height: height, compact: compact,
               plot: { x: left, y: top, width: Math.max(200, width - left - right), height: height - top - bottom } };
    }
    function syncChartView() {
      view = createView();
      chart.setAttribute("viewBox", "0 0 " + view.width + " " + view.height);
      chart.style.height = view.height + "px";
    }
    function niceScale(max, steps, maxTicks) {
      if (!(max > 0)) return { max: steps[0] * 4, step: steps[0] };
      var target = max * 1.08;
      for (var i = 0; i < steps.length; i += 1) {
        if (target / steps[i] <= maxTicks) return { max: Math.ceil(target / steps[i]) * steps[i], step: steps[i] };
      }
      var s = steps[steps.length - 1];
      return { max: Math.ceil(target / s) * s, step: s };
    }
    function xScaleInfo() {
      var values = scopePoints().filter(hasX).map(function (p) { return Number(xOf(p)); });
      var info = niceScale(values.length ? Math.max.apply(null, values) : 0, METRICS[state.metric].steps, view.compact ? 4 : 5);
      var ticks = [];
      for (var t = 0; t <= info.max + 1e-9; t += info.step) ticks.push(Number(t.toFixed(6)));
      return { domain: [0, info.max], ticks: ticks };
    }
    function yScaleInfo() {
      var values = scopePoints().map(scoreOf);
      var max = values.length ? Math.max.apply(null, values) : 0;
      var step = max <= 0.45 ? 0.1 : 0.2;
      var top = Math.min(1, Math.max(step * 2, Math.ceil((max + 0.03) / step - 1e-9) * step));
      var ticks = [];
      for (var t = 0; t <= top + 1e-9; t += step) ticks.push(Number(t.toFixed(4)));
      return { domain: [0, top], ticks: ticks };
    }
    var xInfo, yInfo;
    function xScale(value) {
      return view.plot.x + (value - xInfo.domain[0]) / (xInfo.domain[1] - xInfo.domain[0]) * view.plot.width;
    }
    function yScale(value) {
      return view.plot.y + view.plot.height - (value - yInfo.domain[0]) / (yInfo.domain[1] - yInfo.domain[0]) * view.plot.height;
    }

    /* ---------- svg helpers ---------- */
    function el(tag, attrs, children) {
      var node = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs || {}).forEach(function (key) {
        var value = attrs[key];
        if (value !== undefined && value !== null && value !== "") node.setAttribute(key, value);
      });
      (children || []).forEach(function (child) { node.appendChild(child); });
      return node;
    }
    function txt(value) { return document.createTextNode(value); }
    function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    /* ---------- chart ---------- */
    function renderChart() {
      syncChartView();
      clearNode(chart);
      xInfo = xScaleInfo();
      yInfo = yScaleInfo();
      var plot = view.plot;
      var metric = METRICS[state.metric];

      xInfo.ticks.forEach(function (tick) {
        var x = xScale(tick);
        chart.appendChild(el("line", { class: "grid-line", x1: x, x2: x, y1: plot.y, y2: plot.y + plot.height }));
        chart.appendChild(el("text", { class: "tick-text", x: x, y: plot.y + plot.height + 22, "text-anchor": "middle" }, [txt(metric.format(tick))]));
      });
      yInfo.ticks.forEach(function (tick) {
        var y = yScale(tick);
        chart.appendChild(el("line", { class: "grid-line", x1: plot.x, x2: plot.x + plot.width, y1: y, y2: y }));
        chart.appendChild(el("text", { class: "tick-text", x: plot.x - 9, y: y + 4, "text-anchor": "end" }, [txt(Math.round(tick * 100) + "%")]));
      });
      chart.appendChild(el("line", { class: "axis-line", x1: plot.x, x2: plot.x + plot.width, y1: plot.y + plot.height, y2: plot.y + plot.height }));
      chart.appendChild(el("line", { class: "axis-line", x1: plot.x, x2: plot.x, y1: plot.y, y2: plot.y + plot.height }));
      chart.appendChild(el("text", { class: "axis-label", x: plot.x + plot.width / 2, y: plot.y + plot.height + 50, "text-anchor": "middle" }, [txt(metric.axis)]));
      var yMid = plot.y + plot.height / 2;
      chart.appendChild(el("text", { class: "axis-label", x: 14, y: yMid, transform: "rotate(-90 14 " + yMid + ")", "text-anchor": "middle" }, [txt(Y_METRICS[state.yMetric].label)]));

      var missing = tablePoints().filter(function (p) { return !hasX(p); });
      var reserved = [];
      if (missing.length) {
        var note = missing.length === tablePoints().length ? "No " + metric.label.toLowerCase() + " recorded for this set"
          : missing.length + " model" + (missing.length > 1 ? "s" : "") + " without recorded usage not plotted";
        chart.appendChild(el("text", { class: "tick-text chart-note", x: plot.x + plot.width, y: plot.y - 12, "text-anchor": "end" }, [txt(note)]));
        reserved.push({ x0: plot.x + plot.width - note.length * 6.8, y0: plot.y - 26, x1: plot.x + plot.width + 30, y1: plot.y - 6 });
      }

      chart.appendChild(el("line", { id: "benchmarkCrosshairX", class: "crosshair crosshair-vertical", x1: 0, x2: 0, y1: plot.y, y2: plot.y + plot.height, opacity: 0 }));
      chart.appendChild(el("line", { id: "benchmarkCrosshairY", class: "crosshair crosshair-horizontal", x1: plot.x, x2: plot.x + plot.width, y1: 0, y2: 0, opacity: 0 }));
      chart.appendChild(el("g", { class: "axis-value-labels", "data-axis-value-labels": "1", opacity: 0 }, [
        el("g", { class: "axis-value-label", "data-axis-x": "1" }, [el("rect", { rx: 3, ry: 3 }), el("text", { "text-anchor": "middle" })]),
        el("g", { class: "axis-value-label", "data-axis-y": "1" }, [el("rect", { rx: 3, ry: 3 }), el("text", { "text-anchor": "middle" })])
      ]));

      var labelLayer = el("g", { class: "model-label-layer" });
      var pointLayer = el("g", { class: "point-layer" });
      chart.appendChild(labelLayer);
      chart.appendChild(pointLayer);

      var points = chartPoints().slice().sort(function (a, b) { return scoreOf(a) - scoreOf(b); });
      points.forEach(function (point, index) {
        var marker = el("circle", {
          class: "point" + (point.id === state.selectedId ? " is-active" : "") + (point.id === state.pinnedId ? " is-pinned" : ""),
          cx: xScale(Number(xOf(point))), cy: yScale(scoreOf(point)), r: view.compact ? 5 : 6,
          fill: MODEL_META[point.model].color, "data-id": point.id,
          style: "animation: fade-up 420ms ease " + Math.min(index * 30, 260) + "ms both;"
        });
        marker.addEventListener("mouseenter", function () { showTooltip(point); });
        marker.addEventListener("mousemove", function () { showTooltip(point); });
        marker.addEventListener("mouseleave", hideTooltip);
        marker.addEventListener("click", function () {
          cancelPinnedDismiss();
          state.selectedId = point.id;
          state.pinnedId = point.id;
          renderAll();
        });
        pointLayer.appendChild(marker);
      });

      renderModelLabels(labelLayer, points, reserved);
      chart.onmouseleave = hideTooltip;
      var pinned = pinnedPoint();
      if (pinned) showTooltip(pinned, { pinned: true }); else hideTooltip({ force: true });
    }

    /* ---------- direct labels ----------
       Each model's name is placed beside its point, or moved away and joined to it by a thin leader line.
       Hard rules: a label stays inside the plot, never overlaps another label or any point marker (and keeps clear
       of other markers), no two leader lines cross, and no leader line runs through another label or marker. A
       label nearer to another point than to its own always gets a leader. Among placements that follow these rules,
       the one that leaves out the fewest labels wins, then the one with the shortest distances.
       Candidates: positions on rays around the point (every 10 degrees, up to 160-195 px away) and on a row grid
       beside, above and below it. Search: most-constrained label first with forward checking, then local repair,
       then branch and bound on the total distance. A first placement is drawn at once; if it leaves labels out,
       randomized restarts continue in short background slices and redraw the labels when they do better. Results
       are cached per chart configuration. A label that cannot be placed is left out; the tooltip, the table and
       the model list still identify the point. */
    var labelCache = {};
    var labelGeneration = 0;
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function labelProblem(points, reserved, fontOverride) {
      var plot = view.plot;
      var fontSize = fontOverride || (view.compact ? 11 : (embedded ? 12 : 13));
      var h = fontSize + 4;
      var R = view.compact ? 5 : 6;
      var LEADER_MIN = R + 5;           /* a label box nearer than this to its point needs no leader */
      var bounds = { x0: plot.x + 2, y0: 4, x1: plot.x + plot.width + (view.compact ? 8 : 24), y1: plot.y + plot.height - 2 };
      var centres = points.map(function (p) { return { id: p.id, x: xScale(Number(xOf(p))), y: yScale(scoreOf(p)) }; });
      var widthCache = {};
      function measureText(name, size) {
        var key = size + "|" + name;
        if (widthCache[key]) return widthCache[key];
        var probe = el("text", { class: "model-label-text", x: -999, y: -999, style: "font-size:" + size + "px;font-weight:600" }, [txt(name)]);
        chart.appendChild(probe);
        var width = typeof probe.getComputedTextLength === "function" ? probe.getComputedTextLength() : 0;
        chart.removeChild(probe);
        widthCache[key] = width > 0 ? width : name.length * size * 0.6;
        return widthCache[key];
      }
      function distToBox(x, y, box) {
        var dx = Math.max(box.x0 - x, 0, x - box.x1), dy = Math.max(box.y0 - y, 0, y - box.y1);
        return Math.sqrt(dx * dx + dy * dy);
      }
      function boxesOverlap(a, b, px, py) {
        return a.x0 < b.x1 + px && a.x1 > b.x0 - px && a.y0 < b.y1 + py && a.y1 > b.y0 - py;
      }
      function segPointDist(s, x, y) {
        var vx = s.x2 - s.x1, vy = s.y2 - s.y1, len2 = vx * vx + vy * vy;
        var t = len2 ? Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / len2)) : 0;
        var qx = s.x1 + t * vx - x, qy = s.y1 + t * vy - y;
        return Math.sqrt(qx * qx + qy * qy);
      }
      function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
      function segsCross(a, b) {
        var d1 = orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1), d2 = orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
        var d3 = orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1), d4 = orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
        return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
      }
      function segHitsBox(s, box, pad) {
        var b = { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad };
        var inside = function (x, y) { return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; };
        if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
        var edges = [[b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0]];
        return edges.some(function (e) { return segsCross(s, { x1: e[0], y1: e[1], x2: e[2], y2: e[3] }); });
      }

      var labels = points.map(function (point, index) {
        var meta = MODEL_META[point.model];
        var c = centres[index];
        var w = measureText(meta.name, fontSize) + 6;
        var list = [], seen = {};
        function tryBox(x0, y0) {
          var box = { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h };
          if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) return;
          var key = Math.round(x0 / 2) + "," + Math.round(y0 / 2);
          if (seen[key]) return;
          seen[key] = true;
          var own = distToBox(c.x, c.y, box);
          var crowd = 0;
          for (var m = 0; m < centres.length; m += 1) {
            if (m === index) { if (own < R + 1) return; continue; }
            var dm = distToBox(centres[m].x, centres[m].y, box);
            if (dm < R + 4) return;                        /* keep clear of other markers */
            if (dm < R + 12) crowd += 1;                   /* ... and preferably well clear */
          }
          for (var r = 0; r < (reserved || []).length; r += 1) if (boxesOverlap(box, reserved[r], 2, 2)) return;
          var leader = null;
          if (own > LEADER_MIN) {
            var qx = Math.max(box.x0, Math.min(c.x, box.x1)), qy = Math.max(box.y0, Math.min(c.y, box.y1));
            var len = Math.sqrt((qx - c.x) * (qx - c.x) + (qy - c.y) * (qy - c.y));
            leader = { x1: c.x + (qx - c.x) / len * (R + 1.5), y1: c.y + (qy - c.y) / len * (R + 1.5), x2: qx, y2: qy };
            if (!view.compact) {         /* desktop: a long, shallow leader running along an axis line is lost in it */
              var ldx = Math.abs(leader.x2 - leader.x1), ldy = Math.abs(leader.y2 - leader.y1);
              if (ldx > 12 && ldy < 0.35 * ldx && Math.min(leader.y1, leader.y2) > plot.y + plot.height - 8) return;
              if (ldy > 12 && ldx < 0.35 * ldy && Math.max(leader.x1, leader.x2) < plot.x + 8) return;
            }
            for (var k = 0; k < centres.length; k += 1) {
              if (k === index) continue;
              var sep = Math.sqrt((centres[k].x - c.x) * (centres[k].x - c.x) + (centres[k].y - c.y) * (centres[k].y - c.y));
              if (sep > R && segPointDist(leader, centres[k].x, centres[k].y) < R + 2) return;
            }
          }
          /* desktop: a near tie also counts, a label about as close to another marker as to its own needs a leader */
          var ambiguous = centres.some(function (o, m) { return m !== index && distToBox(o.x, o.y, box) < own + (view.compact ? 0 : 3); });
          if (ambiguous && !leader) return;
          var bx = (box.x0 + box.x1) / 2 - c.x, by = (box.y0 + box.y1) / 2 - c.y;
          var cost = own + (leader ? 6 : 0) + (ambiguous ? 18 : 0) + 10 * crowd +
                     3 * Math.abs(by) / Math.max(1, Math.sqrt(bx * bx + by * by)) + (bx < 0 ? 1.5 : 0);
          var bb = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };   /* box plus leader, for a quick rejection */
          if (leader) {
            bb.x0 = Math.min(bb.x0, leader.x1); bb.x1 = Math.max(bb.x1, leader.x1);
            bb.y0 = Math.min(bb.y0, leader.y1); bb.y1 = Math.max(bb.y1, leader.y1);
          }
          list.push({ box: box, leader: leader, cost: cost, bb: bb });
        }
        var gaps = view.compact ? [3, 8, 15, 24, 34, 46, 60, 76, 94, 114, 136, 160]
                                : [3, 8, 15, 24, 35, 48, 64, 82, 104, 130, 160, 195];
        for (var a = 0; a < 36; a += 1) {
          var ang = a * 10 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
          for (var g = 0; g < gaps.length; g += 1) {
            var ax = c.x + (R + gaps[g]) * ca, ay = c.y + (R + gaps[g]) * sa;
            tryBox(ax - (1 - ca) / 2 * w, ay - (1 - sa) / 2 * h);
          }
        }
        var rows = view.compact ? 11 : 13;
        var shifts = view.compact ? [R + 3, R + 10, 18, 28, 40, 54, 70, 88, 108] : [R + 3, R + 10, 18, 28, 40, 54, 70, 88, 110, 136];
        for (var row = -rows; row <= rows; row += 1) {
          /* rows clamped to the plot: a point on the 0% line gets a row flush with the bottom edge */
          var y0 = Math.max(bounds.y0, Math.min(bounds.y1 - h, c.y - h / 2 + row * (h + 1)));
          for (var sh = 0; sh < shifts.length; sh += 1) { tryBox(c.x + shifts[sh], y0); tryBox(c.x - shifts[sh] - w, y0); }
          [-0.5, -0.25, 0, 0.25].forEach(function (f) { tryBox(c.x - w / 2 + f * w, y0); });
        }
        list.sort(function (p, q) { return p.cost - q.cost; });
        return { point: point, name: meta.name, cands: list.slice(0, 160) };
      });

      function compatible(a, b) {
        if (a.bb.x1 + 4 < b.bb.x0 || b.bb.x1 + 4 < a.bb.x0 || a.bb.y1 + 2 < b.bb.y0 || b.bb.y1 + 2 < a.bb.y0) return true;
        if (boxesOverlap(a.box, b.box, 3, 1)) return false;
        if (a.leader && b.leader && segsCross(a.leader, b.leader)) return false;
        if (a.leader && segHitsBox(a.leader, b.box, 1)) return false;
        if (b.leader && segHitsBox(b.leader, a.box, 1)) return false;
        return true;
      }
      var n = labels.length, mats = {};  /* per label pair: 0 = not yet known, 1 = compatible, 2 = conflict */
      function compat(i, ci, j, cj) {
        if (i > j) { var t = i; i = j; j = t; t = ci; ci = cj; cj = t; }
        var m = mats[i * n + j];
        if (!m) m = mats[i * n + j] = new Uint8Array(labels[i].cands.length * labels[j].cands.length);
        var idx = ci * labels[j].cands.length + cj, v = m[idx];
        if (v === 0) v = m[idx] = compatible(labels[i].cands[ci], labels[j].cands[cj]) ? 1 : 2;
        return v === 1;
      }
      return { labels: labels, n: n, compat: compat, fontSize: fontSize };
    }

    var DROP = 1000;                    /* cost of leaving a label out */
    function dropsOf(assign) { return assign.filter(function (ci) { return ci < 0; }).length; }
    function costOf(P, assign) {
      return assign.reduce(function (sum, ci, i) { return sum + (ci >= 0 ? P.labels[i].cands[ci].cost : DROP); }, 0);
    }

    /* One solve within `budget` ms. seed 0 = plain candidate order; other seeds shuffle near-equal candidates and
       break ties between equally constrained labels at random (a randomized restart). */
    function solveLabels(P, budget, seed) {
      var n = P.n, labels = P.labels, compat = P.compat;
      var t0 = now(), deadline = t0 + budget * 0.7, steps = 0, timedOut = false;
      function tick() { if ((++steps & 31) === 0 && now() > deadline) timedOut = true; return timedOut; }
      var s = seed * 7919 + 17;
      function rand() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
      function filterDomains(domains, sel, ci) {
        var next = new Array(n);
        for (var j = 0; j < n; j += 1) {
          if (j === sel || domains[j] === null) { next[j] = null; continue; }
          var kept = [];
          for (var e = 0; e < domains[j].length; e += 1) if (compat(sel, ci, j, domains[j][e])) kept.push(domains[j][e]);
          next[j] = kept;
        }
        return next;
      }
      var tie = labels.map(function () { return seed ? rand() * 0.9 : 0; });
      function mostConstrained(domains, allowEmpty) {
        var sel = -1;
        for (var i = 0; i < n; i += 1) {
          if (domains[i] === null || (!allowEmpty && !domains[i].length)) continue;
          if (sel < 0 || domains[i].length + tie[i] < domains[sel].length + tie[sel]) sel = i;
        }
        return sel;
      }
      var full = labels.map(function (lab) {
        var idx = lab.cands.map(function (_, ci) { return ci; });
        if (!seed) return idx;
        var key = idx.map(function (ci) { return lab.cands[ci].cost + rand() * 30; });
        return idx.sort(function (p, q) { return key[p] - key[q]; });
      });
      var pick = labels.map(function () { return -1; });

      /* A: as many labels as possible */
      var bestA = { drops: Infinity, pick: null };
      (function searchA(drops, domains) {
        if (tick() && bestA.pick) return;
        var empties = 0;
        for (var i = 0; i < n; i += 1) if (domains[i] !== null && !domains[i].length) empties += 1;
        if (drops + empties >= bestA.drops) return;
        var sel = mostConstrained(domains, false);
        if (sel < 0) {
          var result = pick.slice();
          for (var q = 0; q < n; q += 1) if (domains[q] !== null) result[q] = -1;
          bestA = { drops: drops + empties, pick: result };
          return;
        }
        var dom = domains[sel];
        for (var d = 0; d < dom.length; d += 1) {
          pick[sel] = dom[d];
          searchA(drops, filterDomains(domains, sel, dom[d]));
          pick[sel] = -1;
          if (bestA.drops === 0 || (timedOut && bestA.pick)) return;
        }
        var without = domains.slice();
        without[sel] = null;
        searchA(drops + 1, without);
      })(0, full);
      var current = bestA.pick;

      /* B: local repair (cheapest candidate that fits the others; left-out labels are retried too) */
      function fits(i, ci, assign) {
        for (var j = 0; j < n; j += 1) if (j !== i && assign[j] >= 0 && !compat(i, ci, j, assign[j])) return false;
        return true;
      }
      for (var pass = 0, changed = true; changed && pass < 6; pass += 1) {
        changed = false;
        for (var i = 0; i < n; i += 1) {
          var here = current[i] >= 0 ? labels[i].cands[current[i]].cost : Infinity;
          for (var ci = 0; ci < labels[i].cands.length && labels[i].cands[ci].cost < here; ci += 1) {
            if (fits(i, ci, current)) { current[i] = ci; changed = true; break; }
          }
        }
      }

      /* C: branch and bound on the total cost, from that placement */
      var best = { cost: costOf(P, current), pick: current.slice() };
      deadline = Math.max(t0 + budget, now() + 10);
      timedOut = false;
      var ordered = labels.map(function (lab) { return lab.cands.map(function (_, ci) { return ci; }); });
      (function searchC(cost, domains) {
        if (tick()) return;
        var lb = cost;
        for (var i = 0; i < n; i += 1) {
          if (domains[i] !== null) lb += domains[i].length ? Math.min(labels[i].cands[domains[i][0]].cost, DROP) : DROP;
        }
        if (lb >= best.cost - 1e-6) return;
        var sel = mostConstrained(domains, true);
        if (sel < 0) { best = { cost: cost, pick: pick.slice() }; return; }
        var dom = domains[sel];
        var rest = lb - (dom.length ? Math.min(labels[sel].cands[dom[0]].cost, DROP) : DROP);
        for (var d = 0; d < dom.length; d += 1) {
          var cand = labels[sel].cands[dom[d]];
          if (rest + cand.cost >= best.cost || cand.cost >= DROP) break;
          pick[sel] = dom[d];
          searchC(cost + cand.cost, filterDomains(domains, sel, dom[d]));
          pick[sel] = -1;
          if (timedOut) return;
        }
        if (rest + DROP < best.cost) {
          var without = domains.slice();
          without[sel] = null;
          searchC(cost + DROP, without);
        }
      })(0, ordered);
      return best.pick;
    }

    function drawLabels(layer, P, placed, final) {
      clearNode(layer);
      var fontSize = P.fontSize;
      updateLabelNote(P, placed, final);
      /* leaders first, so the names are drawn over them (the point markers are drawn above both) */
      P.labels.forEach(function (lab) {
        var cand = placed[lab.point.id];
        if (!cand || !cand.leader) return;
        layer.appendChild(el("line", { class: "model-label-leader", "data-model": lab.point.model,
          x1: cand.leader.x1.toFixed(1), y1: cand.leader.y1.toFixed(1), x2: cand.leader.x2.toFixed(1), y2: cand.leader.y2.toFixed(1),
          stroke: "#9aa2af", "stroke-width": 1 }));
      });
      P.labels.forEach(function (lab) {
        var cand = placed[lab.point.id];
        if (!cand) return;
        var group = el("g", { class: "model-label", "data-model": lab.point.model });
        group.appendChild(el("text", { class: "model-label-text", x: (cand.box.x0 + 3).toFixed(1), y: ((cand.box.y0 + cand.box.y1) / 2 + fontSize * 0.36).toFixed(1),
                                       fill: "#20242c", "text-anchor": "start", style: "font-size:" + fontSize + "px;font-weight:600" }, [txt(lab.name)]));
        layer.appendChild(group);
      });
      layer.setAttribute("data-labels-placed", String(Object.keys(placed).length));
      layer.setAttribute("data-labels-total", String(P.labels.length));
      layer.setAttribute("data-labels-final", final ? "1" : "0");
    }

    /* Names that still could not be placed are listed under the chart, so no point is left unexplained. */
    function updateLabelNote(P, placed, final) {
      var note = chartWrap.querySelector(".benchmark-label-note");
      var missing = P.labels.filter(function (lab) { return !placed[lab.point.id]; }).map(function (lab) { return lab.name; });
      if (!missing.length || !final) { if (note) note.hidden = true; return; }
      if (!note) {
        note = document.createElement("p");
        note.className = "benchmark-label-note";
        chartWrap.appendChild(note);
      }
      note.textContent = "Not labelled (points too close together): " + missing.join(", ") + ". Hover a point to see its model.";
      note.hidden = false;
    }

    function renderModelLabels(layer, points, reserved) {
      var generation = ++labelGeneration;
      var key = [state.datasetScope, state.metric, state.yMetric, view.width, view.height,
                 points.map(function (p) { return p.id; }).join(",")].join("|");
      if (labelCache[key]) { drawLabels(layer, labelCache[key].P, labelCache[key].placed, true); return; }
      var budget = view.compact ? 110 : 80;
      var P = labelProblem(points, reserved);
      var assign = solveLabels(P, budget, 0);
      if (dropsOf(assign) && P.fontSize > 11) {   /* crowded desktop chart: 11 px names usually all fit */
        var Ps = labelProblem(points, reserved, 11);
        var small = solveLabels(Ps, budget, 0);
        if (dropsOf(small) <= dropsOf(assign)) { P = Ps; assign = small; }
      }
      function placedOf(assign) {
        var out = {};
        assign.forEach(function (ci, i) { if (ci >= 0) out[P.labels[i].point.id] = P.labels[i].cands[ci]; });
        return out;
      }
      if (!dropsOf(assign)) {
        labelCache[key] = { P: P, placed: placedOf(assign) };
        drawLabels(layer, P, labelCache[key].placed, true);
        return;
      }
      drawLabels(layer, P, placedOf(assign), false);
      var spent = 0, seed = 1;
      (function refine() {                /* randomized restarts in short slices, while this chart is shown */
        if (generation !== labelGeneration || !layer.isConnected) return;
        var t0 = now();
        var next = solveLabels(P, 40, seed);
        seed += 1;
        spent += now() - t0;
        var better = dropsOf(next) < dropsOf(assign) || (dropsOf(next) === dropsOf(assign) && costOf(P, next) < costOf(P, assign) - 1e-6);
        if (better) assign = next;
        var done = !dropsOf(assign) || spent > 3000;
        if (better || done) drawLabels(layer, P, placedOf(assign), done);
        if (done) { labelCache[key] = { P: P, placed: placedOf(assign) }; return; }
        window.setTimeout(refine, 0);
      })();
    }

    /* ---------- tooltip ---------- */
    function pinnedPoint() {
      if (!state.pinnedId) return null;
      var p = findPoint(state.pinnedId);
      return p && inScope(p) && state.visibleModels.has(p.model) && hasX(p) ? p : null;
    }
    function cancelPinnedDismiss() { window.clearTimeout(pinnedDismissTimer); pinnedDismissTimer = null; }
    function schedulePinnedDismiss() {
      if (!pinnedPoint() || pinnedDismissTimer) return;
      pinnedDismissTimer = window.setTimeout(function () {
        cancelPinnedDismiss();
        state.pinnedId = null;
        hideTooltip({ force: true });
        renderAll();
      }, 500);
    }
    function updateGuideLabels(point, x, y) {
      var plot = view.plot;
      var labels = chart.querySelector("[data-axis-value-labels]");
      if (!labels) return;
      var xLabel = METRICS[state.metric].format(Number(xOf(point)));
      var yLabel = formatPercent(scoreOf(point));
      var set = function (group, label, rx, ry, w) {
        group.querySelector("rect").setAttribute("x", rx);
        group.querySelector("rect").setAttribute("y", ry);
        group.querySelector("rect").setAttribute("width", w);
        group.querySelector("rect").setAttribute("height", 20);
        group.querySelector("text").setAttribute("x", rx + w / 2);
        group.querySelector("text").setAttribute("y", ry + 14);
        group.querySelector("text").textContent = label;
      };
      var xw = Math.max(38, xLabel.length * 6.6 + 14);
      var yw = Math.max(38, yLabel.length * 6.6 + 14);
      set(labels.querySelector("[data-axis-x]"), xLabel, clamp(plot.x + 2, x - xw / 2, plot.x + plot.width - xw - 2), plot.y + plot.height + 8, xw);
      set(labels.querySelector("[data-axis-y]"), yLabel, Math.max(2, plot.x - yw - 4), clamp(plot.y + 2, y - 10, plot.y + plot.height - 22), yw);
      labels.setAttribute("opacity", "1");
    }
    function showTooltip(point, options) {
      if (!hasX(point)) return;
      cancelPinnedDismiss();
      var pinned = Boolean(options && options.pinned) || point.id === state.pinnedId;
      var x = xScale(Number(xOf(point)));
      var y = yScale(scoreOf(point));
      var model = MODEL_META[point.model];
      var metric = METRICS[state.metric];
      var otherLabel = state.yMetric === "binary" ? Y_METRICS.mean.label : Y_METRICS.binary.label;
      tooltip.innerHTML = [
        '<div class="benchmark-tooltip-title"><span class="benchmark-swatch" style="color:' + model.color + '"></span>' + escapeHtml(model.name) + "</div>",
        "<div>Set: <strong>" + escapeHtml(scopeLabel()) + "</strong></div>",
        "<div>" + metric.label + ": <strong>" + metric.format(Number(xOf(point))) + "</strong></div>",
        "<div>" + Y_METRICS[state.yMetric].label + ": <strong>" + formatPercent(scoreOf(point)) + "</strong></div>",
        "<div>" + otherLabel + ": <strong>" + formatPercent(otherOf(point)) + "</strong></div>",
        "<div>Usage recorded on: <strong>" + point.usageTasks + " / " + point.taskCount + " tasks</strong></div>"
      ].join("");
      var bounds = chartWrap.getBoundingClientRect();
      var svgBounds = chart.getBoundingClientRect();
      var offX = svgBounds.left - bounds.left;
      var offY = svgBounds.top - bounds.top;
      var sx = offX + x / view.width * svgBounds.width;
      var sy = offY + y / view.height * svgBounds.height;
      tooltip.classList.toggle("is-pinned", pinned);
      tooltip.classList.add("is-visible");
      tooltip.style.left = "0px";
      tooltip.style.top = "0px";
      var pad = 12, tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
      var left = sx + 14 + tw + pad <= bounds.width ? sx + 14 : sx - 14 - tw;
      var top = sy - 12 - th >= pad ? sy - 12 - th : sy + 12;
      tooltip.style.left = clamp(pad, left, bounds.width - tw - pad) + "px";
      tooltip.style.top = clamp(pad, top, bounds.height - th - pad) + "px";
      var cx = chart.querySelector("#benchmarkCrosshairX");
      var cy = chart.querySelector("#benchmarkCrosshairY");
      if (cx) { cx.setAttribute("x1", x); cx.setAttribute("x2", x); cx.setAttribute("opacity", "1"); }
      if (cy) { cy.setAttribute("y1", y); cy.setAttribute("y2", y); cy.setAttribute("opacity", "1"); }
      updateGuideLabels(point, x, y);
    }
    function hideTooltip(options) {
      if (!(options && options.force) && pinnedPoint()) {
        showTooltip(pinnedPoint(), { pinned: true });
        schedulePinnedDismiss();
        return;
      }
      cancelPinnedDismiss();
      tooltip.classList.remove("is-visible", "is-pinned");
      ["#benchmarkCrosshairX", "#benchmarkCrosshairY", "[data-axis-value-labels]"].forEach(function (sel) {
        var node = chart.querySelector(sel);
        if (node) node.setAttribute("opacity", "0");
      });
    }

    /* ---------- legend / toggles ---------- */
    function renderModelToggles() {
      if (!modelToggles) return;
      clearNode(modelToggles);
      MODEL_KEYS.forEach(function (key) {
        var meta = MODEL_META[key];
        var button = document.createElement("button");
        button.className = "benchmark-model-toggle";
        button.type = "button";
        button.setAttribute("data-benchmark-model", key);
        button.setAttribute("aria-pressed", state.visibleModels.has(key) ? "true" : "false");
        button.setAttribute("aria-label", "Toggle " + meta.name);
        button.innerHTML = '<span class="benchmark-swatch" style="color:' + meta.color + '"></span><span class="benchmark-model-toggle-name">' + escapeHtml(meta.name) + "</span>";
        button.addEventListener("click", function () {
          if (state.visibleModels.has(key) && state.visibleModels.size > 1) state.visibleModels.delete(key);
          else state.visibleModels.add(key);
          if (state.pinnedId && !pinnedPoint()) state.pinnedId = null;
          hideTooltip({ force: true });
          renderAll();
        });
        modelToggles.appendChild(button);
      });
    }

    /* ---------- table ---------- */
    function renderTable() {
      if (!resultRows) return;
      var metric = METRICS[state.metric];
      if (scoreHeader) scoreHeader.textContent = Y_METRICS[state.yMetric].label;
      if (otherHeader) otherHeader.textContent = state.yMetric === "binary" ? Y_METRICS.mean.label : Y_METRICS.binary.label;
      if (xHeader) xHeader.textContent = metric.label;
      var rows = tablePoints().map(function (p) {
        return { point: p, model: MODEL_META[p.model].name, usage: hasX(p) ? p.usageTasks : -1,
                 version: RELEASE_VERSION, x: hasX(p) ? Number(xOf(p)) : null, score: scoreOf(p), other: otherOf(p) };
      });
      rows.sort(function (a, b) {
        var dir = state.sortDir === "asc" ? 1 : -1;
        var av = a[state.sortKey], bv = b[state.sortKey];
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir || (b.score - a.score);
        return String(av).localeCompare(String(bv)) * dir;
      });
      resultRows.innerHTML = rows.map(function (row) {
        var meta = MODEL_META[row.point.model];
        return [
          '<tr data-id="' + row.point.id + '" class="' + (row.point.id === state.selectedId ? "is-selected" : "") + '">',
          '<td><span class="benchmark-model-cell"><span class="benchmark-swatch" style="color:' + meta.color + '"></span>' +
            (meta.icon ? '<img class="benchmark-model-logo" src="static/images/logos/' + escapeHtml(meta.icon) + '.svg" alt="" aria-hidden="true">' : "") +
            escapeHtml(row.model) + "</span></td>",
          "<td>" + (row.x === null ? "--" : metric.format(row.x)) + "</td>",
          "<td>" + formatPercent(row.score) + "</td>",
          "<td>" + formatPercent(row.other) + "</td>",
          "</tr>"
        ].join("");
      }).join("");
      Array.prototype.forEach.call(resultRows.querySelectorAll("tr"), function (tr) {
        tr.addEventListener("mouseenter", function () { var p = findPoint(tr.dataset.id); if (p && hasX(p)) showTooltip(p); });
        tr.addEventListener("mouseleave", hideTooltip);
        tr.addEventListener("click", function () {
          var p = findPoint(tr.dataset.id);
          cancelPinnedDismiss();
          state.selectedId = tr.dataset.id;
          state.pinnedId = p && hasX(p) ? p.id : null;
          renderAll();
        });
      });
    }

    function renderAll() {
      Array.prototype.forEach.call(scopeButtons, function (b) {
        b.setAttribute("aria-pressed", b.dataset.benchmarkScope === state.datasetScope ? "true" : "false");
      });
      /* A set with no recorded value for a metric (Statistics has costs but no token counts) disables that
         metric's button and falls back to the other one. */
      function metricAvailable(metric) {
        return scopePoints().some(function (p) { var v = p.values ? p.values[metric] : null; return v !== null && v !== undefined; });
      }
      if (!metricAvailable(state.metric)) {
        var fallback = Object.keys(METRICS).filter(metricAvailable)[0];
        if (fallback) state.metric = fallback;
      }
      Array.prototype.forEach.call(root.querySelectorAll("[data-benchmark-x-metric]"), function (b) {
        var available = metricAvailable(b.dataset.benchmarkXMetric);
        b.disabled = !available;
        b.setAttribute("aria-disabled", available ? "false" : "true");
        b.title = available ? "" : "Not recorded for this task set";
        b.setAttribute("aria-pressed", b.dataset.benchmarkXMetric === state.metric ? "true" : "false");
      });
      Array.prototype.forEach.call(root.querySelectorAll("[data-benchmark-y-metric]"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.benchmarkYMetric === state.yMetric ? "true" : "false");
      });
      if (state.pinnedId && !pinnedPoint()) state.pinnedId = null;
      renderChart();
      renderModelToggles();
      renderTable();
    }

    Array.prototype.forEach.call(root.querySelectorAll("[data-benchmark-x-metric]"), function (button) {
      button.addEventListener("click", function () {
        state.metric = button.dataset.benchmarkXMetric;
        hideTooltip({ force: true });
        renderAll();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-benchmark-y-metric]"), function (button) {
      button.addEventListener("click", function () {
        state.yMetric = button.dataset.benchmarkYMetric;
        hideTooltip({ force: true });
        renderAll();
      });
    });
    Array.prototype.forEach.call(scopeButtons, function (button) {
      button.addEventListener("click", function () {
        state.datasetScope = button.dataset.benchmarkScope;
        state.selectedId = null;
        state.pinnedId = null;
        hideTooltip({ force: true });
        renderAll();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-benchmark-sort]"), function (header) {
      header.addEventListener("click", function () {
        var key = header.dataset.benchmarkSort;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = key === "model" || key === "version" ? "asc" : "desc"; }
        renderTable();
      });
    });
    document.addEventListener("mousemove", function (event) {
      if (!state.pinnedId) return;
      var t = event.target;
      if (t && t.closest && root.contains(t) && (t.closest(".point") || t.closest("tbody tr"))) { cancelPinnedDismiss(); return; }
      schedulePinnedDismiss();
    });
    var resizeTimer;
    var lastWidth = chartWrap.clientWidth;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (chartWrap.clientWidth === lastWidth) return;
        lastWidth = chartWrap.clientWidth;
        hideTooltip({ force: true });
        renderAll();
      }, 120);
    });
    /* A chart inside a hidden carousel slide has no width yet; re-render once it becomes visible. */
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        if (chartWrap.clientWidth && chartWrap.clientWidth !== lastWidth) {
          lastWidth = chartWrap.clientWidth;
          renderAll();
        }
      }).observe(chartWrap);
    }

    renderAll();
  }
}());
