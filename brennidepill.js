// Brennidepill (focus): stories emerging from a country, taken apart objectively.
// List: /brennidepill (data/brennidepill/index.json). Topic: /brennidepill/<id> (data/brennidepill/<id>.json).
// Data is validated by scripts/brennidepill.py; how to write a topic: BRENNIDEPILL.md.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EN = window.LANG === "en";
  const L = (is, en) => (EN ? en : is);
  const T = (o, f) => (o ? (EN ? o[f] : (o[f + "Is"] || o[f])) : "");
  const MONTHS = EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const dateLong = (s) => { const d = new Date(s.slice(0, 10) + "T00:00:00Z");
    return EN ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const stamp = (s) => `${dateLong(s)} ${L("kl.", "at")} ${s.slice(11, 16)} UTC`;
  const STATUS = { developing: L("Í gangi", "Developing"), settled: L("Yfirstaðið", "Settled"), archived: L("Í safni", "Archived") };
  const LEVEL = {
    confirmed: [L("Staðfest", "Confirmed"), L("Fleiri en einn miðill úr ólíkum áttum", "More than one outlet, from different camps")],
    single: [L("Ein heimild", "Single source"), L("Aðeins einn aðili eða miðill segir frá", "Only one party or outlet reports it")],
    disputed: [L("Umdeilt", "Disputed"), L("Frásagnir stangast á", "Accounts conflict")],
  };
  const CAMP = {
    liberal: L("Frjálslyndir", "Liberal"), centre: L("Miðja / einkamiðlar", "Centre / commercial"), right: L("Hægri", "Right"),
    left: L("Vinstri", "Left"), state: L("Ríkismiðill", "State media"), official: L("Opinber heimild", "Official"),
    intl: L("Erlendir", "International"), ref: L("Uppflettirit", "Reference"),
  };
  const CAMP_ORDER = ["liberal", "left", "centre", "state", "right", "official", "intl", "ref"];
  let NOM = {}, INDEX = { topics: [] };
  const nom = (iso) => NOM[iso] || iso;
  const idFromPath = () => { const m = location.pathname.match(/^\/brennidepill\/([^/]+)\/?$/); return m ? decodeURIComponent(m[1]) : null; };
  const TITLE = document.title;

  function listHtml() {
    if (!INDEX.topics.length) return `<li class="muted">${L("Ekkert mál í brennidepli eins og er.", "Nothing in focus right now.")}</li>`;
    return INDEX.topics.map((t) => `<li class="bd-card">
      <p class="bd-meta"><span class="bd-status is-${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span> <span class="cc">${esc(nom(t.iso3))}</span> ${L("Uppfært", "Updated")} ${esc(stamp(t.updated))}</p>
      <h3><a href="/brennidepill/${encodeURIComponent(t.id)}" data-topic>${esc(T(t, "title"))}</a></h3>
      <p>${esc(T(t, "dek"))}</p>
      <p class="bd-small">${t.sources} ${L("heimildir frá", "sources from")} ${t.outlets} ${L("miðlum", "outlets")}</p></li>`).join("");
  }

  // Source chips: superscript links to the cited articles.
  function cite(t, ids) {
    const by = Object.fromEntries(t.sources.map((s) => [s.id, s]));
    return (ids || []).length ? `<span class="bd-cite">${ids.map((id) => by[id]).filter(Boolean).map((s) =>
      `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}" class="camp-${esc(s.camp)}">${esc(s.outlet)}</a>`).join("")}</span>` : "";
  }
  const timeLabel = (r) => {
    const d = new Date(r.date + "T00:00:00Z");
    const day = EN ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}` : `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()].slice(0, 3)}.`;
    const yr = d.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : "";
    return `${day}${yr}${r.time ? `<br><span class="bd-small">${L("kl.", "")} ${esc(r.time)}</span>` : ""}`;
  };

  function topicHtml(t) {
    const sec = (id, is, en, body, intro) => body ? `<section class="bd-sec" id="${id}"><h2>${L(is, en)}</h2>${intro ? `<p class="bd-intro">${intro}</p>` : ""}${body}</section>` : "";
    const facts = (t.facts || []).map((f) => `<li class="lvl-${esc(f.level)}"><span class="bd-lvl" title="${esc(LEVEL[f.level][1])}">${esc(LEVEL[f.level][0])}</span>
      <span>${esc(T(f, "text"))} ${cite(t, f.src)}</span></li>`).join("");
    const sides = (t.sides || []).map((s) => `<div class="bd-side">
      <h3>${esc(T(s, "camp"))}</h3><p>${esc(T(s, "view"))}</p>
      ${s.quote ? `<blockquote><p>„${esc(T(s, "quote"))}“</p><footer>${esc(T(s, "quoteBy"))}</footer></blockquote>` : ""}
      <p>${cite(t, s.src)}</p></div>`).join("");
    const disputed = (t.disputed || []).map((d) => `<div class="bd-q">
      <h3>${esc(T(d, "q"))}</h3>
      <div class="bd-ab"><p><span class="bd-ab-tag">${L("Ein hlið", "One side")}</span>${esc(T(d, "a"))}</p><p><span class="bd-ab-tag">${L("Hin hliðin", "The other side")}</span>${esc(T(d, "b"))}</p></div>
      <p class="bd-verdict"><strong>${L("Staðan", "Where it stands")}:</strong> ${esc(T(d, "status"))} ${cite(t, d.src)}</p></div>`).join("");
    const media = (t.media || []).map((g) => `<div class="bd-frame">
      <h3>${esc(T(g, "group"))}</h3><p>${esc(T(g, "frame"))}</p><p>${cite(t, g.outlets)}</p></div>`).join("");
    const timeline = (t.timeline || []).map((r) => `<li><time datetime="${esc(r.date)}">${timeLabel(r)}</time><div>${esc(T(r, "text"))} ${cite(t, r.src)}</div></li>`).join("");
    const numbers = (t.numbers || []).map((n) => `<div class="bd-num"><strong>${esc(T(n, "value"))}</strong><span>${esc(T(n, "label"))}</span>${cite(t, n.src)}</div>`).join("");
    const next = (t.next || []).map((r) => `<li><time datetime="${esc(r.date)}">${timeLabel(r)}</time><div>${esc(T(r, "text"))} ${cite(t, r.src)}</div></li>`).join("");
    const unknowns = (t.unknowns || []).map((u) => `<li>${esc(T(u, "text"))}</li>`).join("");
    const groups = CAMP_ORDER.map((c) => [c, t.sources.filter((s) => s.camp === c)]).filter(([, l]) => l.length);
    const sources = groups.map(([c, l]) => `<div class="bd-srcgroup"><h3><span class="dot-camp camp-${c}"></span>${esc(CAMP[c])}</h3><ul>${l.map((s) =>
      `<li><a href="${esc(s.url)}" target="_blank" rel="noopener" lang="${esc(s.lang)}">${esc(s.title)}</a> <span class="bd-small">${esc(s.outlet)}</span></li>`).join("")}</ul></div>`).join("");
    const bottom = (EN ? t.bottomLine : t.bottomLineIs) || [];
    const toc = [["facts", "Staðfest og óstaðfest", "What we know"], ["sides", "Hvað hvor segir", "What each side says"], ["disputed", "Umdeilt", "Disputed"],
      ["media", "Hvernig miðlar segja frá", "How outlets frame it"], ["timeline", "Tímalína", "Timeline"], ["next", "Framundan", "What's next"], ["sources", "Heimildir", "Sources"]]
      .filter(([id]) => id === "sources" || (t[id] || []).length).map(([id, is, en]) => `<a href="#${id}">${L(is, en)}</a>`).join("");
    return `<p class="post-back"><a href="/brennidepill" data-home>← ${L("Öll mál", "All topics")}</a></p>
      <p class="bd-meta"><span class="bd-status is-${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span> <span class="cc">${esc(nom(t.iso3))}</span>
        ${L("Hófst", "Began")} ${esc(dateLong(t.started))} · ${L("Uppfært", "Updated")} ${esc(stamp(t.updated))}</p>
      <h1 class="post-title">${esc(T(t, "title"))}</h1>
      <p class="post-lead">${esc(T(t, "dek"))}</p>
      <nav class="bd-toc" aria-label="${L("Efni", "Contents")}">${toc}</nav>
      <section class="bd-bottom"><h2>${L("Í stuttu máli", "The short version")}</h2><ul>${bottom.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>
      ${numbers ? `<div class="bd-nums">${numbers}</div>` : ""}
      ${sec("facts", "Staðfest og óstaðfest", "What we know", facts ? `<ul class="bd-facts">${facts}</ul>` : "",
        L("Merkingin segir hve vel atriðið er staðfest, ekki hvort það skipti máli.", "The label says how well a point is established, not how much it matters."))}
      ${sec("sides", "Hvað hvor segir", "What each side says", sides ? `<div class="bd-sides">${sides}</div>` : "",
        L("Sjónarmið hvers hóps með þeirra eigin rökum, ekki okkar mat.", "Each group's position in its own terms, not our assessment."))}
      ${sec("disputed", "Umdeilt eða ósannreynt", "Disputed or unverified", disputed)}
      ${sec("media", "Hvernig miðlar segja frá", "How outlets frame it", media ? `<div class="bd-frames">${media}</div>` : "",
        L("Sami atburður, ólík framsetning. Lýsingin byggir á greinum sem voru lesnar.", "The same events, framed differently. Based on the articles read."))}
      ${sec("timeline", "Tímalína", "Timeline", timeline ? `<ol class="bd-tl">${timeline}</ol>` : "", L("Tímar eru að staðartíma.", "Times are local."))}
      ${sec("next", "Framundan", "What's next", next ? `<ol class="bd-tl">${next}</ol>` : "")}
      ${sec("unknowns", "Það sem enn er óljóst", "Still unclear", unknowns ? `<ul class="bd-unk">${unknowns}</ul>` : "")}
      <section class="bd-sec" id="sources"><h2>${L("Heimildir", "Sources")}</h2><p class="bd-intro">${esc(T(t, "method"))}</p><div class="bd-srcs">${sources}</div></section>`;
  }

  async function route() {
    const id = idFromPath();
    const topic = $("topic");
    $("head").hidden = !!id; $("list-box").hidden = !!id;
    if (!id) { topic.hidden = true; topic.innerHTML = ""; document.title = TITLE; $("list").innerHTML = listHtml(); return; }
    topic.hidden = false;
    const meta = INDEX.topics.find((x) => x.id === id);
    const t = meta ? await fetch(`/data/brennidepill/${encodeURIComponent(id)}.json`, { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).catch(() => null) : null;
    if (!t) {
      topic.innerHTML = `<p class="post-back"><a href="/brennidepill" data-home>← ${L("Öll mál", "All topics")}</a></p><h1 class="post-title">${L("Málið fannst ekki", "Topic not found")}</h1>`;
      return;
    }
    topic.innerHTML = topicHtml(t);
    document.title = `${T(t, "title")} · ${L("Brennidepill", "Focus")}`;
    if (window.chatContext) window.chatContext("country", t.iso3, nom(t.iso3));
  }
  function go(url) {
    try { history.pushState(null, "", url); } catch (_) { location.href = url; return; }
    route(); window.scrollTo(0, 0);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-topic], a[data-home], #home");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); go(a.getAttribute("href"));
  });
  window.addEventListener("popstate", route);
  Promise.all([fetch("/data/brennidepill/index.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch(EN ? "/data/news/countries_en.json" : "/data/news/countries_is_nom.json").then((r) => r.json()).catch(() => ({}))])
    .then(([idx, names]) => { INDEX = idx; NOM = names; route(); })
    .catch(() => { $("list").innerHTML = `<li>${L("Ekki tókst að sækja gögnin. Endurhlaðið síðuna.", "The data could not be loaded. Refresh the page.")}</li>`; });
})();
