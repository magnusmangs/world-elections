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

  // ---------- recent results ----------
  // A national vote held in the last 90 days with a decided winner colours the country by result instead of by its next vote:
  // one colour when a new party or person won, another when the incumbent held on. A first round with a run-off ahead has no
  // winner yet, so the country keeps its next-vote colour.
  const RESULT_DAYS = 90;
  function recentResult(c) {
    const le = c && c.lastElection;
    if (!le || !le.date || !["new", "incumbent"].includes(le.result)) return null;
    const d = daysUntil(le.date);
    return d < 0 && d >= -RESULT_DAYS ? le : null;
  }
  const resultColor = (le) => (le.result === "new" ? "var(--r-new)" : "var(--r-inc)");
  const resultLabel = (le) => (le.result === "new" ? L("Nýr sigurvegari", "New winner") : L("Sitjandi hélt velli", "Incumbent held on"));
  function fillFor(c) {
    if (!c) return null;
    if (isLive(c)) return "var(--s1)";
    const r = recentResult(c);
    if (r) return resultColor(r);
    const v = nextVote(c);
    return v ? tier(v.date) : null;
  }
  const onMap = (c) => !!(c && (isLive(c) || recentResult(c) || nextVote(c)));


  // ---------- live election night ----------
  // An optional `live` block on a country (exit polls, then the count) shown at the top of its panel.
  // data/live.json is re-fetched every minute while any count is open, so open pages update without a reload.
  const LIVE_POLL_MS = 60000;
  const isLive = (c) => !!(c && c.live && c.live.status !== "final");
  const LIVE_STATUS = {
    "polls-open": ["Kjörstaðir opnir", "Polls open"],
    "exit-poll": ["Útgönguspár", "Exit polls"],
    "counting": ["Talning stendur yfir", "Count under way"],
    "final": ["Lokatölur", "Final count"],
  };
  function liveTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const day = fmt(d.toISOString().slice(0, 10), { day: "numeric", month: "long", year: "numeric" });
    return EN ? `${hm} GMT, ${day}` : `kl. ${hm}, ${day}`;
  }
  function liveHtml(c) {
    const lv = c && c.live;
    if (!lv) return "";
    const st = LIVE_STATUS[lv.status] || LIVE_STATUS["counting"];
    const seatsUnit = lv.unit !== "percent";
    const byAbbr = new Map((c.parties || []).map((p) => [p.abbr || p.name, p]));
    const order = orderParties(c);
    const rows = (lv.results || []).filter((r) => typeof r.value === "number").sort((a, b) => b.value - a.value);
    const maj = c.chamber && c.chamber.majority;
    const max = Math.max(seatsUnit ? (maj || 0) : 40, ...rows.map((r) => r.value)) || 1;
    const fmtV = (v) => seatsUnit ? `${v}` : `${EN ? String(v) : String(v).replace(".", ",")}%`;
    const line = seatsUnit && maj ? `<span class="poll-maj" style="left:${(maj / max) * 100}%" title="${L("Meirihluti", "Majority")}"></span>` : "";
    const bars = rows.length ? `<ol class="poll-bars">${rows.map((r) => {
      const p = byAbbr.get(r.abbr);
      const name = p ? (p.abbr || T(p, "name")) : (EN ? r.abbr : (r.abbrIs || r.abbr));
      const full = p ? T(p, "name") : name;
      const color = p ? partyColor(p, order.indexOf(p)) : (r.color || "var(--land-line)");
      return `<li><span class="poll-name" title="${esc(full)}">${esc(name)}</span>
        <span class="poll-track"><span class="poll-bar" style="width:${Math.max(1, (r.value / max) * 100)}%;background:${color}"></span>${line}</span>
        <span class="poll-val">${esc(fmtV(r.value))}</span></li>`;
    }).join("")}</ol>` : "";
    const blocTotal = seatsUnit && c.chamber ? c.chamber.seats : 0;
    const blocs = (lv.blocs || []).length && blocTotal ? `<div class="live-blocs" role="img" aria-label="${esc(lv.blocs.map((b) => `${T(b, "name")} ${b.value}`).join(", "))}">
        <div class="live-bloc-bar">${lv.blocs.map((b) => `<span style="width:${(b.value / blocTotal) * 100}%;background:${b.color || "var(--land-line)"}" title="${esc(T(b, "name"))} ${b.value}"></span>`).join("")}
          ${maj ? `<i style="left:${(maj / blocTotal) * 100}%"></i>` : ""}</div>
        <ul class="hemi-key">${lv.blocs.map((b) => `<li><i style="background:${b.color || "var(--land-line)"}"></i>${esc(T(b, "name"))} <b>${b.value}</b></li>`).join("")}</ul>
      </div>` : "";
    const counted = typeof lv.counted === "number" ? ` ${L(`${String(lv.counted).replace(".", ",")}% atkvæða talin.`, `${lv.counted}% of votes counted.`)}` : "";
    return `<section class="live${lv.status === "final" ? " is-final" : ""}" aria-live="polite">
      <div class="live-head"><span class="live-tag">${lv.status === "final" ? "" : "<i></i>"}${esc(L(st[0], st[1]))}</span>
        <span class="live-upd">${L("Uppfært", "Updated")} ${esc(liveTime(lv.updated))}</span></div>
      ${lv.headline ? `<p class="live-headline">${esc(T(lv, "headline"))}</p>` : ""}
      ${blocs}
      ${bars}
      <p class="live-cap">${rows.length ? (seatsUnit ? L("Sæti", "Seats") : L("Fylgi", "Vote share")) + ", " : ""}${esc(T(lv, "sourceName"))}.${counted}${lv.note ? " " + esc(T(lv, "note")) : ""}${lv.source ? ` <a href="${esc(lv.source)}" target="_blank" rel="noopener">${L("Heimild", "Source")}</a>` : ""}
        ${lv.status === "final" ? "" : L(" Síðan uppfærist sjálfkrafa.", " This page refreshes on its own.")}</p>
    </section>`;
  }

  // ---------- email alerts (Brevo via /api/subscribe) ----------
  let subN = 0;
  function subscribeHtml(compact) {
    const id = `sub-${++subN}`;
    return `<form class="subscribe${compact ? " compact" : ""}" novalidate>
      ${compact ? `<p class="sub-lead">${L("Fáðu nýjar tölur í tölvupósti um leið og þær berast.", "Get new figures by email as they come in.")}</p>`
        : `<h3>${L("Kosningavaktin í tölvupósti", "Election alerts by email")}</h3><p class="sub-lead">${L("Á kosninganóttum sendum við útgönguspár og nýjar tölur jafnóðum og þær birtast hér á síðunni.", "On election nights we email exit polls and new figures as they are posted on this site.")}</p>`}
      <div class="sub-row">
        <label class="visually-hidden" for="${id}">${L("Netfang", "Email address")}</label>
        <input id="${id}" type="email" name="email" required autocomplete="email" placeholder="${L("netfang@daemi.is", "you@example.com")}">
        <button type="submit">${L("Skrá mig", "Sign up")}</button>
      </div>
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="sub-hp" aria-hidden="true">
      <label class="sub-consent"><input type="checkbox" name="consent"> ${L("Ég samþykki að fá tölvupóst um kosningar. Netfangið er geymt hjá Brevo og hægt er að afskrá sig með einum smelli í hverjum pósti.", "I agree to receive election emails. The address is stored with Brevo and every email has a one-click unsubscribe link.")}</label>
      <p class="sub-msg" role="status"></p>
    </form>`;
  }
  document.addEventListener("submit", (ev) => {
    const f = ev.target.closest("form.subscribe");
    if (!f) return;
    ev.preventDefault();
    const msg = f.querySelector(".sub-msg"), btn = f.querySelector("button");
    const email = f.email.value.trim();
    if (!f.consent.checked) { msg.textContent = L("Hakaðu við samþykkið til að skrá þig.", "Tick the consent box to sign up."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = L("Netfangið virðist ekki rétt.", "That email address does not look right."); return; }
    btn.disabled = true; msg.textContent = L("Augnablik…", "One moment…");
    fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, consent: true, lang: EN ? "en" : "is", website: f.website.value }) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { msg.textContent = ok ? j.message : (j.error || L("Ekki tókst að skrá þig.", "Sign-up failed.")); if (ok) f.reset(); })
      .catch(() => { msg.textContent = L("Ekki tókst að skrá þig. Reyndu aftur síðar.", "Sign-up failed. Please try again later."); })
      .finally(() => { btn.disabled = false; });
  });

  function startLivePolling() {
    let last = null;
    const tick = () => fetch("data/live.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).then((j) => {
      if (!j || !j.countries) return;
      const sig = JSON.stringify(j.countries);
      if (sig === last) return;
      last = sig;
      for (const [iso, lv] of Object.entries(j.countries)) {
        const c = state.byIso3.get(iso);
        if (c) c.live = lv;
      }
      renderLede();
      highlight();
      const box = document.getElementById("live-box");
      const c = state.active && state.byNumeric.get(state.active);
      if (box && c) box.innerHTML = liveHtml(c);
    }).catch(() => {});
    setInterval(() => { if (document.visibilityState !== "hidden" && state.data.countries.some(isLive)) tick(); }, LIVE_POLL_MS);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.data.countries.some(isLive)) tick(); });
  }

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
  // Brennidepill (focus) topics: a country with an open topic gets a link at the top of its panel.
  let FOCUS = [];
  const focusHtml = (c) => FOCUS.filter((t) => t.iso3 === c.iso3 && t.status !== "archived").map((t) =>
    `<a class="focus-link" href="/brennidepill/${encodeURIComponent(t.id)}"><span>${L("Í brennidepli", "In focus")}</span>${esc(T(t, "title"))}</a>`).join("");
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
      const r = recentResult(c);
      const result = r ? `<div class="vote result" style="--c:${resultColor(r)}">
          <div class="count">${L("Úrslit", "Result")}, ${esc(fmt(r.date, { day: "numeric", month: "long", year: "numeric" }))}. ${esc(T(r, "type"))}</div>
          <div class="winner">${esc(T(r, "winner"))}</div>
          <div class="badge"><i></i>${esc(resultLabel(r))}</div>
          ${r.outcome ? `<div class="note">${esc(T(r, "outcome"))}</div>` : ""}
        </div>` : "";
      const votes = (c.upcoming || []).map((e) => `<div class="vote" style="--c:${tier(e.date)}">
          <div class="when">${esc(whenText(e))}</div>
          <div class="count">${esc(countdown(e))}</div>
          <div class="type">${esc(T(e, "type"))}</div>
          ${e.note ? `<div class="note">${esc(T(e, "note"))}</div>` : ""}
        </div>`).join("");
      const hasParties = c.parties && c.parties.length;
      const parties = `<h3>${(c.upcoming || []).length ? L("Hverjir bjóða fram", "Who is running") : L("Helstu flokkar", "Main parties")}</h3>`
        + (c.noParties ? `<p class="no-parties">${esc(T(c, "noParties"))}</p>` : "")
        + (hasParties ? `<ul class="parties">${c.parties.map((p) => partyHtml(p, c.iso3)).join("")}</ul>`
          : (c.noParties ? "" : `<p class="no-parties">${L("Upplýsingar um flokka liggja ekki fyrir enn.", "Party information is not available yet.")}</p>`));
      body.innerHTML = `<h2 id="panel-title">${esc(cname(c))}</h2>
        <p class="leaders">${esc(T(c, "leaders"))}</p>
        <div id="live-box">${liveHtml(c)}</div>
        ${isLive(c) ? subscribeHtml(true) : ""}
        ${focusHtml(c)}
        ${result}
        ${votes}
        <p class="summary">${esc(T(c, "summary"))}</p>
        ${chamberHtml(c)}
        ${parties}
        ${c.iso3 === "USA" ? `<p class="summary"><a class="us-link" href="/bandarikin">${L("Opna kort af öllum fylkjunum: öldungadeild, ríkisstjórar, fulltrúadeild og fréttir úr hverju fylki", "Open the map of every state: Senate, governors, House and news from each state")}</a></p>` : ""}
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
      const v = c && nextVote(c), rr = recentResult(c);
      const res = rr ? `<br>${L("Sigurvegari", "Winner")}: ${esc(T(rr, "winner"))}<br>${esc(resultLabel(rr))}, ${esc(fmt(rr.date, { day: "numeric", month: "long", year: "numeric" }))}` : "";
      const next = v ? `<br>${rr ? L("Næst: ", "Next: ") : ""}${esc(T(v, "type"))}<br>${esc(whenText(v))}` : "";
      tip.innerHTML = `<b>${esc(name)}</b>` + (res || next ? res + next : `<br>${L("Engar kosningar næstu 12 mánuði", "No vote in the next 12 months")}`);
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
      .attr("class", (d) => "country" + (onMap(state.byNumeric.get(d.id)) ? " has-vote" : ""))
      .attr("d", path)
      .style("fill", (d) => fillFor(state.byNumeric.get(d.id)))
      .on("pointermove", showTip).on("pointerleave", hideTip).on("click", click);

    // Dots for small states that are hard to see or click.
    const small = countries.filter((d) => {
      const c = state.byNumeric.get(d.id);
      if (!onMap(c)) return false;
      const b = path.bounds(d); const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
      return area < 220 || ["583", "242", "132"].includes(d.id);
    });
    const soon = (d) => daysUntil(nextVote(state.byNumeric.get(d.id)).date) <= 14;
    const centre = (d) => projection(d3.geoCentroid(d));
    dots = g.selectAll("g.marker").data(small).join("g").attr("class", "marker")
      .attr("transform", (d) => `translate(${centre(d)})`);
    dots.append("circle").attr("class", "dot").attr("r", isNarrow ? 4 : 5.5)
      .style("fill", (d) => fillFor(state.byNumeric.get(d.id)))
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
      .filter((x) => x.e.dateStatus !== "expected" && !isLive(x.c)).sort((a, b) => a.e.date.localeCompare(b.e.date));
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
    const live = state.data.countries.filter(isLive);
    if (live.length) {
      text = live.map((c) => `<span class="live-lede"><i></i>${L("Í beinni", "Live")}:</span> <button type="button" data-iso="${c.iso3}">${esc(cname(c))}</button>, ${esc(L(...(LIVE_STATUS[c.live.status] || LIVE_STATUS.counting)).toLowerCase())}. `).join("") + text;
    }
    $("lede").innerHTML = text;
    $("lede").onclick = (e) => { const b = e.target.closest("button[data-iso]"); if (b) openPanel(state.byIso3.get(b.dataset.iso)); };
    const upd = fmt(state.data.updated, { day: "numeric", month: "long", year: "numeric" });
    if (!document.getElementById("subscribe-main")) $("fineprint").insertAdjacentHTML("beforebegin", `<div id="subscribe-main">${subscribeHtml(false)}</div>`);
    $("fineprint").textContent = L(`Gögn síðast uppfærð ${upd}. Nær til forseta- og þingkosninga á landsvísu. Samantektir um flokka eru skrifaðar með aðstoð gervigreindar upp úr opinberum heimildum sem vísað er í fyrir hvert land og eru uppfærðar vikulega.`,
      `Data last updated ${upd}. Covers national presidential, parliamentary and legislative elections. Party summaries are written with AI assistance from public sources linked in each country, and are refreshed weekly.`);
  }

  // ---------- boot ----------
  Promise.all([
    fetch("data/elections.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("assets/countries-50m.json").then((r) => r.json()),
    fetch("data/media/media.json").then((r) => r.json()).catch(() => ({ people: {} })),
    fetch("data/brennidepill/index.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ topics: [] })),
  ]).then(([data, world, media, focus]) => {
    MEDIA = media;
    FOCUS = focus.topics || [];
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
    startLivePolling();
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => renderMap(world), 200); });
    if (/[?&]skraning=stadfest/.test(location.search)) {
      const m = document.querySelector("#subscribe-main .sub-msg");
      if (m) { m.textContent = L("Takk, netfangið er staðfest. Þú ert á listanum.", "Thanks, your address is confirmed. You are on the list."); document.getElementById("subscribe-main").scrollIntoView(); }
    }
    const hash = location.hash.slice(1).toUpperCase();
    if (hash && state.byIso3.has(hash)) openPanel(state.byIso3.get(hash));
  }).catch((err) => {
    console.error(err);
    $("lede").textContent = L("Ekki tókst að sækja kosningagögnin. Endurhlaðið síðuna.", "The election data could not be loaded. Refresh the page to try again.");
  });
})();
