(function () {
  "use strict";

  /* Capability annotations from window.OSCI.stats.capabilities (osciData.js):
     { key, category, count, value, share (% of all tags), color }. Tags are non-exclusive. */
  var ECONOMIC_DATA = (window.OSCI && window.OSCI.stats && window.OSCI.stats.capabilities) || [];

  function sum(list, selector) {
    return list.reduce(function (total, item) {
      return total + selector(item);
    }, 0);
  }

  function polar(cx, cy, radius, angle) {
    var radians = (angle - 90) * Math.PI / 180;
    return {
      x: cx + radius * Math.cos(radians),
      y: cy + radius * Math.sin(radians)
    };
  }

  function ringPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
    var largeArc = endAngle - startAngle > 180 ? 1 : 0;
    var outerStart = polar(cx, cy, outerRadius, endAngle);
    var outerEnd = polar(cx, cy, outerRadius, startAngle);
    var innerStart = polar(cx, cy, innerRadius, startAngle);
    var innerEnd = polar(cx, cy, innerRadius, endAngle);

    return [
      "M", outerStart.x, outerStart.y,
      "A", outerRadius, outerRadius, 0, largeArc, 0, outerEnd.x, outerEnd.y,
      "L", innerStart.x, innerStart.y,
      "A", innerRadius, innerRadius, 0, largeArc, 1, innerEnd.x, innerEnd.y,
      "Z"
    ].join(" ");
  }

  function createSvgElement(tag, attrs) {
    var element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function createText(text, x, y, className, rotate, anchor) {
    var node = createSvgElement("text", {
      x: x,
      y: y,
      "text-anchor": anchor || "middle",
      "dominant-baseline": "middle"
    });
    if (className) node.setAttribute("class", className);
    if (rotate) node.setAttribute("transform", "rotate(" + rotate + " " + x + " " + y + ")");
    node.textContent = text;
    return node;
  }

  function readableTangentRotation(angle) {
    var rotation = angle - 90;
    while (rotation > 90) rotation -= 180;
    while (rotation < -90) rotation += 180;
    return rotation;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function valueLabel(item) {
    return item.count + (item.count === 1 ? " task" : " tasks");
  }
  /* short names for the centre of the ring, where the long legend names do not fit */
  var CENTRE_NAME = { screenshot: "Screenshot", table: "Table" };
  var MIN_LABELLED_SHARE = 2;   /* wedges below 2% of tags carry no in-ring labels; the legend and tooltip cover them */

  function renderTable(root, onActivate, onLeave) {
    var tableBody = root.querySelector("#economic-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = ECONOMIC_DATA.map(function (item) {
      return [
        '<button class="economic-row" type="button" data-economic-key="' + escapeHtml(item.key) + '">',
        '  <span><i style="background:' + escapeHtml(item.color) + '"></i>' + escapeHtml(item.category) + '</span>',
        '</button>'
      ].join("");
    }).join("");

    Array.prototype.forEach.call(tableBody.querySelectorAll(".economic-row"), function (row) {
      row.addEventListener("mouseenter", function () { onActivate(row.dataset.economicKey); });
      row.addEventListener("focus", function () { onActivate(row.dataset.economicKey); });
      row.addEventListener("click", function () { onActivate(row.dataset.economicKey); });
      row.addEventListener("mouseleave", onLeave);
      row.addEventListener("blur", onLeave);
    });
  }

  function renderChart(root, onActivate, showTooltip, hideTooltip) {
    var svg = root.querySelector("#economic-donut");
    if (!svg) return;

    var cx = 300;
    var cy = 250;
    var totalShare = sum(ECONOMIC_DATA, function (item) { return item.share; });
    var maxTaskCount = Math.max.apply(null, ECONOMIC_DATA.map(function (item) { return item.count; }));
    var gap = 0.24;
    var startAngle = 1.5;
    var innerBottom = 92;
    var innerHeight = 68;
    var outerBottom = 166;
    var minOuterHeight = 22;
    var maxOuterHeight = 112;

    svg.innerHTML = "";

    var defs = createSvgElement("defs");
    var shadow = createSvgElement("filter", {
      id: "economic-segment-shadow",
      x: "-25%",
      y: "-25%",
      width: "150%",
      height: "150%"
    });
    shadow.innerHTML = '<feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#1c1c1c" flood-opacity="0.24"/>';
    defs.appendChild(shadow);
    svg.appendChild(defs);

    ECONOMIC_DATA.forEach(function (item) {
      var angleWidth = item.share / totalShare * 360;
      var start = startAngle + gap / 2;
      var end = startAngle + angleWidth - gap / 2;
      var mid = startAngle + angleWidth / 2;
      if (end <= start) {
        start = startAngle;
        end = startAngle + angleWidth;
      }

      var inner = createSvgElement("path", {
        d: ringPath(cx, cy, innerBottom, innerBottom + innerHeight, start, end),
        fill: item.color,
        tabindex: "0",
        role: "button",
        "aria-label": item.category + ", " + item.share.toFixed(1) + "% share of tags"
      });
      inner.classList.add("economic-segment", "economic-segment-inner");
      inner.dataset.economicKey = item.key;
      svg.appendChild(inner);

      var shareLabel = polar(cx, cy, innerBottom + innerHeight * 0.52, mid);
      var shareRotate = readableTangentRotation(mid);
      if (item.share >= MIN_LABELLED_SHARE) {
        svg.appendChild(createText(item.share.toFixed(1) + "%", shareLabel.x, shareLabel.y, "economic-share-label", shareRotate));
      }

      var outerHeight = item.count / maxTaskCount * maxOuterHeight + minOuterHeight;
      var outer = createSvgElement("path", {
        d: ringPath(cx, cy, outerBottom, outerBottom + outerHeight, start, end),
        fill: item.color,
        tabindex: "0",
        role: "button",
        "aria-label": item.category + ", " + valueLabel(item)
      });
      outer.classList.add("economic-segment", "economic-segment-outer");
      outer.dataset.economicKey = item.key;
      svg.appendChild(outer);

      var countLabel = polar(cx, cy, outerBottom + outerHeight * 0.62, mid);
      var countRotate = readableTangentRotation(mid);
      if (item.share >= MIN_LABELLED_SHARE) {
        svg.appendChild(createText(String(item.count), countLabel.x, countLabel.y, "economic-count-label", countRotate));
      }

      startAngle += angleWidth;
    });

    /* centre text inside the hole (scales with the chart) */
    var centre = createSvgElement("g", { class: "economic-centre-text", "aria-hidden": "true" });
    centre.appendChild(createSvgElement("text", { id: "economic-center-value", x: cx, y: cy - 6, "text-anchor": "middle" }));
    centre.appendChild(createSvgElement("text", { id: "economic-center-label", x: cx, y: cy + 26, "text-anchor": "middle" }));
    centre.appendChild(createSvgElement("text", { id: "economic-center-sub", x: cx, y: cy + 50, "text-anchor": "middle" }));
    svg.appendChild(centre);

    Array.prototype.forEach.call(svg.querySelectorAll(".economic-segment"), function (segment) {
      segment.addEventListener("mouseenter", function (event) {
        onActivate(segment.dataset.economicKey);
        showTooltip(event, segment.dataset.economicKey);
      });
      segment.addEventListener("mousemove", function (event) {
        showTooltip(event, segment.dataset.economicKey);
      });
      segment.addEventListener("mouseleave", hideTooltip);
      segment.addEventListener("focus", function () { onActivate(segment.dataset.economicKey); });
      segment.addEventListener("click", function () { onActivate(segment.dataset.economicKey); });
    });
  }

  function initEconomicCoverage() {
    var root = document.getElementById("economic-coverage");
    if (!root) return;

    var centerValue, centerLabel, centerSub;
    var tooltip = root.querySelector("#economic-tooltip");
    var totalValue = sum(ECONOMIC_DATA, function (item) { return item.value; });

    function findItem(key) {
      return ECONOMIC_DATA.find(function (item) { return item.key === key; });
    }

    function clearActive() {
      root.removeAttribute("data-active-economic");
      Array.prototype.forEach.call(root.querySelectorAll("[data-economic-key]"), function (node) {
        node.classList.remove("is-active");
      });
      if (!centerValue) return;
      centerValue.textContent = String(Math.round(totalValue));
      centerLabel.textContent = "capability";
      centerSub.textContent = "tags";
      if (tooltip) tooltip.hidden = true;
    }

    function activate(key) {
      var item = findItem(key);
      if (!item) return;
      root.setAttribute("data-active-economic", key);
      Array.prototype.forEach.call(root.querySelectorAll("[data-economic-key]"), function (node) {
        node.classList.toggle("is-active", node.dataset.economicKey === key);
      });
      if (!centerValue) return;
      centerValue.textContent = String(item.count);
      centerLabel.textContent = CENTRE_NAME[item.key] || item.category;
      centerSub.textContent = item.count === 1 ? "task" : "tasks";
    }

    function showTooltip(event, key) {
      var item = findItem(key);
      if (!item || !tooltip) return;
      tooltip.innerHTML = [
        '<strong>' + escapeHtml(item.category) + '</strong>',
        '<span>' + escapeHtml(valueLabel(item)) + '</span>',
        '<small>' + item.share.toFixed(1) + '% of all capability tags</small>'
      ].join("");
      tooltip.hidden = false;
      var box = root.getBoundingClientRect();
      tooltip.style.left = (event.clientX - box.left + 14) + "px";
      tooltip.style.top = (event.clientY - box.top + 14) + "px";
    }

    renderTable(root, activate, clearActive);
    renderChart(root, activate, showTooltip, clearActive);
    centerValue = root.querySelector("#economic-center-value");
    centerLabel = root.querySelector("#economic-center-label");
    centerSub = root.querySelector("#economic-center-sub");
    root.addEventListener("mouseleave", clearActive);
    clearActive();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEconomicCoverage);
  } else {
    initEconomicCoverage();
  }
})();
