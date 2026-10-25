(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EN = window.LANG === "en";
  const L = (is, en) => (EN ? en : is);
  const MONTHS = EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ágú.", "sep.", "okt.", "nóv.", "des."];
  const MONTHS_LONG = EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const LABELS = EN ? {
    revenue: "Revenue", operatingIncome: "Operating income", netIncome: "Net income", eps: "Earnings per share (diluted)",
    operatingCashFlow: "Operating cash flow", capex: "Capital expenditure", cash: "Cash and equivalents", longTermDebt: "Long-term debt",
  } : {
    revenue: "Tekjur", operatingIncome: "Rekstrarhagnaður", netIncome: "Hagnaður", eps: "Hagnaður á hlut (þynntur)",
    operatingCashFlow: "Handbært fé frá rekstri", capex: "Fjárfesting í rekstrarfjármunum", cash: "Handbært fé", longTermDebt: "Langtímaskuldir",
  };
  // SEC industry (SIC) descriptions in Icelandic. Unknown ones fall back to the SEC's English text.
  const SECTOR_IS = {
    "Electronic Computers": "Tölvuframleiðsla", "Fire, Marine & Casualty Insurance": "Vátryggingar",
    "Motor Vehicles & Passenger Car Bodies": "Bílaframleiðsla", "National Commercial Banks": "Viðskiptabankar",
    "Petroleum Refining": "Olíuhreinsun", "Pharmaceutical Preparations": "Lyfjaframleiðsla",
    "Retail-Catalog & Mail-Order Houses": "Netverslun og póstverslun", "Retail-Variety Stores": "Smásala (vöruhús)",
    "Semiconductors & Related Devices": "Hálfleiðarar", "Services-Business Services, NEC": "Viðskiptaþjónusta",
    "Services-Computer Programming, Data Processing, Etc.": "Hugbúnaður og gagnavinnsla",
    "Services-Prepackaged Software": "Hugbúnaður", "Services-Video Tape Rental": "Streymisþjónusta og afþreying",
  };
  const sector = (s) => EN ? s : (SECTOR_IS[s] || s);
  const KIND_EN = { "8-K": "Earnings release", "10-Q": "Quarterly report", "10-K": "Annual report" };
  const kind = (f) => EN ? (f.kindEn || KIND_EN[f.form.slice(0, 4).replace("/", "")] || f.kind) : f.kind;
  const headline = (i) => (EN ? i.headlineEn : i.headlineIs) || i.headlineIs;
  const summ = (o) => (EN ? o.summaryEn : o.summaryIs) || "";
  const aiLabel = (ai) => EN ? "Figures extracted from the earnings release with AI and verified word for word against the original text." : ai.label;
  const KEY = "fjarmal.watch.v1";
  let MEDIA = { companies: {} }, KITS = { companies: {} };
  const credit = (m, kind) => m ? `<p class="credit">${kind}: <a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.author === "Almenningseign" ? L("Almenningseign", "Public domain") : m.author)}</a>, ${esc(m.license)} (Wikimedia Commons)${m.trademark ? L(". Vörumerki fyrirtækisins", ". The company's trademark") : ""}</p>` : "";
  const logoOk = (tk) => !(KITS.companies[tk] && KITS.companies[tk].logoAllowed === false);
  const logo = (tk, name) => { const m = logoOk(tk) && MEDIA.companies[tk];
    return `<span class="logo">${m ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : `<span class="logo-fallback">${esc(name.slice(0, 1))}</span>`}</span>`; };
  let state = { index: null, feed: [], rate: null, filter: "all", watch: new Set(), lastFocus: null, feedShown: 25 };

  // Per-viewer watchlist lives only in this browser (no account, nothing sent to a server).
  try { state.watch = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (_) {}
  const saveWatch = () => { try { localStorage.setItem(KEY, JSON.stringify([...state.watch])); } catch (_) {} };
  try { const f = localStorage.getItem("fjarmal.filter"); if (f) state.filter = f; } catch (_) {}

  // Number format by hand so it never depends on the browser's locale data: Icelandic 1.234,5, English 1,234.5.
  const nf = (x, d = 1) => {
    const [i, f] = Math.abs(x).toFixed(d).split(".");
    return (x < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, EN ? "," : ".") + (f ? (EN ? "." : ",") + f : "");
  };
  const d = (s) => new Date(s + "T00:00:00Z");
  const dot = EN ? "" : ".";
  const dateShort = (s) => { const x = d(s); return `${x.getUTCDate()}${dot} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
  const dateLong = (s) => { const x = d(s); return `${x.getUTCDate()}${dot} ${MONTHS_LONG[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
  function usd(v) {
    if (v == null) return "–";
    const a = Math.abs(v);
    if (EN) return a >= 1e9 ? `${v < 0 ? "−" : ""}$${nf(a / 1e9)}bn` : `${v < 0 ? "−" : ""}$${nf(a / 1e6, 0)}m`;
    if (a >= 1e9) return `${nf(v / 1e9)} ma. USD`;
    return `${nf(v / 1e6, 0)} m. USD`;
  }
  function isk(v) {
    if (v == null || !state.rate) return "";
    const k = v * state.rate;
    if (EN) return Math.abs(k) >= 1e9 ? `ISK ${nf(k / 1e9, 0)}bn` : `ISK ${nf(k / 1e6, 0)}m`;
    return Math.abs(k) >= 1e9 ? `${nf(k / 1e9, 0)} ma. kr.` : `${nf(k / 1e6, 0)} m. kr.`;
  }
  function yoy(p) {
    if (p == null) return "";
    const cls = p > 0 ? "up" : p < 0 ? "down" : "";
    const sign = p > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${nf(p)}% ${L("milli ára", "year on year")}</span>`;
  }

  // ---------- companies ----------
  function renderCompanies() {
    const list = state.index.companies.filter((c) => state.filter === "all" || state.watch.has(c.ticker));
    $("mine-hint").hidden = !(state.filter === "mine" && !list.length);
    document.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === state.filter)));
    $("companies").innerHTML = list.map((c) => `<li><button type="button" class="co" data-tk="${esc(c.ticker)}">
        <span class="co-top"><span class="co-id">${logo(c.ticker, c.name)}<span class="co-name">${state.watch.has(c.ticker) ? `<span class="star" aria-label="${L("Fylgst með", "Following")}">●</span> ` : ""}${esc(c.name)}</span></span><span class="co-tk">${esc(c.ticker)}</span></span>
        <span class="co-rev">${esc(usd(c.revenue))}</span>
        <span class="co-meta">${L("Tekjur á fjórðungi til", "Quarterly revenue to")} ${esc(dateShort(c.periodEnd))}<br>${yoy(c.revenueYoY)}</span>
      </button></li>`).join("");
  }
  $("companies").addEventListener("click", (e) => { const b = e.target.closest("[data-tk]"); if (b) openCompany(b.dataset.tk); });
  document.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => {
    state.filter = b.dataset.filter;
    try { localStorage.setItem("fjarmal.filter", state.filter); } catch (_) {}
    renderCompanies(); renderFeed();
  }));

  // ---------- feed ----------
  function renderFeed() {
    const items = state.feed.filter((i) => state.filter === "all" || state.watch.has(i.ticker));
    const shown = items.slice(0, state.feedShown);
    $("feed").innerHTML = shown.length ? shown.map((i) => `<li>
        <time datetime="${esc(i.filed)}">${esc(dateShort(i.filed))}</time>
        <div>
          <h3><button type="button" data-tk="${esc(i.ticker)}">${esc(headline(i))}</button></h3>
          ${summ(i) ? `<p>${esc(summ(i))}</p>` : ""}
          ${i.ai && i.ai.status === "verified" ? `<p class="ai-label">${esc(aiLabel(i.ai))}</p>` : ""}
          <p class="src">${esc(kind(i))} (${esc(i.form)}${i.periodEnd ? `, ${L("tímabil til", "period to")} ${esc(dateShort(i.periodEnd))}` : ""}). <a href="${esc(i.url)}" target="_blank" rel="noopener">${L("Frumgagn hjá SEC", "Original at the SEC")}</a></p>
        </div></li>`).join("") + (items.length > state.feedShown ? `<li class="more"><button type="button" class="pill" id="more">${L("Sýna fleiri", "Show more")}</button></li>` : "")
      : `<li>${L("Engin skil frá fyrirtækjum sem þú fylgist með. Veldu „Öll“ til að sjá allt.", "No filings from companies you follow. Choose “All” to see everything.")}</li>`;
    const m = $("more"); if (m) m.onclick = () => { state.feedShown += 25; renderFeed(); };
  }
  $("feed").addEventListener("click", (e) => { const b = e.target.closest("button[data-tk]"); if (b) openCompany(b.dataset.tk); });

  // ---------- company panel ----------
  async function openCompany(tk) {
    state.lastFocus = document.activeElement;
    const body = $("panel-body");
    body.innerHTML = `<p>${L("Sæki gögn…", "Loading…")}</p>`;
    showPanel();
    let c;
    try { c = await fetch(`data/finance/companies/${encodeURIComponent(tk)}.json`, { cache: "no-cache" }).then((r) => r.json()); }
    catch (_) { body.innerHTML = `<p>${L(`Ekki tókst að sækja gögn fyrir ${esc(tk)}. Reyndu aftur.`, `Could not load data for ${esc(tk)}. Try again.`)}</p>`; return; }
    const m = c.latest.metrics;
    const following = state.watch.has(c.ticker);
    const fcf = m.operatingCashFlow && m.capex ? m.operatingCashFlow.value - m.capex.value : null;
    const kpi = (label, v, extra = "", money = true) => v == null ? "" : `<div><dt>${esc(label)}</dt><dd>${money ? esc(usd(v)) : esc(nf(v, 2) + " USD")}<small>${money ? esc(isk(v)) : ""}${extra ? (money ? " · " : "") + extra : ""}</small></dd></div>`;
    const maxRev = Math.max(...c.quarters.map((q) => q.metrics.revenue?.value || 0));
    body.innerHTML = `
      <div class="panel-logo">${logo(c.ticker, c.name)}<div><h2 id="panel-title">${esc(c.name)}</h2>
      <p class="leaders">${esc(c.ticker)} · ${esc(sector(c.sector))}</p></div></div>
      ${logoOk(c.ticker) ? credit(MEDIA.companies[c.ticker], L("Merki", "Logo")) : ""}
      <button type="button" class="follow" id="follow" aria-pressed="${following}">${following ? L("Fylgist með", "Following") : L("Fylgjast með", "Follow")}</button>
      ${(() => {
        const r = state.feed.find((i) => i.ticker === c.ticker && i.form === "8-K" && i.ai && i.ai.status === "verified" && i.periodEnd > c.latest.periodEnd);
        return r ? `<div class="fresh"><h3>${L("Nýjasta afkomutilkynning", "Latest earnings release")} (${esc(dateShort(r.filed))})</h3><p>${esc(summ(r))}</p><p class="ai-label">${esc(aiLabel(r.ai))} <a href="${esc(r.ai.exhibit)}" target="_blank" rel="noopener">${L("Frumtexti", "Original text")}</a></p></div><h3>${L("Síðasta formlega uppgjör", "Latest formal report")}</h3>` : "";
      })()}
      <p class="summary">${esc(summ(c))}</p>
      <h3>${L("Ársfjórðungur til", "Quarter to")} ${esc(dateLong(c.latest.periodEnd))}</h3>
      <dl class="kpis">
        ${kpi(LABELS.revenue, m.revenue?.value, yoy(m.revenue?.yoy))}
        ${kpi(LABELS.netIncome, m.netIncome?.value, yoy(m.netIncome?.yoy))}
        ${kpi(LABELS.operatingIncome, m.operatingIncome?.value, yoy(m.operatingIncome?.yoy))}
        ${m.eps ? kpi(LABELS.eps, m.eps.value, yoy(m.eps.yoy), false) : ""}
        ${kpi(L("Frjálst sjóðstreymi", "Free cash flow"), fcf)}
        ${kpi(LABELS.cash, m.cash?.value)}
      </dl>
      ${c.ttm && c.ttm.revenue ? `<p class="note">${L("Síðustu 12 mánuðir: tekjur", "Last 12 months: revenue")} ${esc(usd(c.ttm.revenue))}${c.ttm.netIncome != null ? `, ${L("hagnaður", "net income")} ${esc(usd(c.ttm.netIncome))}` : ""}.</p>` : ""}
      <h3>${L("Síðustu ársfjórðungar", "Recent quarters")}</h3>
      <table class="qtable"><thead><tr><th>${L("Tímabil til", "Period to")}</th><th>${LABELS.revenue}</th><th>${LABELS.netIncome}</th></tr></thead><tbody>
        ${c.quarters.slice().reverse().map((q) => `<tr><td>${esc(dateShort(q.periodEnd))}</td>
          <td><span class="bar" style="width:${maxRev ? Math.round(((q.metrics.revenue?.value || 0) / maxRev) * 48) : 0}px"></span>${esc(usd(q.metrics.revenue?.value))}</td>
          <td>${esc(usd(q.metrics.netIncome?.value))}</td></tr>`).join("")}
      </tbody></table>
      <h3>${L("Skil til SEC", "SEC filings")}</h3>
      <ol class="filings">${c.filings.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(kind(f))} (${esc(f.form)})</a>, ${esc(dateShort(f.filed))}</li>`).join("")}</ol>
      <p class="note">${L(`Tölur úr XBRL-gögnum í skilum ${esc(c.name)} til SEC. Sumir fjórðungar eru reiknaðir sem mismunur á uppsöfnuðum tölum (t.d. fjórði fjórðungur = árið að frádregnum níu mánuðum). Gengi: ${state.rate ? nf(state.rate, 2) : "–"} kr. á USD.`,
        `Figures from the XBRL data in ${esc(c.name)}'s SEC filings. Some quarters are derived from cumulative figures (for example, fourth quarter = full year less nine months). Exchange rate: ISK ${state.rate ? nf(state.rate, 2) : "–"} per USD.`)}</p>
      ${KITS.companies[c.ticker] ? `<p class="press"><a href="${esc(KITS.companies[c.ticker].pressRoom)}" target="_blank" rel="noopener">${L(`Fréttaherbergi og fjölmiðlaefni ${esc(c.name)}`, `${esc(c.name)} press room and media resources`)}</a></p>` : ""}
      <p class="reviewed"><a href="${esc(c.source)}" target="_blank" rel="noopener">${L(`Öll skil ${esc(c.name)} hjá SEC`, `All ${esc(c.name)} filings at the SEC`)}</a></p>`;
    $("follow").onclick = () => {
      if (state.watch.has(c.ticker)) state.watch.delete(c.ticker); else state.watch.add(c.ticker);
      saveWatch();
      const on = state.watch.has(c.ticker);
      $("follow").setAttribute("aria-pressed", String(on));
      $("follow").textContent = on ? L("Fylgist með", "Following") : L("Fylgjast með", "Follow");
      renderCompanies(); renderFeed();
    };
    try { history.replaceState(null, "", "#" + c.ticker.toLowerCase()); } catch (_) {}
    if (window.chatContext) window.chatContext("company", c.ticker, c.name);
  }
  function showPanel() { $("panel").hidden = false; $("scrim").hidden = false; $("panel").scrollTop = 0; $("panel-close").focus(); }
  function closePanel() {
    $("panel").hidden = true; $("scrim").hidden = true;
    if (window.chatContext) window.chatContext("general");
    try { history.replaceState(null, "", location.pathname); } catch (_) {}
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }
  $("panel-close").addEventListener("click", closePanel);
  $("scrim").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) closePanel(); });

  // ---------- boot ----------
  Promise.all([
    fetch("data/finance/index.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/finance/feed.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/media/media.json").then((r) => r.json()).catch(() => ({ companies: {} })),
    fetch("data/media/presskits.json").then((r) => r.json()).catch(() => ({ companies: {} })),
  ]).then(([index, feed, media, kits]) => {
    MEDIA = media; KITS = kits;
    state.index = index; state.feed = feed.items || []; state.rate = index.fx?.usdIsk;
    $("fx").textContent = index.fx ? L(`Gengi USD: ${nf(index.fx.usdIsk, 2)} kr. (Seðlabanki Íslands, ${dateLong(index.fx.date)}). ${index.companies.length} fyrirtæki.`,
      `USD rate: ISK ${nf(index.fx.usdIsk, 2)} (Central Bank of Iceland, ${dateLong(index.fx.date)}). ${index.companies.length} companies.`) : "";
    const u = new Date(index.updated.replace("Z", ":00Z"));
    $("updated").textContent = L(`Síðast uppfært ${dateLong(index.updated.slice(0, 10))} kl. ${index.updated.slice(11, 16)} (UTC).`, `Last updated ${dateLong(index.updated.slice(0, 10))} at ${index.updated.slice(11, 16)} UTC.`);
    renderCompanies(); renderFeed();
    const h = location.hash.slice(1).toUpperCase();
    if (h && index.companies.some((c) => c.ticker === h)) openCompany(h);
  }).catch(() => { $("companies").innerHTML = `<li>${L("Ekki tókst að sækja gögnin. Endurhlaðið síðuna.", "The data could not be loaded. Refresh the page.")}</li>`; });
})();
