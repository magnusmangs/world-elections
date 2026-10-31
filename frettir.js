(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EN = window.LANG === "en";
  const L = (is, en) => (EN ? en : is);
  const M = EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ágú.", "sep.", "okt.", "nóv.", "des."];
  const dateShort = (s) => { const d = new Date(s + "T00:00:00Z"); return EN ? `${d.getUTCDate()} ${M[d.getUTCMonth()]}` : `${d.getUTCDate()}. ${M[d.getUTCMonth()]}`; };
  const TAG = EN ? { kosningar: "Elections", brennidepill: "Focus" } : { kosningar: "Kosningar", brennidepill: "Brennidepill" };
  const PERSP = L("Sjónarhorn", "Perspectives");
  // One language at a time: pick the reader's language for every text field.
  const title = (i) => (EN ? i.titleEn : i.titleIs) || "";
  const summary = (i) => (EN ? i.summaryEn : i.summaryIs) || "";
  const framing = (p) => (EN ? p.framingEn : p.framingIs) || "";
  const srcName = (i) => (EN && i.source.nameEn) || i.source.name;
  const T = (o, f) => (o ? (EN ? o[f] : (o[f + "Is"] || o[f])) : "");
  const author = (m) => m.author === "Almenningseign" ? L("Almenningseign", "Public domain") : m.author;
  let items = [], filter = "all", current = null, ELECTIONS = null, MEDIA = { companies: {}, people: {}, flags: {} }, KITS = { companies: {} };
  function pickImage(i) {
    if (!i.iso3) return null;
    const text = `${i.titleIs} ${i.summaryIs || ""} ${i.titleEn || ""} ${i.summaryEn || ""}`;
    let best = null;
    for (const [k, m] of Object.entries(MEDIA.people)) {
      const [iso, name] = k.split("|");
      const sur = name.split(" ").filter((w) => w.length > 3).pop();
      const at = iso === i.iso3 && sur ? text.indexOf(sur) : -1;
      if (at >= 0 && (!best || at < best.at)) best = { at, m, name };
    }
    if (best) return { m: best.m, cls: "", kind: L("Mynd", "Photo"), alt: best.name };
    const fl = MEDIA.flags[i.iso3];
    return fl ? { m: fl, cls: "is-flag", kind: L("Fáni", "Flag") } : null;
  }
  const thumb = (i) => { const p = pickImage(i); if (!p) return "";
    return `<figure class="thumb ${p.cls}"><img src="${esc(p.m.thumb)}" alt="${esc(p.alt || "")}" loading="lazy"><figcaption class="credit">${p.kind}: <a href="${esc(p.m.page)}" target="_blank" rel="noopener">${esc(author(p.m))}</a>${p.m.author === "Almenningseign" ? "" : ", " + esc(p.m.license)}</figcaption></figure>`; };
  try { filter = localStorage.getItem("frettir.filter") || "all"; } catch (_) {}

  function render() {
    document.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    const list = items.filter((i) => (filter === "all" || i.section === filter) && i !== current);
    $("news").innerHTML = list.length ? list.map((i) => {
      if (i.kind === "sjónarhorn") return perspectiveHtml(i);
      const src = i.kind === "brennidepill" ? L("Mál krufið frá öllum hliðum: staðfest, umdeilt og hvernig miðlar segja frá", "A story taken apart from every side: confirmed, disputed and how outlets frame it")
        : i.kind === "frétt"
        ? `${L("Heimild", "Source")}: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(srcName(i))}</a>${i.paywall ? ` <span class="basis">${L("(krefst áskriftar)", "(subscription)")}</span>` : ""}`
        : i.source ? `${L("Úr gögnum síðunnar. Frumgagn", "From the site's own data. Primary source")}: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(srcName(i))}</a>${i.ai ? L(". Unnið með gervigreind, tölur sannreyndar", ". Prepared with AI, figures verified") : ""}` : L("Úr gögnum síðunnar", "From the site's own data");
      return `<li>
        <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">${esc(TAG[i.section] || i.section)}</span></time>
        <div>
          ${thumb(i)}
          <h3><a href="${esc(postUrl(i))}" data-post="${esc(i.id)}">${esc(title(i))}</a></h3>
          ${summary(i) ? `<p>${esc(summary(i))}</p>` : ""}
          <p class="src">${src}</p>
        </div></li>`;
    }).join("") : `<li>${L("Engar fréttir í þessum flokki síðustu vikurnar.", "No news in this category in recent weeks.")}</li>`;
  }
  function perspectiveHtml(i) {
    const basis = (p) => p.paywall ? L("krefst áskriftar", "subscription") : "";
    return `<li class="persp-item">
      <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">${PERSP}</span></time>
      <div>
        ${thumb(i)}
        <h3><a href="${esc(postUrl(i))}" data-post="${esc(i.id)}">${esc(title(i))}</a></h3>
        <p>${esc(summary(i))}</p>
        <ul class="persp">${(i.perspectives || []).map((p) => `<li>
          <span class="persp-src"><span class="cc">${esc(nom(p.country))}</span> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.outlet)}</a> <span class="basis">${basis(p)}</span></span>
          <span>${esc(framing(p))}</span></li>`).join("")}</ul>
      </div></li>`;
  }

  // ---------- countries view ----------
  let NOM = {}, DAT = {}, hindex = null;
  const dat = (iso) => DAT[iso] || nom(iso);
  const nom = (iso) => NOM[iso] || iso;
  const TYPE_IS = (t) => EN ? t : ({ "public broadcaster": "almannaútvarp", "state media": "ríkismiðill", "state news agency": "ríkisfréttastofa",
    "state broadcaster": "ríkissjónvarp", "broadcaster (state-funded)": "ríkisfjármagnaður miðill", "news agency": "fréttastofa",
    "newspaper": "dagblað", "news site": "fréttavefur", "broadcaster": "sjónvarp", "magazine": "tímarit", "regional news site": "svæðisbundinn fréttavefur" }[t] || t);
  const hl = (r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener" lang="${esc(r.lang)}">${esc(r.title)}</a>
      <span class="hl-meta">${esc(r.outlet)} (${esc(TYPE_IS(r.type))})${r.published ? ", " + esc(dateShort(r.published.slice(0, 10))) : ""}</span></li>`;
  async function showCountry(iso) {
    const n = nom(iso);
    $("land").value = iso;
    if (!current) try { history.replaceState(null, "", "#land=" + iso.toLowerCase()); } catch (_) {}
    if (window.chatContext) window.chatContext("country", iso, nom(iso));
    $("dom-h").textContent = `${L("Innlendir miðlar", "Domestic media")} · ${n}`;
    let d;
    try { d = await fetch(`/data/news/headlines/${iso}.json`, { cache: "no-cache" }).then((r) => r.json()); }
    catch (_) { $("dom").innerHTML = `<li>${L("Engar fyrirsagnir fundust.", "No headlines found.")}</li>`; $("for").innerHTML = ""; return; }
    $("dom").innerHTML = d.domestic.length ? d.domestic.slice(0, 15).map(hl).join("")
      : `<li class="muted">${L(`Enginn innlendur miðill frá ${esc(dat(iso))} er enn í skránni okkar.`, `No domestic outlet from ${esc(n)} is in our registry yet.`)}</li>`;
    const groups = {};
    d.foreign.forEach((r) => (groups[r.outletCountry] = groups[r.outletCountry] || []).push(r));
    const order = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    $("for").innerHTML = order.length ? order.map((c) => `<div class="fgroup"><h4>${esc(nom(c))}</h4><ol class="hl">${groups[c].slice(0, 5).map(hl).join("")}</ol></div>`).join("")
      : `<p class="muted">${L(`Engar erlendar fyrirsagnir um ${esc(n)} síðustu sjö daga.`, `No foreign headlines about ${esc(n)} in the last seven days.`)}</p>`;
    const persp = items.filter((i) => i.kind === "sjónarhorn" && i.iso3 === iso);
    if (persp.length) $("for").insertAdjacentHTML("afterbegin", `<ol class="feed news">${persp.map(perspectiveHtml).join("")}</ol>`);
  }
  async function initCountries() {
    try {
      hindex = await fetch("/data/news/headlines/index.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (_) { $("lond").hidden = true; return; }
    const list = hindex.countries.filter((c) => c.domestic + c.foreign > 0)
      .sort((a, b) => nom(a.iso3).localeCompare(nom(b.iso3), window.LANG));
    $("land").innerHTML = list.map((c) => `<option value="${esc(c.iso3)}">${esc(nom(c.iso3))} (${c.foreign} ${L("erl.", "foreign")} · ${c.domestic} ${L("innl.", "domestic")})</option>`).join("");
    $("land").onchange = (e) => showCountry(e.target.value);
    const m = location.hash.match(/land=([a-z]{3})/i);
    const start = m ? m[1].toUpperCase() : current && current.iso3 ? current.iso3 : (list.find((c) => c.iso3 === "BRA") || list[0]).iso3;
    if (list.some((c) => c.iso3 === start)) showCountry(start);
    if (m && !current) $("lond").scrollIntoView();
  }


  // ---------- single news post: /frettir/<id> ----------
  // Brennidepill items open their own page (/brennidepill/<id>) instead of a news post.
  const postUrl = (i) => i.kind === "brennidepill" ? i.link : "/frettir/" + encodeURIComponent(i.id);
  const idFromPath = () => { const m = location.pathname.match(/^\/frettir\/([^/]+)\/?$/); return m ? decodeURIComponent(m[1]) : null; };
  const dateLong = (s) => { const d = new Date(s + "T00:00:00Z");
    if (EN) return `${d.getUTCDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return `${d.getUTCDate()}. ${["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const loadElections = () => ELECTIONS || (ELECTIONS = fetch("/data/elections.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ countries: [] })));
  const TITLE = document.title;

  function sourceBlock(i) {
    if (i.kind === "frétt") return `<p class="post-src">${L("Heimild", "Source")}: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(srcName(i))}</a>${i.paywall ? ` <span class="basis">${L("(krefst áskriftar)", "(subscription)")}</span>` : ""}</p>
      <p class="post-note">${L("Þetta er stutt endursögn með okkar eigin orðum. Lestu fréttina í heild hjá miðlinum.", "This is a short retelling in our own words. Read the full story at the outlet.")}</p>
      <p><a class="post-btn" href="${esc(i.source.url)}" target="_blank" rel="noopener">${L("Lesa fréttina hjá", "Read the story at")} ${esc(srcName(i).replace(/ \(.*\)$/, ""))} ↗</a></p>`;
    if (i.kind === "sjónarhorn") return "";
    const base = i.source ? `${L("Úr gögnum síðunnar. Frumgagn", "From the site's own data. Primary source")}: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(srcName(i))}</a>${i.ai ? L(". Unnið með gervigreind, tölur sannreyndar", ". Prepared with AI, figures verified") : ""}` : L("Úr gögnum síðunnar", "From the site's own data");
    return `<p class="post-src">${base}</p>`;
  }
  function bigImage(i) {
    const p = pickImage(i); if (!p) return "";
    return `<figure class="post-img ${p.cls}"><img src="${esc(p.m.thumb)}" alt="${esc(p.alt || "")}"><figcaption class="credit">${p.kind}: <a href="${esc(p.m.page)}" target="_blank" rel="noopener">${esc(author(p.m))}</a>${p.m.author === "Almenningseign" ? "" : ", " + esc(p.m.license)}</figcaption></figure>`;
  }
  async function electionBox(i) {
    if (!i.iso3 || i.section !== "kosningar") return "";
    const c = ((await loadElections()).countries || []).find((x) => x.iso3 === i.iso3);
    if (!c) return "";
    const e = (c.upcoming && c.upcoming[0]) || null;
    const parties = (c.parties || []).filter((p) => p.pollValue !== null || p.polling).slice(0, 10);
    const poll = parties.some((p) => p.polling);
    const rows = parties.map((p) => `<tr><th scope="row">${esc(T(p, "name"))}</th><td>${esc(p.leader || "")}</td>${poll ? `<td>${esc(T(p, "polling") || "")}</td>` : ""}</tr>`).join("");
    return `<aside class="post-box">
      <h2>${EN ? `The election in ${esc(c.name)}` : `Kosningarnar í ${esc(dat(i.iso3))}`}</h2>
      ${e ? `<p><strong>${esc(dateLong(e.date))}</strong> · ${esc(T(e, "type"))}${e.note ? `<br><span class="muted">${esc(T(e, "note"))}</span>` : ""}</p>` : ""}
      ${c.summary ? `<p>${esc(T(c, "summary"))}</p>` : ""}
      ${rows ? `<div class="post-table"><table class="qtable"><thead><tr><th>${L("Flokkur / frambjóðandi", "Party / candidate")}</th><th>${L("Leiðtogi", "Leader")}</th>${poll ? `<th>${L("Fylgi", "Polling")}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      <p><a class="post-btn" href="/#${esc(i.iso3.toLowerCase())}">${L("Opna kosningakortið", "Open the election map")}</a></p>
      <p class="note">${L("Síðast yfirfarið", "Last reviewed")} ${esc(c.lastReviewed ? dateLong(c.lastReviewed) : "")}.</p>
    </aside>`;
  }
  async function renderPost() {
    const post = $("post");
    document.body.classList.toggle("is-post", !!current || !!idFromPath());
    if (!idFromPath()) { post.hidden = true; post.innerHTML = ""; document.title = TITLE; $("news-h").textContent = L("Nýjast", "Latest"); $("news-h").classList.add("visually-hidden"); return; }
    $("news-h").textContent = L("Aðrar fréttir", "More news"); $("news-h").classList.remove("visually-hidden");
    post.hidden = false;
    if (!current) {
      post.innerHTML = `<p><a href="/frettir" data-home>← ${L("Allar fréttir", "All news")}</a></p><h1 class="post-title">${L("Fréttin fannst ekki", "Story not found")}</h1><p>${L("Hún kann að vera orðin eldri en svo að hún birtist enn. Hér fyrir neðan eru nýjustu fréttirnar.", "It may be too old to be listed any more. The latest news is below.")}</p>`;
      document.title = L("Frétt fannst ekki · Fréttir", "Story not found · News"); return;
    }
    const i = current;
    const tag = i.kind === "sjónarhorn" ? PERSP : (TAG[i.section] || i.section);
    const persp = i.kind === "sjónarhorn" ? `<ul class="persp">${(i.perspectives || []).map((p) => `<li>
          <span class="persp-src"><span class="cc">${esc(nom(p.country))}</span> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.outlet)}</a>${p.published ? ` <span class="basis">${esc(dateShort(p.published))}</span>` : ""}</span>
          <span>${esc(framing(p))}</span></li>`).join("")}</ul>` : "";
    const fin = "";
    post.innerHTML = `<p class="post-back"><a href="/frettir" data-home>← ${L("Allar fréttir", "All news")}</a></p>
      <p class="post-meta"><span class="tag tag-${esc(i.section)}">${esc(tag)}</span> <time datetime="${esc(i.date)}">${esc(dateLong(i.date))}</time>${i.iso3 ? ` · ${esc(nom(i.iso3))}` : ""}</p>
      <h1 class="post-title">${esc(title(i))}</h1>
      ${bigImage(i)}
      ${summary(i) ? `<p class="post-lead">${esc(summary(i))}</p>` : ""}
      ${persp}
      ${sourceBlock(i)}
      ${fin}
      <div id="post-extra"></div>
      ${relatedHtml(i)}`;
    document.title = `${title(i)} · ${L("Fréttir", "News")}`;
    if (window.chatContext && i.iso3) window.chatContext("country", i.iso3, nom(i.iso3));
    const box = await electionBox(i);
    if (current === i && $("post-extra")) $("post-extra").innerHTML = box;
  }
  function relatedHtml(i) {
    if (!i.iso3) return "";
    const rel = items.filter((x) => x !== i && x.iso3 === i.iso3).slice(0, 6);
    if (!rel.length) return "";
    return `<section class="post-related"><h2>${L(`Fleiri fréttir frá ${esc(dat(i.iso3))}`, `More news from ${esc(nom(i.iso3))}`)}</h2><ol class="hl">${rel.map((x) =>
      `<li><a href="${esc(postUrl(x))}" data-post="${esc(x.id)}">${esc(title(x))}</a><span class="hl-meta">${esc(dateShort(x.date))}${x.source && x.kind !== "yfirlit" ? " · " + esc(srcName(x)) : ""}</span></li>`).join("")}</ol></section>`;
  }
  function route() {
    const id = idFromPath();
    current = id ? items.find((x) => x.id === id) || null : null;
    renderPost(); render();
  }
  function go(url) {
    try { history.pushState(null, "", url); } catch (_) { location.href = url; return; }
    route(); window.scrollTo(0, 0);
    if (current && current.iso3 && $("land").querySelector(`option[value="${current.iso3}"]`)) showCountry(current.iso3);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-post], a[data-home], #home");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (!a.getAttribute("href").startsWith("/frettir")) return;
    e.preventDefault(); go(a.getAttribute("href"));
  });
  window.addEventListener("popstate", route);

  document.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter; try { localStorage.setItem("frettir.filter", filter); } catch (_) {} render();
  }));
  Promise.all([fetch("/data/news.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch(EN ? "/data/news/countries_en.json" : "/data/news/countries_is_nom.json").then((r) => r.json()).catch(() => ({})),
    fetch("/data/news/countries_is.json").then((r) => r.json()).catch(() => ({})),
    fetch("/data/media/media.json").then((r) => r.json()).catch(() => ({ companies: {}, people: {}, flags: {} })),
    fetch("/data/media/presskits.json").then((r) => r.json()).catch(() => ({ companies: {} }))]).then(([d, names, dative, media, kits]) => {
    NOM = names; DAT = EN ? names : dative; MEDIA = media; KITS = kits;
    // English readers only see items that have English text.
    items = (d.items || []).filter((i) => title(i));
    $("updated").textContent = L(`Síðast uppfært ${dateLong(d.updated.slice(0, 10))} kl. ${d.updated.slice(11, 16)} (UTC).`, `Last updated ${dateLong(d.updated.slice(0, 10))} at ${d.updated.slice(11, 16)} UTC.`);
    route();
    initCountries();
  }).catch(() => { $("news").innerHTML = `<li>${L("Ekki tókst að sækja fréttirnar. Endurhlaðið síðuna.", "The news could not be loaded. Refresh the page.")}</li>`; });
})();
