(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const M = ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ágú.", "sep.", "okt.", "nóv.", "des."];
  const dateShort = (s) => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()}. ${M[d.getUTCMonth()]}`; };
  const TAG = { kosningar: "Kosningar", fjarmal: "Fjármál" };
  let items = [], filter = "all", current = null, ELECTIONS = null, MEDIA = { companies: {}, people: {}, flags: {} }, KITS = { companies: {} };
  function pickImage(i) {
    if (i.section === "fjarmal") {
      const tk = (i.link || "").split("#")[1]; const T = tk && tk.toUpperCase();
      const m = T && !(KITS.companies[T] && KITS.companies[T].logoAllowed === false) && MEDIA.companies[T];
      return m ? { m, cls: "is-logo", kind: "Merki" } : null;
    }
    if (!i.iso3) return null;
    const text = `${i.titleIs} ${i.summaryIs || ""}`;
    let best = null;
    for (const [k, m] of Object.entries(MEDIA.people)) {
      const [iso, name] = k.split("|");
      const sur = name.split(" ").filter((w) => w.length > 3).pop();
      const at = iso === i.iso3 && sur ? text.indexOf(sur) : -1;
      if (at >= 0 && (!best || at < best.at)) best = { at, m, name };
    }
    if (best) return { m: best.m, cls: "", kind: "Mynd", alt: best.name };
    const fl = MEDIA.flags[i.iso3];
    return fl ? { m: fl, cls: "is-flag", kind: "Fáni" } : null;
  }
  const thumb = (i) => { const p = pickImage(i); if (!p) return "";
    return `<figure class="thumb ${p.cls}"><img src="${esc(p.m.thumb)}" alt="${esc(p.alt || "")}" loading="lazy"><figcaption class="credit">${p.kind}: <a href="${esc(p.m.page)}" target="_blank" rel="noopener">${esc(p.m.author)}</a>${p.m.author === "Almenningseign" ? "" : ", " + esc(p.m.license)}</figcaption></figure>`; };
  try { filter = localStorage.getItem("frettir.filter") || "all"; } catch (_) {}

  function render() {
    document.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    const list = items.filter((i) => (filter === "all" || i.section === filter) && i !== current);
    $("news").innerHTML = list.length ? list.map((i) => {
      if (i.kind === "sjónarhorn") return perspectiveHtml(i);
      const src = i.kind === "frétt"
        ? `Heimild: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.paywall ? ' <span class="basis">(krefst áskriftar)</span>' : ""}`
        : i.source ? `Úr gögnum síðunnar. Frumgagn: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.ai ? ". Unnið með gervigreind, tölur sannreyndar" : ""}` : "Úr gögnum síðunnar";
      return `<li>
        <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">${esc(TAG[i.section] || i.section)}</span></time>
        <div>
          ${thumb(i)}
          <h3><a href="${esc(postUrl(i))}" data-post="${esc(i.id)}">${esc(i.titleIs)}</a></h3>
          ${i.summaryIs ? `<p>${esc(i.summaryIs)}</p>` : ""}
          <p class="src">${src}</p>
        </div></li>`;
    }).join("") : `<li>Engar fréttir í þessum flokki síðustu vikurnar.</li>`;
  }
  function perspectiveHtml(i) {
    const basis = (p) => p.paywall ? "krefst áskriftar" : "";
    return `<li class="persp-item">
      <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">Sjónarhorn</span></time>
      <div>
        ${thumb(i)}
        <h3><a href="${esc(postUrl(i))}" data-post="${esc(i.id)}">${esc(i.titleIs)}</a></h3>
        <p>${esc(i.summaryIs)}</p>
        <ul class="persp">${(i.perspectives || []).map((p) => `<li>
          <span class="persp-src"><span class="cc">${esc(nom(p.country))}</span> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.outlet)}</a> <span class="basis">${basis(p)}</span></span>
          <span>${esc(p.framingIs)}</span></li>`).join("")}</ul>
      </div></li>`;
  }

  // ---------- countries view ----------
  let NOM = {}, DAT = {}, hindex = null;
  const dat = (iso) => DAT[iso] || nom(iso);
  const nom = (iso) => NOM[iso] || iso;
  const TYPE_IS = (t) => ({ "public broadcaster": "almannaútvarp", "state media": "ríkismiðill", "state news agency": "ríkisfréttastofa",
    "state broadcaster": "ríkissjónvarp", "broadcaster (state-funded)": "ríkisfjármagnaður miðill", "news agency": "fréttastofa",
    "newspaper": "dagblað", "news site": "fréttavefur", "broadcaster": "sjónvarp", "magazine": "tímarit", "regional news site": "svæðisbundinn fréttavefur" }[t] || t);
  const hl = (r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener" lang="${esc(r.lang)}">${esc(r.title)}</a>
      <span class="hl-meta">${esc(r.outlet)} (${esc(TYPE_IS(r.type))})${r.published ? ", " + esc(dateShort(r.published.slice(0, 10))) : ""}</span></li>`;
  async function showCountry(iso) {
    $("land").value = iso;
    if (!current) try { history.replaceState(null, "", "#land=" + iso.toLowerCase()); } catch (_) {}
    if (window.chatContext) window.chatContext("country", iso, nom(iso));
    $("dom-h").textContent = `Innlendir miðlar í ${nom(iso)}`.replace(/ í (.*)$/, (m, n) => " · " + n);
    let d;
    try { d = await fetch(`/data/news/headlines/${iso}.json`, { cache: "no-cache" }).then((r) => r.json()); }
    catch (_) { $("dom").innerHTML = "<li>Engar fyrirsagnir fundust.</li>"; $("for").innerHTML = ""; return; }
    $("dom").innerHTML = d.domestic.length ? d.domestic.slice(0, 15).map(hl).join("")
      : `<li class="muted">Enginn innlendur miðill frá ${esc(nom(iso))} er enn í skránni okkar.</li>`;
    const groups = {};
    d.foreign.forEach((r) => (groups[r.outletCountry] = groups[r.outletCountry] || []).push(r));
    const order = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    $("for").innerHTML = order.length ? order.map((c) => `<div class="fgroup"><h4>${esc(nom(c))}</h4><ol class="hl">${groups[c].slice(0, 5).map(hl).join("")}</ol></div>`).join("")
      : `<p class="muted">Engar erlendar fyrirsagnir um ${esc(nom(iso))} síðustu sjö daga.</p>`;
    const persp = items.filter((i) => i.kind === "sjónarhorn" && i.iso3 === iso);
    if (persp.length) $("for").insertAdjacentHTML("afterbegin", `<ol class="feed news">${persp.map(perspectiveHtml).join("")}</ol>`);
  }
  async function initCountries() {
    try {
      hindex = await fetch("/data/news/headlines/index.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (_) { $("lond").hidden = true; return; }
    const list = hindex.countries.filter((c) => c.domestic + c.foreign > 0)
      .sort((a, b) => nom(a.iso3).localeCompare(nom(b.iso3), "is"));
    $("land").innerHTML = list.map((c) => `<option value="${esc(c.iso3)}">${esc(nom(c.iso3))} (${c.foreign} erl. · ${c.domestic} innl.)</option>`).join("");
    $("land").onchange = (e) => showCountry(e.target.value);
    const m = location.hash.match(/land=([a-z]{3})/i);
    const start = m ? m[1].toUpperCase() : current && current.iso3 ? current.iso3 : (list.find((c) => c.iso3 === "BRA") || list[0]).iso3;
    if (list.some((c) => c.iso3 === start)) showCountry(start);
    if (m && !current) $("lond").scrollIntoView();
  }


  // ---------- single news post: /frettir/<id> ----------
  const postUrl = (i) => "/frettir/" + encodeURIComponent(i.id);
  const idFromPath = () => { const m = location.pathname.match(/^\/frettir\/([^/]+)\/?$/); return m ? decodeURIComponent(m[1]) : null; };
  const dateLong = (s) => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()}. ${["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const loadElections = () => ELECTIONS || (ELECTIONS = fetch("/data/elections.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ countries: [] })));
  const TITLE = document.title;

  function sourceBlock(i) {
    if (i.kind === "frétt") return `<p class="post-src">Heimild: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.paywall ? ' <span class="basis">(krefst áskriftar)</span>' : ""}</p>
      <p class="post-note">Þetta er stutt endursögn með okkar eigin orðum. Lestu fréttina í heild hjá miðlinum.</p>
      <p><a class="post-btn" href="${esc(i.source.url)}" target="_blank" rel="noopener">Lesa fréttina hjá ${esc(i.source.name.replace(/ \(.*\)$/, ""))} ↗</a></p>`;
    if (i.kind === "sjónarhorn") return "";
    const base = i.source ? `Úr gögnum síðunnar. Frumgagn: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.ai ? ". Unnið með gervigreind, tölur sannreyndar" : ""}` : "Úr gögnum síðunnar";
    return `<p class="post-src">${base}</p>`;
  }
  function bigImage(i) {
    const p = pickImage(i); if (!p) return "";
    return `<figure class="post-img ${p.cls}"><img src="${esc(p.m.thumb)}" alt="${esc(p.alt || "")}"><figcaption class="credit">${p.kind}: <a href="${esc(p.m.page)}" target="_blank" rel="noopener">${esc(p.m.author)}</a>${p.m.author === "Almenningseign" ? "" : ", " + esc(p.m.license)}</figcaption></figure>`;
  }
  async function electionBox(i) {
    if (!i.iso3 || i.section !== "kosningar") return "";
    const c = ((await loadElections()).countries || []).find((x) => x.iso3 === i.iso3);
    if (!c) return "";
    const e = (c.upcoming && c.upcoming[0]) || null;
    const parties = (c.parties || []).filter((p) => p.pollValue !== null || p.polling).slice(0, 10);
    const poll = parties.some((p) => p.polling);
    const rows = parties.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td>${esc(p.leader || "")}</td>${poll ? `<td>${esc(p.polling || "")}</td>` : ""}</tr>`).join("");
    return `<aside class="post-box">
      <h2>Kosningarnar í ${esc(dat(i.iso3))}</h2>
      ${e ? `<p><strong>${esc(dateLong(e.date))}</strong> · ${esc(e.type)}${e.note ? `<br><span class="muted">${esc(e.note)}</span>` : ""}</p>` : ""}
      ${c.summary ? `<p>${esc(c.summary)}</p>` : ""}
      ${rows ? `<div class="post-table"><table class="qtable"><thead><tr><th>Flokkur / frambjóðandi</th><th>Leiðtogi</th>${poll ? "<th>Fylgi</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      <p><a class="post-btn" href="/#${esc(i.iso3.toLowerCase())}">Opna kosningakortið</a></p>
      <p class="note">Gögnin eru á ensku eins og á kosningakortinu. Síðast yfirfarið ${esc(c.lastReviewed || "")}.</p>
    </aside>`;
  }
  async function renderPost() {
    const post = $("post");
    document.body.classList.toggle("is-post", !!current || !!idFromPath());
    if (!idFromPath()) { post.hidden = true; post.innerHTML = ""; document.title = TITLE; $("news-h").textContent = "Nýjast"; $("news-h").classList.add("visually-hidden"); return; }
    $("news-h").textContent = "Aðrar fréttir"; $("news-h").classList.remove("visually-hidden");
    post.hidden = false;
    if (!current) {
      post.innerHTML = `<p><a href="/frettir" data-home>← Allar fréttir</a></p><h1 class="post-title">Fréttin fannst ekki</h1><p>Hún kann að vera orðin eldri en svo að hún birtist enn. Hér fyrir neðan eru nýjustu fréttirnar.</p>`;
      document.title = "Frétt fannst ekki · Fréttir"; return;
    }
    const i = current;
    const tag = i.kind === "sjónarhorn" ? "Sjónarhorn" : (TAG[i.section] || i.section);
    const persp = i.kind === "sjónarhorn" ? `<ul class="persp">${(i.perspectives || []).map((p) => `<li>
          <span class="persp-src"><span class="cc">${esc(nom(p.country))}</span> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.outlet)}</a>${p.published ? ` <span class="basis">${esc(dateShort(p.published))}</span>` : ""}</span>
          <span>${esc(p.framingIs)}</span></li>`).join("")}</ul>` : "";
    const fin = i.section === "fjarmal" && i.link ? `<p><a class="post-btn" href="${esc(i.link)}">Sjá fyrirtækið á fjármálasíðunni</a></p>` : "";
    post.innerHTML = `<p class="post-back"><a href="/frettir" data-home>← Allar fréttir</a></p>
      <p class="post-meta"><span class="tag tag-${esc(i.section)}">${esc(tag)}</span> <time datetime="${esc(i.date)}">${esc(dateLong(i.date))}</time>${i.iso3 ? ` · ${esc(nom(i.iso3))}` : ""}</p>
      <h1 class="post-title">${esc(i.titleIs)}</h1>
      ${bigImage(i)}
      ${i.summaryIs ? `<p class="post-lead">${esc(i.summaryIs)}</p>` : ""}
      ${persp}
      ${sourceBlock(i)}
      ${fin}
      <div id="post-extra"></div>
      ${relatedHtml(i)}`;
    document.title = `${i.titleIs} · Fréttir`;
    if (window.chatContext && i.iso3) window.chatContext("country", i.iso3, nom(i.iso3));
    const box = await electionBox(i);
    if (current === i && $("post-extra")) $("post-extra").innerHTML = box;
  }
  function relatedHtml(i) {
    if (!i.iso3) return "";
    const rel = items.filter((x) => x !== i && x.iso3 === i.iso3).slice(0, 6);
    if (!rel.length) return "";
    return `<section class="post-related"><h2>Fleiri fréttir frá ${esc(dat(i.iso3))}</h2><ol class="hl">${rel.map((x) =>
      `<li><a href="${esc(postUrl(x))}" data-post="${esc(x.id)}">${esc(x.titleIs)}</a><span class="hl-meta">${esc(dateShort(x.date))}${x.source && x.kind !== "yfirlit" ? " · " + esc(x.source.name) : ""}</span></li>`).join("")}</ol></section>`;
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
    e.preventDefault(); go(a.getAttribute("href"));
  });
  window.addEventListener("popstate", route);

  document.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter; try { localStorage.setItem("frettir.filter", filter); } catch (_) {} render();
  }));
  Promise.all([fetch("/data/news.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("/data/news/countries_is_nom.json").then((r) => r.json()).catch(() => ({})),
    fetch("/data/news/countries_is.json").then((r) => r.json()).catch(() => ({})),
    fetch("/data/media/media.json").then((r) => r.json()).catch(() => ({ companies: {}, people: {}, flags: {} })),
    fetch("/data/media/presskits.json").then((r) => r.json()).catch(() => ({ companies: {} }))]).then(([d, names, dative, media, kits]) => {
    NOM = names; DAT = dative; MEDIA = media; KITS = kits;
    items = d.items || [];
    $("updated").textContent = `Síðast uppfært ${d.updated.slice(0, 10)} kl. ${d.updated.slice(11, 16)} (UTC).`;
    route();
    initCountries();
  }).catch(() => { $("news").innerHTML = "<li>Ekki tókst að sækja fréttirnar. Endurhlaðið síðuna.</li>"; });
})();
