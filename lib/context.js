// Builds the factual context the chatbot may answer from. Plain Node, no dependencies.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch (_) { return fallback; }
};
const cut = (s, n) => (s && s.length > n ? s.slice(0, n) + "…" : s);

function countryContext(iso) {
  iso = String(iso || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const c = read(`data/countries/${iso}.json`);
  const news = (read("data/news/articles.json", { items: [] }).items || [])
    .filter((a) => a.iso3 === iso).slice(0, 8)
    .map((a) => ({ date: a.published, title: a.titleIs, summary: a.summaryIs, source: a.source, url: a.url,
      perspectives: a.perspectives ? a.perspectives.map((p) => ({ outlet: p.outlet, country: p.country, framing: p.framingIs, url: p.url })) : undefined }));
  if (!c) {
    if (!news.length) return null;
    const names = read("data/news/countries_is_nom.json", {});
    return { label: names[iso] || iso, data: { iso3: iso, note: "No national election data for this country on the site.", recentNews: news },
      links: [`/frettir#land=${iso.toLowerCase()}`] };
  }
  return {
    label: c.name,
    data: {
      country: c.name, leaders: c.leaders, summary: c.summary, elections: c.elections, lastElection: c.lastElection,
      parties: (c.parties || []).map((p) => ({ name: p.name, leader: p.leader, position: p.position, ideology: p.ideology,
        inGovernment: p.inGovernment, lastResult: p.lastResult, polling: p.polling, policies: p.policies })),
      noParties: c.noParties, sources: c.sources, lastReviewed: c.lastReviewed, recentNews: news,
    },
    links: [`/#${iso.toLowerCase()}`, `/frettir#land=${iso.toLowerCase()}`],
  };
}

function companyContext(ticker) {
  ticker = String(ticker || "").toUpperCase().replace(/[^A-Z.-]/g, "").slice(0, 8);
  const c = read(`data/finance/companies/${ticker}.json`);
  if (!c) return null;
  const feed = (read("data/finance/feed.json", { items: [] }).items || []).filter((i) => i.ticker === ticker).slice(0, 6);
  const releases = feed.filter((i) => i.ai && i.ai.status === "verified").map((i) => {
    const r = read(`data/finance/releases/${i.accession}.json`);
    return r && { filed: i.filed, periodEnd: r.result && r.result.periodEnd, summary: r.result && r.result.summaryIs,
      verifiedFigures: (r.verified || []).map((f) => ({ metric: f.metric, period: f.period, basis: f.basis, value: f.value, quote: f.quote })),
      source: r.exhibit };
  }).filter(Boolean);
  const fx = read("data/finance/index.json", {}).fx;
  return {
    label: c.name,
    data: {
      company: c.name, ticker: c.ticker, sector: c.sector, fiscalYearEnd: c.fiscalYearEnd,
      latestFormalQuarter: c.latest, last8Quarters: c.quarters, trailing12Months: c.ttm,
      summaryIs: c.summaryIs, earningsReleases: releases,
      filings: (c.filings || []).map((f) => ({ form: f.form, kind: f.kind, filed: f.filed, url: f.url })),
      usdIsk: fx, units: "All money values in USD unless stated; eps in USD per share.",
      sourceOfFigures: "SEC EDGAR XBRL company facts and the company's own filings", secPage: c.source,
    },
    links: [`/fjarmal#${ticker.toLowerCase()}`],
  };
}

function generalContext() {
  const news = read("data/news.json", { items: [] }).items || [];
  const el = read("data/elections.json", { countries: [] }).countries || [];
  return {
    label: "Fréttir",
    data: {
      upcomingElections: el.filter((c) => c.upcoming && c.upcoming.length).slice(0, 20)
        .map((c) => ({ country: c.name, iso3: c.iso3, next: c.upcoming[0] })),
      latestNews: news.slice(0, 25).map((i) => ({ date: i.date, section: i.section, title: i.titleIs, summary: cut(i.summaryIs, 400),
        source: i.source && i.source.name, url: i.source && i.source.url })),
    },
    links: ["/frettir"],
  };
}

function buildContext(kind, id) {
  if (kind === "country") return countryContext(id);
  if (kind === "company") return companyContext(id);
  return generalContext();
}

module.exports = { buildContext };
