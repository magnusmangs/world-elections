(() => {
  "use strict";

  const state = { data: null, byNumeric: new Map(), byIso3: new Map(), active: null, lastFocus: null };
  const DAY = 86400000;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

  const $ = (id) => document.getElementById(id);
  const EN = window.LANG === "en";
  const L = (is, en) => (EN ? en : is);
  // Data text: Icelandic twin (field + "Is") unless the reader chose English.
  const T = (o, f) => (o ? (EN ? o[f] : (o[f + "Is"] || o[f])) : "");
  const TL = (o, f) => (o ? (EN ? o[f] : (o[f + "Is"] || o[f])) : []) || [];
  const cname = (c) => T(c, "name");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- dates ----------
  const parseDate = (s) => new Date(s + "T00:00:00Z");
  const daysUntil = (s) => Math.round((parseDate(s) - today) / DAY);
  const MONTHS_IS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Dates by hand so they never depend on the browser's locale data.
  function fmt(s, opts) {
    const d = parseDate(s), M = (EN ? MONTHS_EN : MONTHS_IS)[d.getUTCMonth()], day = d.getUTCDate(), y = d.getUTCFullYear();
    if (opts.day && !opts.month) return String(day);
    if (!opts.day) return EN ? `${M} ${y}` : `${M} ${y}`;
    return EN ? `${day} ${M} ${y}` : `${day}. ${M} ${y}`;
  }
  function whenText(e) {
    if (e.dateStatus === "expected") return L("Áætlað í ", "Expected ") + fmt(e.date, { month: "long", year: "numeric" });
    return fmt(e.date, { day: "numeric", month: "long", year: "numeric" }) + (e.dateStatus === "tentative" ? L(" (óstaðfest)", " (tentative)") : "");
  }
  function countdown(e) {
    const d = daysUntil(e.date);
    const approx = e.dateStatus === "expected" ? L("u.þ.b. ", "about ") : "";
    if (d <= 0) return L("Kosið í dag", "Voting today");
    if (d === 1) return L("Á morgun", "Tomorrow");
    if (d < 60) return L(`Eftir ${approx}${d} daga`, `In ${approx}${d} days`);
    const m = Math.round(d / 30.4);
    return L(`Eftir ${approx}${m} ${m % 10 === 1 && m % 100 !== 11 ? "mánuð" : "mánuði"}`, `In ${approx}${m} months`);
  }
  function tier(dateStr) {
    const d = daysUntil(dateStr);
    if (d <= 31) return "var(--s1)";
    if (d <= 92) return "var(--s2)";
    if (d <= 183) return "var(--s3)";
    return "var(--s4)";
  }
  const nextVote = (c) => (c.upcoming && c.upcoming[0]) || null;

  // ---------- political spectrum ----------
  const SPECTRUM = [
    [/far[- ]left/i, 0], [/cent(re|er)[- ]left/i, 2], [/cent(re|er)[- ]right/i, 4], [/far[- ]right/i, 6],
    [/\bleft\b/i, 1], [/\bright\b/i, 5], [/\bcent(re|er)\b/i, 3],
  ];
  function spectrum(position) {
    if (!position) return null;
    let text = position, vals = [];
    for (const [re, v] of SPECTRUM) {
      const g = new RegExp(re.source, "gi");
      if (g.test(text)) { vals.push(v); text = text.replace(g, " "); }
    }
    if (!vals.length) return null;
    return [Math.min(...vals), Math.max(...vals)];
  }
  function spectrumHtml(p) {
    const s = spectrum(p.position), pos = T(p, "position");
    if (!s) return pos ? `<p class="spectrum-text">${esc(pos)}</p>` : "";
    const pct = (v) => (v / 6) * 100;
    const span = s[0] !== s[1]
      ? `<span class="spectrum-span" style="left:${pct(s[0])}%;width:${pct(s[1]) - pct(s[0])}%"></span>`
      : "";
    const mid = (s[0] + s[1]) / 2;
    return `<div class="spectrum" role="img" aria-label="${L("Pólitísk staða", "Political position")}: ${esc(pos)}">
      <p class="spectrum-text" aria-hidden="true">${esc(pos)}</p>
      <div class="spectrum-track">${span}<span class="spectrum-mark" style="left:${pct(mid)}%"></span></div>
      <div class="spectrum-labels" aria-hidden="true"><span>${L("Vinstri", "Left")}</span><span>${L("Hægri", "Right")}</span></div>
    </div>`;
  }

  // ---------- panel ----------
  let MEDIA = { people: {} };
  function personPhoto(iso, p) {
    const name = (p.leader || "").split(" and ")[0].split(";")[0].split("(")[0].trim();
    const m = MEDIA.people[`${iso}|${name}`];
    return m ? `<figure class="pphoto"><img src="${esc(m.thumb)}" alt="${esc(name)}" loading="lazy"><figcaption><a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.author === "Almenningseign" ? L("Almenningseign", "Public domain") : m.author)}</a>${m.author === "Almenningseign" ? "" : ", " + esc(m.license)}</figcaption></figure>` : "";
  }

  // ---------- parliament (hemicycle) and latest poll ----------
  const NS = "http://www.w3.org/2000/svg";
  function partyColor(p, i, n) {
    if (p.color) return p.color;
    const s = spectrum(p.position); const mid = s ? (s[0] + s[1]) / 2 : 3;
    const hue = [350, 5, 25, 45, 200, 215, 230][Math.round(mid)];
    return `hsl(${hue} ${55 + (i % 2) * 15}% ${38 + (i % 3) * 10}%)`;
  }
  function orderParties(c) {
    const mid = (p) => { const s = spectrum(p.position); return s ? (s[0] + s[1]) / 2 : 3; };
    return c.parties.map((p, i) => ({ p, i })).sort((a, b) => mid(a.p) - mid(b.p) || a.i - b.i).map((x) => x.p);
  }
  // Seat positions in a half circle, filled column by column from left to right.
  function hemicycleSeats(total) {
    let rows = Math.max(2, Math.min(12, Math.round(Math.sqrt(total / 2.2))));
    const r0 = 0.38, r1 = 1;
    const radii = Array.from({ length: rows }, (_, k) => r0 + (r1 - r0) * (rows === 1 ? 1 : k / (rows - 1)));
    const sum = radii.reduce((a, b) => a + b, 0);
    let counts = radii.map((r) => Math.floor((total * r) / sum));
    let left = total - counts.reduce((a, b) => a + b, 0);
    for (let k = rows - 1; left > 0; k = (k - 1 + rows) % rows, left--) counts[k]++;
    const seats = [];
    radii.forEach((r, k) => {
      const n = counts[k];
      for (let j = 0; j < n; j++) {
        const t = n === 1 ? 0.5 : j / (n - 1);
        const ang = Math.PI * (1 - t);
        seats.push({ x: r * Math.cos(ang), y: r * Math.sin(ang), ang });
      }
    });
    seats.sort((a, b) => b.ang - a.ang || a.y - b.y);
    const dot = Math.min(0.9 * (r1 - r0) / Math.max(rows - 1, 1), 0.9 * Math.PI * r0 / Math.max(counts[0] - 1, 1)) / 2;
    return { seats, dot: Math.max(dot, 0.006) };
  }
  function seatsHtml(c) {
    const ch = c.chamber;
    if (!ch || !ch.seats) return "";
    const parties = orderParties(c).filter((p) => p.seats > 0);
    if (!parties.length) return "";
    const known = parties.reduce((a, p) => a + p.seats, 0);
    const groups = parties.map((p, i) => ({ name: p.abbr || T(p, "name"), full: T(p, "name"), n: p.seats, color: partyColor(p, i), gov: p.inGovernment }));
    if (ch.seats - known > 0) groups.push({ name: L("Aðrir", "Others"), full: L("Aðrir flokkar, óháðir og laus sæti", "Other parties, independents and vacant seats"), n: ch.seats - known, color: "var(--land-line)" });
    const { seats, dot } = hemicycleSeats(ch.seats);
    let k = 0, circles = "";
    groups.forEach((g) => { for (let j = 0; j < g.n && k < seats.length; j++, k++) {
      const s = seats[k];
      circles += `<circle cx="${(s.x * 100).toFixed(2)}" cy="${(-s.y * 100).toFixed(2)}" r="${(dot * 100).toFixed(2)}" fill="${g.color}"><title>${esc(g.full)}</title></circle>`;
    } });
    const gov = groups.filter((g) => g.gov).reduce((a, g) => a + g.n, 0);
    const maj = ch.majority || Math.floor(ch.seats / 2) + 1;
    const desc = groups.map((g) => `${g.full} ${g.n}`).join(", ");
    return `<figure class="hemi">
      <svg viewBox="-104 -104 208 110" role="img" aria-label="${esc(T(ch, "name"))}, ${ch.seats} ${L("sæti", "seats")}: ${esc(desc)}">${circles}
        <text x="0" y="-6" text-anchor="middle" class="hemi-total">${ch.seats}</text>
        <text x="0" y="4" text-anchor="middle" class="hemi-sub">${L("meirihluti", "majority")} ${maj}</text></svg>
      <ul class="hemi-key">${groups.map((g) => `<li><i style="background:${g.color}"></i>${esc(g.name)} <b>${g.n}</b></li>`).join("")}</ul>
      <figcaption>${EN ? `Seats in the ${esc(ch.name)}${ch.asOf ? ` (${esc(ch.asOf)})` : " today"}.${gov ? ` Governing parties hold ${gov} of ${ch.seats}.` : ""}`
        : `Sæti í ${esc(T(ch, "name"))}${ch.asOf ? ` (${esc(T(ch, "asOf"))})` : " í dag"}.${gov ? ` Stjórnarflokkar hafa ${gov} af ${ch.seats}.` : ""}`}${ch.source ? ` <a href="${esc(ch.source)}" target="_blank" rel="noopener">${L("Heimild", "Source")}</a>` : ""}</figcaption>
    </figure>`;
  }
  function pollHtml(c) {
    const pl = c.poll;
    if (!pl) return "";
    const parties = c.parties.filter((p) => typeof p.pollValue === "number").sort((a, b) => b.pollValue - a.pollValue);
    if (!parties.length) return "";
    const seatsUnit = pl.unit === "seats";
    const max = seatsUnit && c.chamber ? Math.max(c.chamber.majority || 0, ...parties.map((p) => p.pollValue)) : Math.max(50, ...parties.map((p) => p.pollValue));
    const order = orderParties(c);
    const candidates = !c.chamber;
    const label = (p) => candidates || p.abbr === "IND" ? T(p, "name").replace(/\s*\(.*\)\s*/, "") : (p.abbr || T(p, "name"));
    const fmtV = (v) => seatsUnit ? `${v}` : `${EN ? String(v) : String(v).replace(".", ",")}%`;
    const line = seatsUnit && c.chamber && c.chamber.majority ? `<span class="poll-maj" style="left:${(c.chamber.majority / max) * 100}%" title="${L("Meirihluti", "Majority")}"></span>` : "";
    return `<figure class="poll">
      <ol class="poll-bars">${parties.map((p) => `<li><span class="poll-name" title="${esc(T(p, "name"))}">${esc(label(p))}</span>
        <span class="poll-track"><span class="poll-bar" style="width:${Math.max(1, (p.pollValue / max) * 100)}%;background:${partyColor(p, order.indexOf(p))}"></span></span>
        <span class="poll-val">${esc(fmtV(p.pollValue))}</span></li>`).join("")}</ol>
      <figcaption>${seatsUnit ? L("Áætluð sæti", "Projected seats") : L("Fylgi", "Vote share")}, ${esc(T(pl, "pollster"))}, ${esc(fmt(pl.date, { day: "numeric", month: "long", year: "numeric" }))}.${pl.note ? " " + esc(T(pl, "note")) : ""} <a href="${esc(pl.url)}" target="_blank" rel="noopener">${L("Heimild", "Source")}</a></figcaption>
    </figure>`;
  }
  function chamberHtml(c) {
    const s = seatsHtml(c), p = pollHtml(c);
    if (!s && !p) return "";
    return `${s ? `<h3>${L("Valdahlutföll", "Balance of power")}</h3>${s}` : ""}${p ? `<h3${s ? ' class="poll-h"' : ""}>${L("Nýjasta könnun", "Latest poll")}</h3>${p}` : ""}`;
  }

  function partyHtml(p, iso) {
    const stats = [];
    if (p.lastResult) stats.push([L("Síðasta niðurstaða", "Last result"), T(p, "lastResult")]);
    if (p.polling) stats.push([L("Fylgi í könnunum", "Polling"), T(p, "polling")]);
    const meta = [p.leader && `${L("Leiðtogi", "Led by")}${EN ? " " : ": "}${p.leader}`, T(p, "ideology")].filter(Boolean).join(". ");
    return `<li class="party">
      ${personPhoto(iso, p)}
      <div class="party-head">
        <p class="party-name">${esc(T(p, "name"))}${p.abbr && !T(p, "name").includes(p.abbr) ? ` <span class="party-abbr">${esc(p.abbr)}</span>` : ""}</p>
        ${p.inGovernment ? `<span class="chip">${L("Í ríkisstjórn", "In government")}</span>` : ""}
      </div>
      ${meta ? `<p class="party-meta">${esc(meta)}</p>` : ""}
      ${spectrumHtml(p)}
      ${TL(p, "policies").length ? `<ul class="policies">${TL(p, "policies").map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${stats.length ? `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
    </li>`;
  }

  function openPanel(c, nameFallback) {
    state.lastFocus = document.activeElement;
    const body = $("panel-body");
    if (!c) {
      body.innerHTML = `<h2 id="panel-title">${esc(nameFallback)}</h2>
        <p class="summary">${L("Engar þjóðarkosningar eru á dagskrá næstu 12 mánuði. Löndum er bætt við þegar kosningar eru boðaðar.", "No national election is on the calendar for the next 12 months. Countries are added as votes are announced.")}</p>`;
    } else {
      const votes = (c.upcoming || []).map((e) => `<div class="vote" style="--c:${tier(e.date)}">
          <div class="when">${esc(whenText(e))}</div>
          <div class="count">${esc(countdown(e))}</div>
          <div class="type">${esc(T(e, "type"))}</div>
          ${e.note ? `<div class="note">${esc(T(e, "note"))}</div>` : ""}
        </div>`).join("");
      const hasParties = c.parties && c.parties.length;
      const parties = `<h3>${L("Hverjir bjóða fram", "Who is running")}</h3>`
        + (c.noParties ? `<p class="no-parties">${esc(T(c, "noParties"))}</p>` : "")
        + (hasParties ? `<ul class="parties">${c.parties.map((p) => partyHtml(p, c.iso3)).join("")}</ul>`
          : (c.noParties ? "" : `<p class="no-parties">${L("Upplýsingar um flokka liggja ekki fyrir enn.", "Party information is not available yet.")}</p>`));
      body.innerHTML = `<h2 id="panel-title">${esc(cname(c))}</h2>
        <p class="leaders">${esc(T(c, "leaders"))}</p>
        ${votes}
        <p class="summary">${esc(T(c, "summary"))}</p>
        ${chamberHtml(c)}
        ${parties}
        <p class="summary"><a href="/frettir#land=${esc(c.iso3.toLowerCase())}">${L("Fréttir frá landinu í innlendum og erlendum miðlum", `News about ${esc(c.name)} in domestic and foreign media`)}</a></p>
        <h3>${L("Heimildir", "Sources")}</h3>
        <ol class="sources">${(c.sources || []).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ""))}</a></li>`).join("")}</ol>
        <p class="reviewed">${L("Síðast yfirfarið", "Last reviewed")} ${esc(fmt(c.lastReviewed, { day: "numeric", month: "long", year: "numeric" }))}. ${L("Samantektir eru skrifaðar með aðstoð gervigreindar upp úr heimildunum hér að ofan og geta verið á eftir fréttum.", "Summaries are written with AI assistance from the sources above and may lag the news.")}</p>`;
    }
    $("panel").hidden = false;
    $("scrim").hidden = false;
    $("panel").scrollTop = 0;
    $("panel-close").focus();
    state.active = c ? c.isoNumeric : null;
    highlight();
    try { history.replaceState(null, "", c ? "#" + c.iso3.toLowerCase() : location.pathname); } catch (_) {}
    if (window.chatContext) c ? window.chatContext("country", c.iso3, cname(c)) : window.chatContext("general");
  }
  function closePanel() {
    $("panel").hidden = true;
    $("scrim").hidden = true;
    state.active = null;
    highlight();
    if (window.chatContext) window.chatContext("general");
    try { history.replaceState(null, "", location.pathname); } catch (_) {}
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }
  $("panel-close").addEventListener("click", closePanel);
  $("scrim").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) closePanel(); });

  // ---------- calendar ----------
  function renderCalendar(filter = "") {
    const q = filter.trim().toLowerCase();
    const rows = [];
    for (const c of state.data.countries) {
      if (q && !c.name.toLowerCase().includes(q) && !cname(c).toLowerCase().includes(q)) continue;
      for (const e of c.upcoming || []) rows.push({ c, e });
    }
    rows.sort((a, b) => a.e.date.localeCompare(b.e.date) || cname(a.c).localeCompare(cname(b.c), window.LANG));
    const list = $("calendar-list");
    if (!rows.length) {
      list.innerHTML = `<p class="empty">${L(`Engar væntanlegar kosningar fundust fyrir „${esc(filter)}“. Prófaðu annað landsheiti.`, `No upcoming election matches “${esc(filter)}”. Try another country name.`)}</p>`;
      return;
    }
    const groups = new Map();
    for (const r of rows) {
      const key = r.e.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    list.innerHTML = [...groups].map(([key, items]) => `<div class="month">
      <h3>${esc(fmt(key + "-01", { month: "long", year: "numeric" }))}</h3>
      <ul class="rows">${items.map(({ c, e }) => `<li class="row"><button type="button" data-iso="${c.iso3}">
        <span class="day" style="--c:${tier(e.date)}"><i></i>${e.dateStatus === "expected" ? "~" : esc(fmt(e.date, { day: "numeric" }))}</span>
        <span class="what"><span class="country-name">${esc(cname(c))}</span> <span class="kind">${esc(T(e, "type"))}</span></span>
        <span class="status">${e.dateStatus === "confirmed" ? esc(countdown(e)) : e.dateStatus === "tentative" ? L("Dagsetning óstaðfest", "Date tentative") : L("Áætluð dagsetning", "Date expected")}</span>
      </button></li>`).join("")}</ul>
    </div>`).join("");
  }
  $("calendar-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-iso]");
    if (b) openPanel(state.byIso3.get(b.dataset.iso));
  });
  $("search").addEventListener("input", (e) => renderCalendar(e.target.value));

  // ---------- map ----------
  let svg, g, zoom, paths, dots;
  function highlight() {
    if (!paths) return;
    paths.classed("is-active", (d) => d.id === state.active);
  }
  function renderMap(world) {
    const el = $("map");
    const w = el.clientWidth || 1000, h = el.clientHeight || 600;
    const countries = topojson.feature(world, world.objects.countries).features.filter((f) => f.id !== "010");
    const projection = d3.geoEqualEarth().fitExtent([[8, 8], [w - 8, h - 8]], { type: "FeatureCollection", features: countries });
    const isNarrow = w < 720;
    if (!isNarrow) projection.translate([projection.translate()[0] + w * 0.03, projection.translate()[1]]);
    const path = d3.geoPath(projection);

    el.innerHTML = "";
    svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");
    g = svg.append("g");
    const tip = $("tooltip");

    function showTip(event, d) {
      const c = state.byNumeric.get(d.id);
      const name = c ? cname(c) : d.properties.name;
      const v = c && nextVote(c);
      tip.innerHTML = v ? `<b>${esc(name)}</b><br>${esc(T(v, "type"))}<br>${esc(whenText(v))}` : `<b>${esc(name)}</b><br>${L("Engar kosningar næstu 12 mánuði", "No vote in the next 12 months")}`;
      const r = el.getBoundingClientRect();
      tip.style.left = event.clientX - r.left + "px";
      tip.style.top = event.clientY - r.top + "px";
      tip.hidden = false;
    }
    const hideTip = () => { tip.hidden = true; };
    const click = (event, d) => {
      const c = state.byNumeric.get(d.id);
      openPanel(c, d.properties.name);
    };

    paths = g.selectAll("path.country").data(countries).join("path")
      .attr("class", (d) => "country" + (state.byNumeric.has(d.id) && nextVote(state.byNumeric.get(d.id)) ? " has-vote" : ""))
      .attr("d", path)
      .style("fill", (d) => { const c = state.byNumeric.get(d.id); const v = c && nextVote(c); return v ? tier(v.date) : null; })
      .on("pointermove", showTip).on("pointerleave", hideTip).on("click", click);

    // Dots for small states that are hard to see or click.
    const small = countries.filter((d) => {
      const c = state.byNumeric.get(d.id);
      if (!c || !nextVote(c)) return false;
      const b = path.bounds(d); const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
      return area < 220 || ["583", "242", "132"].includes(d.id);
    });
    const soon = (d) => daysUntil(nextVote(state.byNumeric.get(d.id)).date) <= 14;
    const centre = (d) => projection(d3.geoCentroid(d));
    dots = g.selectAll("g.marker").data(small).join("g").attr("class", "marker")
      .attr("transform", (d) => `translate(${centre(d)})`);
    dots.append("circle").attr("class", "dot").attr("r", isNarrow ? 4 : 5.5)
      .style("fill", (d) => tier(nextVote(state.byNumeric.get(d.id)).date))
      .on("pointermove", showTip).on("pointerleave", hideTip).on("click", click);
    // One deliberate motion: a ring around every country voting in the next two weeks.
    const pulseTargets = countries.filter((d) => { const c = state.byNumeric.get(d.id); return c && nextVote(c) && soon(d); });
    g.selectAll("circle.pulse").data(pulseTargets).join("circle").attr("class", "pulse")
      .attr("r", 6).attr("cx", (d) => centre(d)[0]).attr("cy", (d) => centre(d)[1]);

    zoom = d3.zoom().scaleExtent([1, 10]).translateExtent([[-w * 0.2, -h * 0.2], [w * 1.2, h * 1.2]])
      .on("zoom", (ev) => {
        g.attr("transform", ev.transform);
        g.selectAll(".dot").attr("r", 5.5 / Math.sqrt(ev.transform.k));
        g.selectAll(".pulse").attr("r", 6 / Math.sqrt(ev.transform.k));
      });
    svg.call(zoom).on("dblclick.zoom", null);
    highlight();
  }
  $("zoom-in").addEventListener("click", () => svg && svg.transition().duration(250).call(zoom.scaleBy, 1.6));
  $("zoom-out").addEventListener("click", () => svg && svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6));
  $("zoom-reset").addEventListener("click", () => svg && svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity));

  // ---------- lede ----------
  function renderLede() {
    const all = state.data.countries.flatMap((c) => (c.upcoming || []).map((e) => ({ c, e })))
      .filter((x) => x.e.dateStatus !== "expected").sort((a, b) => a.e.date.localeCompare(b.e.date));
    const total = state.data.countries.reduce((n, c) => n + (c.upcoming || []).length, 0);
    const nC = state.data.countries.filter((c) => (c.upcoming || []).length).length;
    let text = L(`<strong>${total} þjóðarkosningar</strong> í ${nC} löndum á næsta ári. Veldu land til að sjá hverjir bjóða fram og fyrir hvað þeir standa.`,
      `<strong>${total} national votes</strong> in ${nC} countries over the coming year. Pick a country to see who is running and what they stand for.`);
    if (all.length) {
      const first = all[0].e.date;
      const same = all.filter((x) => x.e.date === first);
      const names = same.map((x) => `<button type="button" data-iso="${x.c.iso3}">${esc(cname(x.c))}</button>`);
      const joined = names.length > 1 ? names.slice(0, -1).join(", ") + L(" og ", " and ") + names.at(-1) : names[0];
      text = `${L("Næst", "Next up")}: ${joined}, ${esc(countdown(same[0].e).toLowerCase())}. ` + text;
    }
    $("lede").innerHTML = text;
    $("lede").onclick = (e) => { const b = e.target.closest("button[data-iso]"); if (b) openPanel(state.byIso3.get(b.dataset.iso)); };
    const upd = fmt(state.data.updated, { day: "numeric", month: "long", year: "numeric" });
    $("fineprint").textContent = L(`Gögn síðast uppfærð ${upd}. Nær til forseta- og þingkosninga á landsvísu. Samantektir um flokka eru skrifaðar með aðstoð gervigreindar upp úr opinberum heimildum sem vísað er í fyrir hvert land og eru uppfærðar vikulega.`,
      `Data last updated ${upd}. Covers national presidential, parliamentary and legislative elections. Party summaries are written with AI assistance from public sources linked in each country, and are refreshed weekly.`);
  }

  // ---------- boot ----------
  Promise.all([
    fetch("data/elections.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("assets/countries-50m.json").then((r) => r.json()),
    fetch("data/media/media.json").then((r) => r.json()).catch(() => ({ people: {} })),
  ]).then(([data, world, media]) => {
    MEDIA = media;
    // Recompute upcoming against the viewer's date so past votes drop off between updates.
    for (const c of data.countries) {
      c.upcoming = (c.elections || []).filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
      state.byNumeric.set(c.isoNumeric, c);
      state.byIso3.set(c.iso3, c);
    }
    state.data = data;
    renderLede();
    renderCalendar();
    renderMap(world);
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => renderMap(world), 200); });
    const hash = location.hash.slice(1).toUpperCase();
    if (hash && state.byIso3.has(hash)) openPanel(state.byIso3.get(hash));
  }).catch((err) => {
    console.error(err);
    $("lede").textContent = L("Ekki tókst að sækja kosningagögnin. Endurhlaðið síðuna.", "The election data could not be loaded. Refresh the page to try again.");
  });
})();
