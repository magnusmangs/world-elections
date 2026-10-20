(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const M = ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ágú.", "sep.", "okt.", "nóv.", "des."];
  const dateShort = (s) => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()}. ${M[d.getUTCMonth()]}`; };
  const TAG = { kosningar: "Kosningar", fjarmal: "Fjármál" };
  let items = [], filter = "all", MEDIA = { companies: {}, people: {}, flags: {} }, KITS = { companies: {} };
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
    const list = items.filter((i) => filter === "all" || i.section === filter);
    $("news").innerHTML = list.length ? list.map((i) => {
      const href = i.link || (i.source && i.source.url) || "#";
      const ext = !i.link;
      if (i.kind === "sjónarhorn") return perspectiveHtml(i);
      const src = i.kind === "frétt"
        ? `Heimild: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.paywall ? ' <span class="basis">(krefst áskriftar)</span>' : ""}`
        : i.source ? `Úr gögnum síðunnar. Frumgagn: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.ai ? ". Unnið með gervigreind, tölur sannreyndar" : ""}` : "Úr gögnum síðunnar";
      return `<li>
        <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">${esc(TAG[i.section] || i.section)}</span></time>
        <div>
          ${thumb(i)}
          <h3><a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(i.titleIs)}</a></h3>
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
        <h3>${esc(i.titleIs)}</h3>
        <p>${esc(i.summaryIs)}</p>
        <ul class="persp">${(i.perspectives || []).map((p) => `<li>
          <span class="persp-src"><span class="cc">${esc(nom(p.country))}</span> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.outlet)}</a> <span class="basis">${basis(p)}</span></span>
          <span>${esc(p.framingIs)}</span></li>`).join("")}</ul>
      </div></li>`;
  }

  // ---------- countries view ----------
  let NOM = {}, hindex = null;
  const nom = (iso) => NOM[iso] || iso;
  const TYPE_IS = (t) => ({ "public broadcaster": "almannaútvarp", "state media": "ríkismiðill", "state news agency": "ríkisfréttastofa",
    "state broadcaster": "ríkissjónvarp", "broadcaster (state-funded)": "ríkisfjármagnaður miðill", "news agency": "fréttastofa",
    "newspaper": "dagblað", "news site": "fréttavefur", "broadcaster": "sjónvarp", "magazine": "tímarit", "regional news site": "svæðisbundinn fréttavefur" }[t] || t);
  const hl = (r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener" lang="${esc(r.lang)}">${esc(r.title)}</a>
      <span class="hl-meta">${esc(r.outlet)} (${esc(TYPE_IS(r.type))})${r.published ? ", " + esc(dateShort(r.published.slice(0, 10))) : ""}</span></li>`;
  async function showCountry(iso) {
    $("land").value = iso;
    try { history.replaceState(null, "", "#land=" + iso.toLowerCase()); } catch (_) {}
    $("dom-h").textContent = `Innlendir miðlar í ${nom(iso)}`.replace(/ í (.*)$/, (m, n) => " · " + n);
    let d;
    try { d = await fetch(`data/news/headlines/${iso}.json`, { cache: "no-cache" }).then((r) => r.json()); }
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
      hindex = await fetch("data/news/headlines/index.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (_) { $("lond").hidden = true; return; }
    const list = hindex.countries.filter((c) => c.domestic + c.foreign > 0)
      .sort((a, b) => nom(a.iso3).localeCompare(nom(b.iso3), "is"));
    $("land").innerHTML = list.map((c) => `<option value="${esc(c.iso3)}">${esc(nom(c.iso3))} (${c.foreign} erl. · ${c.domestic} innl.)</option>`).join("");
    $("land").onchange = (e) => showCountry(e.target.value);
    const m = location.hash.match(/land=([a-z]{3})/i);
    const start = m ? m[1].toUpperCase() : (list.find((c) => c.iso3 === "BRA") || list[0]).iso3;
    if (list.some((c) => c.iso3 === start)) showCountry(start);
    if (m) $("lond").scrollIntoView();
  }

  document.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter; try { localStorage.setItem("frettir.filter", filter); } catch (_) {} render();
  }));
  Promise.all([fetch("data/news.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/news/countries_is_nom.json").then((r) => r.json()).catch(() => ({})),
    fetch("data/media/media.json").then((r) => r.json()).catch(() => ({ companies: {}, people: {}, flags: {} })),
    fetch("data/media/presskits.json").then((r) => r.json()).catch(() => ({ companies: {} }))]).then(([d, names, media, kits]) => {
    NOM = names; MEDIA = media; KITS = kits;
    items = d.items || [];
    $("updated").textContent = `Síðast uppfært ${d.updated.slice(0, 10)} kl. ${d.updated.slice(11, 16)} (UTC).`;
    render();
    initCountries();
  }).catch(() => { $("news").innerHTML = "<li>Ekki tókst að sækja fréttirnar. Endurhlaðið síðuna.</li>"; });
})();
