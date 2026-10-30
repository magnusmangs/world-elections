// US midterms page: a map of the states with the Senate, governor and House races, ratings and local news.
// Data: data/us/races.json (scripts/us_races.py), data/us/states_meta.json, data/us/news/ (scripts/us_news.py),
// optional data/us/live.json on election night (see UPDATING.md). One language at a time via i18n.js.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const EN = window.LANG === "en";
  const L = (is, en) => (EN ? en : is);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTHS_IS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dateLong = (s) => { const d = new Date(s.slice(0, 10) + "T00:00:00Z"); const M = (EN ? MONTHS_EN : MONTHS_IS)[d.getUTCMonth()];
    return EN ? `${d.getUTCDate()} ${M} ${d.getUTCFullYear()}` : `${d.getUTCDate()}. ${M} ${d.getUTCFullYear()}`; };
  function ago(iso) {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 60) return L(`fyrir ${Math.max(1, m)} mín.`, `${Math.max(1, m)} min ago`);
    const h = Math.round(m / 60);
    if (h < 24) return L(`fyrir ${h} klst.`, `${h} h ago`);
    const d = Math.round(h / 24);
    return L(`fyrir ${d} ${d === 1 ? "degi" : "dögum"}`, `${d} day${d === 1 ? "" : "s"} ago`);
  }

  const S = { races: null, meta: null, byAbbr: new Map(), byFips: new Map(), mode: "senate", active: null, live: null, usa: null, lastFocus: null };

  // ---------- parties, ratings ----------
  const PARTY = {
    Democratic: { is: "Demókrataflokkurinn", en: "Democratic", short: "D", c: "var(--dem3)" },
    Republican: { is: "Repúblikanaflokkurinn", en: "Republican", short: "R", c: "var(--rep3)" },
    Independent: { is: "Óháður", en: "Independent", short: L("Ó", "I"), c: "var(--ind)" },
  };
  const partyName = (p) => (PARTY[p] ? PARTY[p][EN ? "en" : "is"] : p || L("Óháður", "Independent"));
  const partyColor = (p) => (PARTY[p] ? PARTY[p].c : "var(--muted)");
  const letterColor = (x) => ({ D: "var(--dem3)", R: "var(--rep3)", I: "var(--ind)" }[x] || "var(--muted)");

  function ratingColor(r) {
    if (!r) return "var(--norace)";
    if (r.rating === "Tossup") return "var(--toss)";
    const lvl = { Solid: 3, Likely: 2, Lean: 1, Tilt: 1 }[r.rating] || 1;
    return `var(--${r.party === "D" ? "dem" : "rep"}${lvl})`;
  }
  function ratingText(r) {
    if (!r) return L("Ekki metið", "Not rated");
    if (r.rating === "Tossup") return L("Óráðið", "Toss-up");
    const d = r.party === "D";
    const en = `${r.rating} ${d ? "Democratic" : "Republican"}`;
    const who = d ? "demókrata" : "repúblikana";
    const is = { Solid: `Öruggt hjá ${who}`, Likely: `Líklegt hjá ${who}`, Lean: `Hallar að ${who}`, Tilt: `Hallar lítillega að ${who}` }[r.rating] || r.rating;
    return L(is, en);
  }
  const ratingOrder = (r) => !r ? 99 : r.rating === "Tossup" ? 0 : ({ Tilt: 1, Lean: 2, Likely: 3, Solid: 4 }[r.rating] || 5);
  const chip = (r) => `<span class="chip-r" style="--c:${ratingColor(r)}"><i></i>${esc(ratingText(r))}</span>`;

  const STATUS = {
    running: ["Sitjandi býður sig fram aftur", "Incumbent running"],
    retiring: ["Opið sæti: sitjandi býður sig ekki fram", "Open seat: incumbent not running"],
    term: ["Opið sæti: sitjandi má ekki sitja lengur", "Open seat: incumbent term-limited"],
    lost: ["Opið sæti: sitjandi tapaði í forvali", "Open seat: incumbent lost the primary"],
  };
  const stName = (s) => (EN ? s.name : s.nameIs || s.name);

  // ---------- live (election night) ----------
  const liveState = (ab) => (S.live && S.live.states && S.live.states[ab]) || null;
  function calledWinner(ab, kind, special) {
    const ls = liveState(ab);
    if (!ls) return null;
    if (kind === "senate") return (ls.senate || []).find((x) => !!x.special === !!special && x.party) || null;
    if (kind === "governor") return ls.governor && ls.governor.party ? ls.governor : null;
    return null;
  }

  // ---------- map colours per mode ----------
  function houseColor(h) {
    const d = h.delegation, n = d.R + d.D + d.I;
    if (!n) return "var(--norace)";
    const share = d.D / Math.max(1, d.D + d.R);
    if (share >= 0.999) return "var(--dem3)";
    if (share > 0.5) return "var(--dem1)";
    if (share <= 0.001) return "var(--rep3)";
    if (share < 0.5) return "var(--rep1)";
    return "var(--toss)";
  }
  function fill(ab) {
    const st = S.races.states[ab];
    if (!st) return "var(--norace)";
    if (S.mode === "house") {
      const lh = liveState(ab) && liveState(ab).house;
      if (lh && (lh.D || lh.R)) return houseColor({ delegation: { D: lh.D || 0, R: lh.R || 0, I: lh.I || 0 } });
      return houseColor(st.house);
    }
    const races = S.mode === "senate" ? st.senate : st.governor ? [st.governor] : [];
    if (!races.length) return "var(--norace)";
    const won = races.map((r) => calledWinner(ab, S.mode, r.special)).find(Boolean);
    if (won) return letterColor(won.party);
    const r = races.slice().sort((a, b) => ratingOrder(a.rating) - ratingOrder(b.rating))[0];
    return ratingColor(r.rating);
  }
  const hasRace = (ab) => {
    const st = S.races.states[ab];
    return S.mode === "house" ? true : S.mode === "senate" ? st.senate.length > 0 : !!st.governor;
  };

  const MODE_NOTE = {
    senate: () => L(`${count("senate")} sæti af 100 eru í kjöri, þar af tvö í aukakosningum (Flórída og Ohio). Litir sýna mat Cook Political Report; grá fylki kjósa ekki til öldungadeildar í ár.`,
      `${count("senate")} of 100 seats are up, including two special elections (Florida and Ohio). Colours show the Cook Political Report rating; grey states have no Senate race this year.`),
    governor: () => L(`Kosið er um ríkisstjóra í ${count("governor")} fylkjum. Litir sýna mat Cook Political Report; grá fylki kjósa ekki ríkisstjóra í ár.`,
      `${count("governor")} states elect a governor. Colours show the Cook Political Report rating; grey states have no governor's race this year.`),
    house: () => L("Öll 435 sæti fulltrúadeildarinnar eru í kjöri. Litir sýna hvernig núverandi þingmenn fylkisins skiptast milli flokka; opnaðu fylki til að sjá tvísýn kjördæmi.",
      "All 435 House seats are up. Colours show how each state's current delegation splits by party; open a state to see its competitive districts."),
  };
  function count(kind) {
    return Object.values(S.races.states).reduce((n, s) => n + (kind === "senate" ? s.senate.length : s.governor ? 1 : 0), 0);
  }
  function legend() {
    const item = (c, t) => `<li><i style="--c:${c}"></i><span>${esc(t)}</span></li>`;
    let html;
    if (S.mode === "house") {
      html = `<div class="legend-group"><span class="legend-title">${L("Núverandi þingmenn fylkis", "Current state delegation")}</span><ul class="legend-scale">
        ${item("var(--dem3)", L("Allir demókratar", "All Democratic"))}${item("var(--dem1)", L("Meirihluti demókrata", "Mostly Democratic"))}
        ${item("var(--toss)", L("Jafnt", "Even"))}${item("var(--rep1)", L("Meirihluti repúblikana", "Mostly Republican"))}${item("var(--rep3)", L("Allir repúblikanar", "All Republican"))}</ul></div>`;
    } else {
      html = `<div class="legend-group"><span class="legend-title">${L("Mat Cook Political Report", "Cook Political Report rating")}</span><ul class="legend-scale">
        ${item("var(--dem3)", L("Öruggt D", "Solid D"))}${item("var(--dem2)", L("Líklegt D", "Likely D"))}${item("var(--dem1)", L("Hallar D", "Lean D"))}
        ${item("var(--toss)", L("Óráðið", "Toss-up"))}${item("var(--rep1)", L("Hallar R", "Lean R"))}${item("var(--rep2)", L("Líklegt R", "Likely R"))}${item("var(--rep3)", L("Öruggt R", "Solid R"))}
        ${item("var(--norace)", L("Ekki kosið", "No race"))}</ul></div>`;
      if (S.live) html += `<div class="legend-group"><span class="legend-title">${L("Á kosninganótt", "Election night")}</span><ul class="legend-scale">${item("var(--dem3)", L("Úrslit ljós: D", "Called: D"))}${item("var(--rep3)", L("Úrslit ljós: R", "Called: R"))}</ul></div>`;
    }
    $("us-legend").innerHTML = html;
    $("mode-note").textContent = MODE_NOTE[S.mode]();
  }

  // ---------- map ----------
  const SMALL = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD"];
  let paths, labels;
  function renderMap(us) {
    const el = $("us-map");
    const states = topojson.feature(us, us.objects.states).features.filter((f) => S.byFips.has(f.id));
    const path = d3.geoPath();
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", "0 0 975 610").attr("role", "group")
      .attr("aria-label", L("Kort af fylkjum Bandaríkjanna", "Map of the US states"));
    const tip = $("tooltip");
    const show = (event, d) => {
      const s = S.byFips.get(d.id);
      tip.innerHTML = tipHtml(s);
      const r = $("us-map").parentElement.getBoundingClientRect();
      const x = event.clientX ?? (r.left + r.width / 2), y = event.clientY ?? (r.top + 40);
      tip.style.left = x - r.left + "px"; tip.style.top = y - r.top + "px"; tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    paths = svg.append("g").selectAll("path").data(states).join("path")
      .attr("class", "state").attr("d", path).attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (d) => stName(S.byFips.get(d.id)))
      .on("pointermove", show).on("pointerleave", hide)
      .on("focus", (e, d) => show(e, d)).on("blur", hide)
      .on("click", (e, d) => openState(S.byFips.get(d.id).abbr))
      .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openState(S.byFips.get(d.id).abbr); } });
    svg.append("path").datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
      .attr("fill", "none").attr("stroke", "var(--surface)").attr("stroke-width", 0.9).attr("pointer-events", "none");
    const big = states.filter((d) => !SMALL.includes(S.byFips.get(d.id).abbr) && path.area(d) > 900);
    labels = svg.append("g").selectAll("text").data(big).join("text").attr("class", "state-label")
      .attr("transform", (d) => { const c = path.centroid(d); const adj = { FL: [10, 6], LA: [-8, 0], MI: [10, 20], CA: [-6, 0], KY: [6, 2], HI: [6, 6], ID: [0, 16] }[S.byFips.get(d.id).abbr] || [0, 0];
        return `translate(${c[0] + adj[0]},${c[1] + adj[1]})`; })
      .text((d) => S.byFips.get(d.id).abbr);
    $("small-states").innerHTML = SMALL.map((ab) => `<button type="button" data-ab="${ab}"><i></i>${esc(stName(S.byAbbr.get(ab)))}</button>`).join("");
    $("small-states").onclick = (e) => { const b = e.target.closest("button[data-ab]"); if (b) openState(b.dataset.ab); };
    paint();
  }
  function paint() {
    if (!paths) return;
    paths.style("fill", (d) => fill(S.byFips.get(d.id).abbr))
      .classed("is-active", (d) => S.byFips.get(d.id).abbr === S.active)
      .style("opacity", (d) => (hasRace(S.byFips.get(d.id).abbr) ? 1 : 0.85));
    labels.classed("on-dark", (d) => /(dem3|rep3|toss|dem2|rep2)/.test(fill(S.byFips.get(d.id).abbr)));
    document.querySelectorAll("#small-states button").forEach((b) => b.style.setProperty("--c", fill(b.dataset.ab)));
    legend();
  }
  function tipHtml(s) {
    const st = S.races.states[s.abbr];
    let lines = "";
    if (S.mode === "senate") {
      lines = st.senate.length ? st.senate.map((r) => `${r.special ? L("Aukakosning: ", "Special: ") : ""}${esc(r.candidates.slice(0, 2).map((c) => `${c.name} (${PARTY[c.party] ? PARTY[c.party].short : c.party})`).join(L(" gegn ", " vs ")))}<br>${esc(ratingText(r.rating))}`).join("<br>")
        : L("Engin kosning til öldungadeildar", "No Senate race");
    } else if (S.mode === "governor") {
      const r = st.governor;
      lines = r ? `${esc(r.candidates.slice(0, 2).map((c) => `${c.name} (${PARTY[c.party] ? PARTY[c.party].short : c.party})`).join(L(" gegn ", " vs ")))}<br>${esc(ratingText(r.rating))}` : L("Engin ríkisstjórakosning", "No governor's race");
    } else {
      const d = st.house.delegation;
      lines = `${st.house.seats} ${L("sæti", st.house.seats === 1 ? "seat" : "seats")}: ${d.D} D, ${d.R} R${d.I ? `, ${d.I} ${L("óh.", "ind.")}` : ""}${d.vacant ? `, ${d.vacant} ${L("laust", "vacant")}` : ""}<br>${L("Tvísýn kjördæmi", "Competitive districts")}: ${st.house.competitive.length}`;
    }
    return `<b>${esc(stName(s))}</b><br>${lines}`;
  }
  document.querySelector(".modes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    S.mode = b.dataset.mode;
    document.querySelectorAll(".modes button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    paint();
  });

  // ---------- panel ----------
  function candList(r, ab, kind) {
    const won = calledWinner(ab, kind, r.special);
    return `<ul class="cands">${r.candidates.map((c) => {
      const isInc = c.name === r.incumbent;
      const w = won && won.name && won.name === c.name;
      return `<li style="--c:${partyColor(c.party)}"><i></i><span class="nm">${esc(c.name)}</span>
        <span class="pt">${esc(partyName(c.party))}</span>${isInc ? `<span class="inc">${L("sitjandi", "incumbent")}</span>` : ""}${w ? `<span class="won">${L("sigraði", "won")}</span>` : ""}</li>`;
    }).join("")}</ul>`;
  }
  function raceHtml(r, ab, kind) {
    const title = kind === "senate" ? (r.special ? L("Öldungadeild, aukakosning", "Senate, special election") : L("Öldungadeild", "Senate")) : L("Ríkisstjóri", "Governor");
    const st = STATUS[r.status] || STATUS.running;
    const inc = r.incumbent ? `${L("Sitjandi", "Incumbent")}: ${esc(r.incumbent)} (${esc(partyName(r.incumbentParty))}). ` : "";
    const special = r.special ? ` ${L("Kosið er um það sem eftir er af kjörtímabilinu, til janúar 2029.", "The winner serves the rest of the term, to January 2029.")}` : "";
    const won = calledWinner(ab, kind, r.special);
    return `<section class="race" style="--c:${won ? letterColor(won.party) : ratingColor(r.rating)}">
      <div class="race-h"><h3>${title}</h3>${chip(r.rating)}</div>
      <p class="status-line">${inc}${esc(L(st[0], st[1]))}.${special}</p>
      ${candList(r, ab, kind)}
    </section>`;
  }
  function houseHtml(st, ab) {
    const h = st.house, d = h.delegation, n = h.seats;
    const seg = (v, c, t) => (v ? `<span style="width:${(v / n) * 100}%;background:${c}" title="${esc(t)} ${v}"></span>` : "");
    const lh = liveState(ab) && liveState(ab).house;
    const liveLine = lh ? `<p class="muted">${L("Á kosninganótt", "Election night")}: ${lh.D || 0} D, ${lh.R || 0} R${lh.called != null ? `, ${L(`${n - lh.called} óráðin`, `${n - lh.called} uncalled`)}` : ""}.</p>` : "";
    const comp = h.competitive.length ? `<ul class="districts">${h.competitive.slice().sort((a, b) => ratingOrder(a.rating) - ratingOrder(b.rating)).map((x) => `
        <li><span class="dn">${esc(ab)}-${esc(x.district === "AL" ? L("allt", "AL") : x.district)}</span>
        <span>${x.newSeat ? `<span class="muted">${L("Nýtt kjördæmi eftir endurskipan", "New district after redistricting")}</span>`
          : `${esc(x.incumbent || L("Laust sæti", "Vacant seat"))}${x.party ? ` (${esc(x.party === "I" ? L("óh.", "ind.") : x.party)})` : ""}${x.open ? ` <span class="muted">${L("· opið sæti", "· open seat")}</span>` : ""}`}</span>
        ${chip(x.rating)}</li>`).join("")}</ul>`
      : `<p class="muted">${L("Cook Political Report metur ekkert kjördæmi í fylkinu tvísýnt.", "The Cook Political Report rates no district in the state as competitive.")}</p>`;
    return `<h3 class="sub">${L("Fulltrúadeild", "House")}</h3>
      <p class="muted">${n} ${L(n === 1 ? "sæti" : "sæti", n === 1 ? "seat" : "seats")}. ${L("Núverandi þingmenn", "Current delegation")}: ${d.D} D, ${d.R} R${d.I ? `, ${d.I} ${L("óháður", "independent")}` : ""}${d.vacant ? `, ${d.vacant} ${L("laust", "vacant")}` : ""}.</p>
      <div class="bar deleg">${seg(d.D, "var(--dem3)", "D")}${seg(d.I, "var(--ind)", "I")}${seg(d.vacant, "var(--rule)", L("laust", "vacant"))}${seg(d.R, "var(--rep3)", "R")}</div>
      ${liveLine}
      <p class="muted" style="margin-top:12px">${L("Tvísýn kjördæmi að mati Cook Political Report:", "Competitive districts per the Cook Political Report:")}</p>
      ${comp}`;
  }
  async function openState(ab) {
    const s = S.byAbbr.get(ab), st = S.races.states[ab];
    S.lastFocus = document.activeElement;
    S.active = ab;
    const races = st.senate.map((r) => raceHtml(r, ab, "senate")).join("") + (st.governor ? raceHtml(st.governor, ab, "governor") : "");
    $("panel-body").innerHTML = `<h2 id="panel-title">${esc(stName(s))}</h2>
      <p class="leaders">${esc([st.senate.length ? L("Öldungadeild", "Senate") : "", st.governor ? L("ríkisstjóri", "governor") : "", L("fulltrúadeild", "House")].filter(Boolean).join(", "))} · ${esc(dateLong(S.races.electionDate))}</p>
      ${races || `<p class="summary">${L("Hvorki er kosið til öldungadeildar né um ríkisstjóra í fylkinu í ár.", "There is no Senate or governor's race in the state this year.")}</p>`}
      ${houseHtml(st, ab)}
      <h3 class="sub">${L("Fréttir úr fylkinu", "News from the state")}</h3>
      <div id="state-news"><p class="muted">${L("Sæki fyrirsagnir…", "Loading headlines…")}</p></div>
      <p class="reviewed">${L("Mat á kosningum", "Race ratings")}: <a href="${esc(S.races.ratingSource.url)}" target="_blank" rel="noopener">${esc(S.races.ratingSource.name)}</a>. ${L("Frambjóðendur og staða eftir Wikipedia, sem vísar í kjörstjórnir hvers fylkis. Gögn sótt", "Candidates and status from Wikipedia, which cites each state's election office. Data retrieved")} ${esc(dateLong(S.races.updated))}.</p>`;
    $("panel").hidden = false; $("scrim").hidden = false; $("panel").scrollTop = 0; $("panel-close").focus();
    paint();
    try { history.replaceState(null, "", "#" + ab.toLowerCase()); } catch (_) {}
    if (window.chatContext) window.chatContext("country", "USA", L("Bandaríkin", "United States"));
    let n;
    try { n = await fetch(`/data/us/news/${ab}.json`, { cache: "no-cache" }).then((r) => r.json()); } catch (_) { n = null; }
    if (S.active !== ab) return;
    const li = (x, src) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="src">${esc(src || x.outlet)} · ${esc(ago(x.published))}</span></li>`;
    $("state-news").innerHTML = !n ? `<p class="muted">${L("Engar fyrirsagnir fundust.", "No headlines found.")}</p>` : `
      <p class="muted"><a href="${esc(n.site)}" target="_blank" rel="noopener">${esc(n.outlet)}</a> ${L("fjallar um stjórnmál fylkisins (óhagnaðardrifinn fréttamiðill).", "covers the state's politics (nonprofit newsroom).")}</p>
      ${n.local.length ? `<ol class="headlines compact">${n.local.slice(0, 8).map((x) => li(x, n.outlet)).join("")}</ol>` : `<p class="muted">${L("Engar kosningafréttir þaðan síðustu daga.", "No election stories from there in recent days.")}</p>`}
      <p class="muted" style="margin-top:14px">${L("Í landsmiðlum:", "In national outlets:")}</p>
      ${n.national.length ? `<ol class="headlines compact">${n.national.slice(0, 6).map((x) => li(x)).join("")}</ol>` : `<p class="muted">${L("Engar fyrirsagnir í landsmiðlum nefna fylkið eða frambjóðendur þess síðustu daga.", "No national headlines name the state or its candidates in recent days.")}</p>`}
      <p class="muted">${L("Aðeins fyrirsagnir og hlekkir á upprunalegar fréttir.", "Headlines and links to the original stories only.")}</p>`;
  }
  function closePanel() {
    $("panel").hidden = true; $("scrim").hidden = true; S.active = null; paint();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
    if (window.chatContext) window.chatContext("general");
  }
  $("panel-close").addEventListener("click", closePanel);
  $("scrim").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) closePanel(); });

  // ---------- balance of power ----------
  function stack(groups, total, mid) {
    return `<div class="bar" role="img" aria-label="${esc(groups.filter((g) => g.v).map((g) => `${g.t} ${g.v}`).join(", "))}">
      ${groups.map((g) => (g.v ? `<span style="width:${(g.v / total) * 100}%;background:${g.c}"></span>` : "")).join("")}${mid ? `<i class="mid"></i>` : ""}</div>
      <ul class="bar-key">${groups.filter((g) => g.v).map((g) => `<li><i style="--c:${g.c}"></i>${esc(g.t)} <b>${g.v}</b></li>`).join("")}</ul>`;
  }
  function tally(kind) {
    const t = { Solid_D: 0, Likely_D: 0, Lean_D: 0, Tossup: 0, Lean_R: 0, Likely_R: 0, Solid_R: 0 };
    for (const st of Object.values(S.races.states)) {
      for (const r of kind === "senate" ? st.senate : st.governor ? [st.governor] : []) {
        const x = r.rating; if (!x) continue;
        const k = x.rating === "Tossup" ? "Tossup" : `${x.rating === "Tilt" ? "Lean" : x.rating}_${x.party}`;
        t[k] = (t[k] || 0) + 1;
      }
    }
    return t;
  }
  function ratingGroups(t, notUpD, notUpR) {
    return [
      { v: notUpD, c: "color-mix(in srgb, var(--dem3) 55%, var(--surface))", t: L("D, ekki í kjöri", "D, not up") },
      { v: t.Solid_D, c: "var(--dem3)", t: L("Öruggt D", "Solid D") }, { v: t.Likely_D, c: "var(--dem2)", t: L("Líklegt D", "Likely D") },
      { v: t.Lean_D, c: "var(--dem1)", t: L("Hallar D", "Lean D") }, { v: t.Tossup, c: "var(--toss)", t: L("Óráðið", "Toss-up") },
      { v: t.Lean_R, c: "var(--rep1)", t: L("Hallar R", "Lean R") }, { v: t.Likely_R, c: "var(--rep2)", t: L("Líklegt R", "Likely R") },
      { v: t.Solid_R, c: "var(--rep3)", t: L("Öruggt R", "Solid R") },
      { v: notUpR, c: "color-mix(in srgb, var(--rep3) 55%, var(--surface))", t: L("R, ekki í kjöri", "R, not up") },
    ];
  }
  function renderCards() {
    const sb = S.races.senateBefore, gb = S.races.governorsBefore, hb = S.races.houseBefore;
    const up = { D: 0, R: 0, I: 0 };
    for (const st of Object.values(S.races.states)) for (const r of st.senate) up[r.incumbentParty === "Republican" ? "R" : r.incumbentParty === "Democratic" ? "D" : "I"]++;
    const notUpR = (sb.Republican || 0) - up.R, notUpD = (sb.Democratic || 0) + (sb.Independent || 0) - up.D - up.I;
    const gUp = { D: 0, R: 0 };
    for (const st of Object.values(S.races.states)) if (st.governor) gUp[st.governor.incumbentParty === "Republican" ? "R" : "D"]++;
    const lv = S.live || {};
    const liveLine = (o, label) => (o ? `<p>${L("Á kosninganótt", "Election night")}: <b>${o.D || 0} D</b>, <b>${o.R || 0} R</b>${o.I ? `, <b>${o.I} ${L("óh.", "ind.")}</b>` : ""} ${label}</p>` : "");
    const poll = S.usa && S.usa.poll;
    const pollLine = poll ? (() => {
      const ps = S.usa.parties || [];
      const v = (abbr) => (ps.find((p) => p.abbr === abbr) || {}).pollValue;
      const d = v("DEM") ?? v("D"), r = v("GOP") ?? v("R");
      return d != null && r != null ? `<p>${L("Almenn þingkönnun", "Generic ballot")}: <b>D ${String(d).replace(".", EN ? "." : ",")}%</b>, <b>R ${String(r).replace(".", EN ? "." : ",")}%</b> (${esc(poll.pollster)}, ${esc(dateLong(poll.date))}).</p>` : "";
    })() : "";
    const hT = S.races.states, comp = { D: 0, R: 0, T: 0 };
    for (const st of Object.values(hT)) for (const x of st.house.competitive) { if (x.rating.rating === "Tossup") comp.T++; else comp[x.rating.party]++; }
    $("cards").innerHTML = `
      <article class="card"><h3>${L("Öldungadeild", "Senate")}</h3>
        <p class="big"><span class="r">${sb.Republican} R</span> · <span class="d">${sb.Democratic} D</span> · <span class="i">${sb.Independent || 0} ${L("óh.", "ind.")}</span></p>
        <p>${L(`<b>${Object.values(up).reduce((a, b) => a + b, 0)} sæti</b> í kjöri (${up.R} repúblikana, ${up.D + up.I} demókrata). Óháðu þingmennirnir tveir starfa með demókrötum. Demókratar þurfa 51 sæti til að ná meirihluta, því varaforsetinn, repúblikaninn JD Vance, sker úr á jöfnu.`,
          `<b>${Object.values(up).reduce((a, b) => a + b, 0)} seats</b> up (${up.R} Republican-held, ${up.D + up.I} Democratic-held). The two independents caucus with the Democrats. Democrats need 51 seats for a majority, because Vice President JD Vance, a Republican, breaks ties.`)}</p>
        ${stack(ratingGroups(tally("senate"), notUpD, notUpR), 100, true)}
        ${liveLine(lv.senate, L("í nýrri deild.", "in the new chamber."))}</article>
      <article class="card"><h3>${L("Fulltrúadeild", "House")}</h3>
        <p class="big"><span class="r">${hb.R} R</span> · <span class="d">${hb.D} D</span>${hb.I ? ` · <span class="i">${hb.I} ${L("óh.", "ind.")}</span>` : ""}</p>
        <p>${L(`Öll <b>435 sæti</b> í kjöri; 218 þarf til meirihluta. ${hb.vacant ? `${hb.vacant} sæti eru laus. ` : ""}Cook Political Report metur <b>${comp.T}</b> kjördæmi óráðin, ${comp.D} hallandi eða líkleg hjá demókrötum og ${comp.R} hjá repúblikönum.`,
          `All <b>435 seats</b> up; 218 for a majority. ${hb.vacant ? `${hb.vacant} seats are vacant. ` : ""}The Cook Political Report rates <b>${comp.T}</b> districts as toss-ups, ${comp.D} leaning or likely Democratic and ${comp.R} leaning or likely Republican.`)}</p>
        ${stack([{ v: hb.D, c: "var(--dem3)", t: "D" }, { v: hb.I, c: "var(--ind)", t: L("Óháður", "Independent") }, { v: hb.vacant, c: "var(--rule)", t: L("Laust", "Vacant") }, { v: hb.R, c: "var(--rep3)", t: "R" }], 435, true)}
        ${pollLine}${liveLine(lv.house, L("sæti unnin.", "seats won."))}</article>
      <article class="card"><h3>${L("Ríkisstjórar", "Governors")}</h3>
        <p class="big"><span class="r">${gb.Republican} R</span> · <span class="d">${gb.Democratic} D</span></p>
        <p>${L(`Kosið í <b>${gUp.R + gUp.D} fylkjum</b> (${gUp.R} undir stjórn repúblikana, ${gUp.D} demókrata).`, `<b>${gUp.R + gUp.D} states</b> vote (${gUp.R} with Republican governors, ${gUp.D} Democratic).`)}</p>
        ${stack(ratingGroups(tally("governor"), gb.Democratic - gUp.D, gb.Republican - gUp.R), 50, true)}
        ${liveLine(lv.governors, L("ríkisstjórar.", "governors."))}</article>`;
  }

  // ---------- key races ----------
  function renderRaces() {
    const rows = [];
    for (const [ab, st] of Object.entries(S.races.states)) {
      for (const r of st.senate) rows.push({ ab, kind: "senate", r });
      if (st.governor) rows.push({ ab, kind: "governor", r: st.governor });
    }
    const close = rows.filter((x) => x.r.rating && (x.r.rating.rating === "Tossup" || x.r.rating.rating === "Lean" || x.r.rating.rating === "Tilt"))
      .sort((a, b) => ratingOrder(a.r.rating) - ratingOrder(b.r.rating) || stName(S.byAbbr.get(a.ab)).localeCompare(stName(S.byAbbr.get(b.ab)), EN ? "en" : "is"));
    const group = (kind, title) => {
      const xs = close.filter((x) => x.kind === kind);
      return `<div class="race-group"><h3>${title} (${xs.length})</h3><ul class="rows">${xs.map((x) => `<li class="race-row"><button type="button" data-ab="${x.ab}">
        <span class="race-state">${esc(stName(S.byAbbr.get(x.ab)))}${x.r.special ? ` <small class="muted">${L("aukak.", "special")}</small>` : ""}</span>
        <span class="race-who">${x.r.candidates.slice(0, 2).map((c) => `${esc(c.name)} <small>(${esc(PARTY[c.party] ? PARTY[c.party].short : c.party)})</small>`).join(L(" gegn ", " vs "))}${x.r.status !== "running" ? ` <small>· ${L("opið sæti", "open seat")}</small>` : ""}</span>
        ${chip(x.r.rating)}</button></li>`).join("")}</ul></div>`;
    };
    $("race-list").innerHTML = group("senate", L("Öldungadeild", "Senate")) + group("governor", L("Ríkisstjórar", "Governors"));
    $("race-list").onclick = (e) => { const b = e.target.closest("button[data-ab]"); if (b) openState(b.dataset.ab); };
  }

  // ---------- national headlines ----------
  async function renderNational() {
    let n;
    try { n = await fetch("/data/us/news/index.json", { cache: "no-cache" }).then((r) => r.json()); } catch (_) { n = null; }
    if (!n || !n.national.length) { $("national").innerHTML = `<li>${L("Engar fyrirsagnir fundust.", "No headlines found.")}</li>`; return; }
    $("national").innerHTML = n.national.slice(0, 16).map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="src">${esc(x.outlet)} · ${esc(ago(x.published))}</span></li>`).join("");
  }

  // ---------- lede ----------
  function renderLede() {
    const days = Math.round((new Date(S.races.electionDate + "T00:00:00Z") - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);
    const when = days > 1 ? L(`eftir ${days} daga`, `in ${days} days`) : days === 1 ? L("á morgun", "tomorrow") : days === 0 ? L("í dag", "today") : "";
    $("kicker").textContent = `${dateLong(S.races.electionDate)}${when ? " · " + when : ""}`;
    const sen = count("senate"), gov = count("governor");
    let txt = L(`Bandaríkjamenn kjósa um <b>öll 435 sæti fulltrúadeildarinnar</b>, <b>${sen} af 100 sætum öldungadeildarinnar</b> og <b>ríkisstjóra í ${gov} fylkjum</b>. Repúblikanar ráða báðum deildum þingsins. Veldu fylki til að sjá frambjóðendur, mat á kosningunum og fréttir heimamiðla.`,
      `Americans elect <b>all 435 House seats</b>, <b>${sen} of 100 Senate seats</b> and <b>governors in ${gov} states</b>. Republicans control both chambers of Congress. Pick a state for its candidates, race ratings and local news.`);
    if (S.live) {
      const st = { "polls-open": L("Kjörstaðir opnir", "Polls open"), "counting": L("Talning stendur yfir", "Count under way"), "final": L("Lokatölur", "Final results") }[S.live.status] || L("Talning stendur yfir", "Count under way");
      txt = `<span class="live-lede"><i></i>${esc(st)}</span> ${esc(EN ? S.live.headline || "" : S.live.headlineIs || S.live.headline || "")} ` + txt;
    }
    $("lede").innerHTML = txt;
    $("fineprint").innerHTML = L(`Mat á kosningum: <a href="${esc(S.races.ratingSource.url)}" target="_blank" rel="noopener">Cook Political Report</a>. Frambjóðendur, núverandi þingmenn og staða eftir Wikipedia (${S.races.sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(", ")}), sótt ${esc(dateLong(S.races.updated))}. Fréttir úr fylkjum koma frá States Newsroom og samstarfsmiðlum, óhagnaðardrifnum fréttastofum sem fjalla um stjórnmál hvers fylkis; landsmiðlar eru valdir úr ólíkum áttum. Aðeins fyrirsagnir og hlekkir eru birtir.`,
      `Race ratings: <a href="${esc(S.races.ratingSource.url)}" target="_blank" rel="noopener">Cook Political Report</a>. Candidates, current members and status from Wikipedia (${S.races.sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(", ")}), retrieved ${esc(dateLong(S.races.updated))}. State news comes from States Newsroom and partner outlets, nonprofit newsrooms covering each state's politics; national outlets are drawn from across the spectrum. Headlines and links only.`);
  }

  // ---------- live polling ----------
  function pollLive() {
    fetch("/data/us/live.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((lv) => {
      const changed = JSON.stringify(lv) !== JSON.stringify(S.live);
      S.live = lv && lv.status ? lv : null;
      if (changed) { renderLede(); renderCards(); paint(); if (S.active) openState(S.active); }
      if (S.live && S.live.status !== "final") setTimeout(pollLive, 60000);
    });
  }

  // ---------- boot ----------
  Promise.all([
    fetch("/data/us/races.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("/data/us/states_meta.json").then((r) => r.json()),
    fetch("/assets/us-states-albers-10m.json").then((r) => r.json()),
    fetch("/data/us/live.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/data/elections.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => null),
  ]).then(([races, meta, us, live, el]) => {
    S.races = races; S.meta = meta; S.live = live && live.status ? live : null;
    S.usa = el && (el.countries || []).find((c) => c.iso3 === "USA");
    for (const s of meta.states) { S.byAbbr.set(s.abbr, s); S.byFips.set(s.fips, s); }
    renderLede(); renderMap(us); renderCards(); renderRaces(); renderNational();
    if (S.live && S.live.status !== "final") setTimeout(pollLive, 60000);
    const h = location.hash.slice(1).toUpperCase();
    if (h && S.byAbbr.has(h)) openState(h);
    window.addEventListener("hashchange", () => { const x = location.hash.slice(1).toUpperCase(); if (x && S.byAbbr.has(x) && x !== S.active) openState(x); });
  }).catch((err) => {
    console.error(err);
    $("lede").textContent = L("Ekki tókst að sækja gögnin. Endurhlaðið síðuna.", "The data could not be loaded. Refresh the page.");
  });
})();
