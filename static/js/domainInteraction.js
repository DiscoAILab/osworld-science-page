(function () {
  /* Domains and their software configurations come from window.OSCI.stats.domain_list (osciData.js):
     { key, title, short, color, light, count, value (% of tasks), subcategories: [{ label, count, value }] }.
     Every displayed share is the source value (count / tasks, one decimal); ring angles use the task counts. */
  var STATS = (window.OSCI && window.OSCI.stats) || {};
  var TOTAL_TASKS = STATS.tasks || 0;
  var DOMAIN_DATA = (STATS.domain_list || []).map(function (d) {
    return { key: d.key, title: d.title, short: d.short || d.title, color: d.color, light: d.light, description: d.description,
             count: d.count, value: d.value,
             subcategories: d.subcategories.map(function (x) { return { label: x.label, value: x.value, count: x.count }; }) };
  });
  /* Ring geometry in user units (ring centre 260, 260). The hole holds the centre text, so nothing covers the rings. */
  var RING = { hole: 98, inner: 164, outerStart: 170, outer: 246, label: 131 };
  /* Software logos (static/js/softwareLogos.js) sit just outside the outer ring, next to their segment. Sizes are in
     screen pixels; placeLogos() converts them to user units for the current rendered width and sets the viewBox to
     the ring plus the logos. */
  var LOGOS = window.OSCI_SOFTWARE_LOGOS || {};
  var LOGO = { gap: 7, pad: 6, tinyDeg: 8, tinyExtra: 14, margin: 4 };
  var logoItems = [];

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

  function donutPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
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

  function mixColor(hex, ratio) {
    var normalized = hex.replace("#", "");
    var r = parseInt(normalized.slice(0, 2), 16);
    var g = parseInt(normalized.slice(2, 4), 16);
    var b = parseInt(normalized.slice(4, 6), 16);
    var mixed = [r, g, b].map(function (channel) {
      return Math.round(channel + (255 - channel) * ratio);
    });
    return "rgb(" + mixed.join(", ") + ")";
  }

  function createSvgElement(tag, attrs) {
    var element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function domainLabelLines(domain) {
    return [domain.short || domain.title];
  }

  function appendTextLines(textElement, lines) {
    var offset = lines.length > 1 ? -0.36 : 0;
    lines.forEach(function (line, index) {
      var tspan = createSvgElement("tspan", {
        x: textElement.getAttribute("x"),
        dy: index === 0 ? offset + "em" : "1.02em"
      });
      tspan.textContent = line;
      textElement.appendChild(tspan);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderDonut(svg, onActivate, onPointerMove, onPointerLeave) {
    var total = sum(DOMAIN_DATA, function (domain) { return domain.count; });
    var cx = 260;
    var cy = 260;
    var start = -6;

    svg.innerHTML = "";
    logoItems = [];
    svg.setAttribute("aria-label", "OSWorld-Science task domain distribution. Interactive two-ring donut chart: inner ring = scientific domain, outer ring = software configuration.");

    var defs = createSvgElement("defs");
    var shadow = createSvgElement("filter", {
      id: "domain-segment-shadow",
      x: "-20%",
      y: "-20%",
      width: "140%",
      height: "140%"
    });
    shadow.innerHTML = '<feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#172033" flood-opacity="0.22"/>';
    defs.appendChild(shadow);
    svg.appendChild(defs);
    var labelLayer = createSvgElement("g", { class: "domain-label-layer" });   /* drawn last, above every segment */

    DOMAIN_DATA.forEach(function (domain) {
      var angle = domain.count / total * 360;
      var end = start + angle;
      var mid = start + angle / 2;
      var liftX = Math.cos((mid - 90) * Math.PI / 180) * 12;
      var liftY = Math.sin((mid - 90) * Math.PI / 180) * 12;

      var inner = createSvgElement("path", {
        d: donutPath(cx, cy, RING.hole, RING.inner, start + 0.55, end - 0.55),
        fill: domain.color,
        tabindex: "0",
        role: "button",
        "aria-label": domain.title + ", " + domain.value.toFixed(1) + "%"
      });
      inner.classList.add("domain-segment", "domain-segment-inner");
      inner.dataset.domain = domain.key;
      inner.style.setProperty("--lift-x", liftX.toFixed(2) + "px");
      inner.style.setProperty("--lift-y", liftY.toFixed(2) + "px");

      var labelPoint = polar(cx, cy, RING.label, mid);
      var label = createSvgElement("text", {
        x: labelPoint.x,
        y: labelPoint.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        style: "font-size:18px"
      });
      label.classList.add("domain-label");
      if (domain.value >= 4) appendTextLines(label, domainLabelLines(domain));

      [inner, label].forEach(function (node) {
        node.addEventListener("mouseenter", function (event) {
          onActivate(domain.key, null, inner);
          onPointerMove(event, domain.title, domain.count + " tasks · " + domain.value.toFixed(1) + "%");
        });
        node.addEventListener("mousemove", function (event) {
          onPointerMove(event, domain.title, domain.count + " tasks · " + domain.value.toFixed(1) + "%");
        });
        node.addEventListener("mouseleave", onPointerLeave);
        node.addEventListener("focus", function () { onActivate(domain.key, null, inner); });
        node.addEventListener("click", function () { onActivate(domain.key, null, inner); });
      });

      svg.appendChild(inner);
      labelLayer.appendChild(label);

      var subStart = start;
      domain.subcategories.forEach(function (subcategory, subIndex) {
        var subAngle = subcategory.count / total * 360;
        var subEnd = subStart + subAngle;
        var subMid = subStart + subAngle / 2;
        var subLiftX = Math.cos((subMid - 90) * Math.PI / 180) * 15;
        var subLiftY = Math.sin((subMid - 90) * Math.PI / 180) * 15;
        var outer = createSvgElement("path", {
          d: donutPath(cx, cy, RING.outerStart, RING.outer, subStart + 0.45, subEnd - 0.45),
          fill: mixColor(domain.light, subIndex * 0.055),
          tabindex: "0",
          role: "button",
          "aria-label": subcategory.label + ", " + subcategory.value.toFixed(1) + "%"
        });
        outer.classList.add("domain-segment", "domain-segment-outer");
        outer.dataset.domain = domain.key;
        outer.style.setProperty("--lift-x", subLiftX.toFixed(2) + "px");
        outer.style.setProperty("--lift-y", subLiftY.toFixed(2) + "px");
        outer.addEventListener("mouseenter", function (event) {
          onActivate(domain.key, subcategory, outer);
          onPointerMove(event, subcategory.label, subcategory.count + " tasks · " + subcategory.value.toFixed(1) + "%");
        });
        outer.addEventListener("mousemove", function (event) {
          onPointerMove(event, subcategory.label, subcategory.count + " tasks · " + subcategory.value.toFixed(1) + "%");
        });
        outer.addEventListener("mouseleave", onPointerLeave);
        outer.addEventListener("focus", function () { onActivate(domain.key, subcategory, outer); });
        outer.addEventListener("click", function () { onActivate(domain.key, subcategory, outer); });
        svg.appendChild(outer);
        if (LOGOS[subcategory.label]) {
          logoItems.push({ domain: domain, sub: subcategory, outer: outer, logo: LOGOS[subcategory.label],
                           a0: subStart, a1: subEnd, mid: subMid });
        }
        subStart = subEnd;
      });

      start = end;
    });

    svg.appendChild(labelLayer);

    /* centre text: default = all tasks; on hover = the domain or software under the pointer */
    var centre = createSvgElement("g", { class: "domain-centre-text", "aria-hidden": "true" });
    centre.appendChild(createSvgElement("text", { id: "domain-center-value", x: cx, y: cy - 10, "text-anchor": "middle" }));
    centre.appendChild(createSvgElement("text", { id: "domain-center-label", x: cx, y: cy + 22, "text-anchor": "middle" }));
    centre.appendChild(createSvgElement("text", { id: "domain-center-sub", x: cx, y: cy + 46, "text-anchor": "middle" }));
    svg.appendChild(centre);
  }

  /* ---------- software logos around the outer ring ---------- */
  function logoPx(logo, compact) {
    /* square marks 32 px (28 px on phones); wordmarks 28 px tall, at most 72 px (62 px) wide */
    var aspect = logo.width / logo.height;
    if (aspect <= 1.2) { var side = compact ? 28 : 32; return { w: side * aspect, h: side }; }
    var h = 28, maxW = compact ? 62 : 72;
    return aspect * h > maxW ? { w: maxW, h: maxW / aspect } : { w: aspect * h, h: h };
  }
  function boxDistance(cx, cy, hw, hh) {         /* distance from the ring centre to a box centred at (cx, cy) */
    var dx = Math.max(Math.abs(cx) - hw, 0), dy = Math.max(Math.abs(cy) - hh, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function angleDiff(a, b) { return ((b - a) % 360 + 540) % 360 - 180; }   /* signed, b relative to a */
  function layoutLogos(items, scale, compact) {
    var R = RING.outer + LOGO.gap / scale, pad = LOGO.pad / scale;
    items.forEach(function (it) {
      var px = logoPx(it.logo, compact);
      it.w = px.w / scale; it.h = px.h / scale;
      it.tiny = it.a1 - it.a0 < LOGO.tinyDeg;
      it.target = R + (it.tiny ? LOGO.tinyExtra / scale : 0);
      it.theta = it.mid;
    });
    function position(it) {                        /* nearest box edge exactly `target` from the centre */
      var rad = (it.theta - 90) * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
      var lo = 0, hi = it.target + it.w + it.h;
      for (var k = 0; k < 32; k += 1) {
        var m = (lo + hi) / 2;
        if (boxDistance(m * ux, m * uy, it.w / 2, it.h / 2) < it.target) lo = m; else hi = m;
      }
      it.x = 260 + hi * ux - it.w / 2; it.y = 260 + hi * uy - it.h / 2;
    }
    function overlap(a, b) {
      return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
    }
    /* spread neighbours apart along the ring (order around the ring is kept, so leader lines cannot cross) */
    for (var iter = 0; iter < 600; iter += 1) {
      items.forEach(position);
      var moved = false;
      for (var i = 0; i < items.length; i += 1) {
        for (var j = i + 1; j < items.length; j += 1) {
          if (!overlap(items[i], items[j])) continue;
          var d = angleDiff(items[i].theta, items[j].theta);
          var step = 0.35;
          items[i].theta -= d >= 0 ? step : -step;
          items[j].theta += d >= 0 ? step : -step;
          moved = true;
        }
      }
      if (!moved) break;
    }
    items.forEach(function (it) {
      var inside = angleDiff(it.a0, it.theta) > 0.5 && angleDiff(it.theta, it.a1) > 0.5;
      it.leader = it.tiny || !inside;
    });
    var box = { x0: 260 - RING.outer - 4, y0: 260 - RING.outer - 4, x1: 260 + RING.outer + 4, y1: 260 + RING.outer + 4 };
    var m = LOGO.margin / scale;
    items.forEach(function (it) {
      box.x0 = Math.min(box.x0, it.x - m); box.y0 = Math.min(box.y0, it.y - m);
      box.x1 = Math.max(box.x1, it.x + it.w + m); box.y1 = Math.max(box.y1, it.y + it.h + m);
    });
    return box;
  }
  function placeLogos(svg, handlers) {
    var old = svg.querySelector(".domain-logo-layer");
    if (old) old.parentNode.removeChild(old);
    var width = svg.getBoundingClientRect().width || 360;
    var compact = width < 430;
    var items = logoItems;
    var scale = width / 520, box = null;
    for (var pass = 0; pass < 8; pass += 1) {      /* the viewBox width sets the scale, which sets the logo size */
      box = layoutLogos(items, scale, compact);
      scale = width / (box.x1 - box.x0);
    }
    box = layoutLogos(items, scale, compact);
    svg.setAttribute("viewBox", [box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0].map(function (v) { return v.toFixed(2); }).join(" "));
    var layer = createSvgElement("g", { class: "domain-logo-layer" });
    items.forEach(function (it) {
      if (!it.leader) return;
      var rad = (it.mid - 90) * Math.PI / 180;
      var sx = 260 + (RING.outer + 2) * Math.cos(rad), sy = 260 + (RING.outer + 2) * Math.sin(rad);
      var ex = Math.max(it.x, Math.min(sx, it.x + it.w)), ey = Math.max(it.y, Math.min(sy, it.y + it.h));
      layer.appendChild(createSvgElement("line", { class: "domain-logo-leader", x1: sx.toFixed(2), y1: sy.toFixed(2),
        x2: ex.toFixed(2), y2: ey.toFixed(2), "vector-effect": "non-scaling-stroke" }));
    });
    items.forEach(function (it) {
      var label = it.sub.label + ", " + it.sub.count + (it.sub.count === 1 ? " task" : " tasks") + ", " + it.sub.value.toFixed(1) + "%";
      var g = createSvgElement("g", { class: "domain-logo", tabindex: "0", role: "img", "aria-label": label,
                                      "data-domain": it.domain.key, "data-software": it.sub.label });
      var title = createSvgElement("title");
      title.textContent = label;
      g.appendChild(title);
      g.appendChild(createSvgElement("rect", { class: "domain-logo-box", x: it.x.toFixed(2), y: it.y.toFixed(2),
                                               width: it.w.toFixed(2), height: it.h.toFixed(2), rx: (3 / scale).toFixed(2) }));
      g.appendChild(createSvgElement("image", { href: it.logo.src, x: it.x.toFixed(2), y: it.y.toFixed(2),
                                                width: it.w.toFixed(2), height: it.h.toFixed(2), preserveAspectRatio: "xMidYMid meet" }));
      var text = it.sub.count + (it.sub.count === 1 ? " task" : " tasks") + " · " + it.sub.value.toFixed(1) + "%";
      g.addEventListener("mouseenter", function (event) { handlers.activate(it.domain.key, it.sub, it.outer); handlers.move(event, it.sub.label, text); });
      g.addEventListener("mousemove", function (event) { handlers.move(event, it.sub.label, text); });
      g.addEventListener("mouseleave", handlers.leave);
      g.addEventListener("focus", function () { handlers.activate(it.domain.key, it.sub, it.outer); });
      g.addEventListener("click", function () { handlers.activate(it.domain.key, it.sub, it.outer); });
      layer.appendChild(g);
    });
    svg.appendChild(layer);
    return width;
  }

  function renderShowcaseRail() {
    var track = document.getElementById("domain-showcase-track");
    var data = window.OSWORLD_TRAJECTORY_SHOWCASE;
    var tasks = data && data.tasks ? data.tasks : [];
    var siteRoot = window.OSWORLD_SITE_ROOT || "";
    if (!track || !tasks.length) return;

    var cards = tasks.map(function (task) {
      var versionLabel = task.taskVersion || (data && data.taskVersion) || "v2026.06.24";
      return [
        '<a class="domain-showcase-card" href="' + escapeHtml(siteRoot + 'task-showcase/index.html#task-' + task.id) + '">',
        '  <img src="' + escapeHtml(task.coverImage) + '" alt="" loading="lazy">',
        '  <span>',
        '    <strong>Task ' + escapeHtml(task.datasetId || task.id) + '</strong>',
        '    <small>' + escapeHtml(task.shortTitle || task.title) + '</small>',
        '    <em>Version ' + escapeHtml(versionLabel) + '</em>',
        '  </span>',
        '</a>'
      ].join("");
    }).join("");
    track.innerHTML = cards;
  }

  function initDomainExplorer() {
    var root = document.getElementById("domain-explorer");
    if (!root) return;

    var svg = root.querySelector("#domain-donut");
    var chartShell = root.querySelector(".domain-chart-shell");
    var tooltip = root.querySelector("#domain-tooltip");
    var centerValue, centerLabel, centerSub;

    function setCentre(value, label, sub) {
      if (!centerValue) return;
      centerValue.textContent = value;
      centerLabel.textContent = label;
      centerSub.textContent = sub;
    }
    function resetCentre() {
      setCentre(String(TOTAL_TASKS), "tasks", DOMAIN_DATA.length + " domains");
    }

    function findDomain(key) {
      return DOMAIN_DATA.find(function (domain) { return domain.key === key; });
    }

    function setHoveredSegment(segment) {
      Array.prototype.forEach.call(root.querySelectorAll(".domain-segment"), function (node) {
        node.classList.toggle("is-hovered", node === segment);
        node.classList.toggle("is-active-domain", Boolean(segment && node.dataset.domain === segment.dataset.domain));
      });
      Array.prototype.forEach.call(root.querySelectorAll(".domain-logo"), function (node) {
        node.classList.toggle("is-active-domain", Boolean(segment && node.dataset.domain === segment.dataset.domain));
      });
    }

    function activate(key, subcategory, segment) {
      var data = findDomain(key);
      if (!data) return;
      var item = subcategory || data;
      setCentre(item.value.toFixed(1) + "%", subcategory ? subcategory.label : data.short,
                item.count + (item.count === 1 ? " task" : " tasks"));

      root.setAttribute("data-active-domain", key);
      setHoveredSegment(segment || null);
    }

    function showTooltip(event, label, value) {
      if (!tooltip) return;
      tooltip.innerHTML = "<strong>" + label + "</strong><span>" + value + "</span>";
      tooltip.hidden = false;
      var box = root.getBoundingClientRect();
      /* measure at the left edge (so the width is not squeezed), then keep the tooltip inside the viewport:
         near the right edge (the logos beside the ring) it opens to the left of the pointer */
      tooltip.style.left = "0px";
      var x = event.clientX - box.left + 14;
      if (event.clientX + 14 + tooltip.offsetWidth > document.documentElement.clientWidth - 8) {
        x = event.clientX - box.left - 14 - tooltip.offsetWidth;
      }
      tooltip.style.left = x + "px";
      tooltip.style.top = (event.clientY - box.top + 14) + "px";
    }

    function hideTooltip() {
      if (tooltip) tooltip.hidden = true;
      setHoveredSegment(null);
      root.removeAttribute("data-active-domain");
      resetCentre();
    }

    renderDonut(svg, activate, showTooltip, hideTooltip);
    var logoHandlers = { activate: activate, move: showTooltip, leave: hideTooltip };
    var logoWidth = placeLogos(svg, logoHandlers);
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        var w = svg.getBoundingClientRect().width;
        if (w && Math.abs(w - logoWidth) > 0.5) logoWidth = placeLogos(svg, logoHandlers);
      }).observe(svg);
    }
    centerValue = svg.querySelector("#domain-center-value");
    centerLabel = svg.querySelector("#domain-center-label");
    centerSub = svg.querySelector("#domain-center-sub");
    resetCentre();
    if (chartShell) {
      chartShell.addEventListener("mouseleave", hideTooltip);
      chartShell.addEventListener("blur", hideTooltip, true);
    }
    renderShowcaseRail();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDomainExplorer);
  } else {
    initDomainExplorer();
  }
})();
