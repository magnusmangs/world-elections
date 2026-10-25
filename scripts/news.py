#!/usr/bin/env python3
"""Build data/news.json for the Fréttir page.

The page is a merge of SECTIONS. Each section is a function that returns news items.
To add a new section of the site later, write one function and add it to SECTIONS.

Item shape: {id, section, kind, date, titleIs, summaryIs, titleEn, summaryEn, source:{name,nameEn?,url}|None, link}
The site shows one language at a time, so every item carries Icelandic and English text.
  kind = "frétt"   third-party reporting, summarised in our own words, outlet named and linked
         "yfirlit" generated from the site's own data

Third-party items are validated strictly (allowed outlet, https, date, short own-words summary,
no long quotations). Invalid items are printed and left out, and the script exits non-zero
with --strict so a scheduled task notices.
Usage: python3 scripts/news.py [--today YYYY-MM-DD] [--strict]
"""
import json, os, re, sys, glob, datetime
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS = os.path.join(ROOT, "data", "news")
MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"]


def today():
    if "--today" in sys.argv:
        return datetime.date.fromisoformat(sys.argv[sys.argv.index("--today") + 1])
    return datetime.date.today()


def date_is(s):
    d = datetime.date.fromisoformat(s)
    return f"{d.day}. {MONTHS[d.month - 1]}"


MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def date_en(s):
    d = datetime.date.fromisoformat(s)
    return f"{d.day} {MONTHS_EN[d.month - 1]}"


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return default


COUNTRY_IS = load(os.path.join(NEWS, "countries_is.json"), {})


def type_is(t):
    t = (t or "").lower()
    run = " (seinni umferð)" if "run-off" in t or "runoff" in t else ""
    if "presidential" in t and ("parliament" in t or "legislative" in t or "general" in t):
        return "Forseta- og þingkosningar" + run
    if "presidential" in t:
        return "Forsetakosningar" + run
    if "congressional" in t or "midterm" in t:
        return "Þingkosningar (miðkjörtímabil)"
    if "referend" in t:
        return "Þjóðaratkvæðagreiðsla"
    if "parliament" in t or "legislative" in t or "general" in t or "knesset" in t:
        return "Þingkosningar" + run
    return "Kosningar"


# ---------- validation for third-party items ----------
QUOTE = re.compile(r"[„\"“”«»']([^„\"“”«»']{20,})[\"“”«»']")
# English text uses apostrophes for possessives (Bulgaria's), so only double quotes count there.
QUOTE_EN = re.compile(r"[\"“”«»]([^\"“”«»]{20,})[\"“”«»]")


def validate_article(a, allowed, now):
    errs = []
    for k in ("id", "section", "published", "titleIs", "summaryIs", "titleEn", "summaryEn", "source", "url"):
        if not a.get(k):
            errs.append(f"missing {k}")
    if errs:
        return errs
    u = urlparse(a["url"])
    host = (u.hostname or "").lower()
    if u.scheme != "https":
        errs.append("url must be https")
    if not any(host == d or host.endswith("." + d) for d in allowed):
        errs.append(f"outlet {host} is not in data/news/sources.json")
    try:
        pub = datetime.date.fromisoformat(a["published"])
        if pub > now:
            errs.append("published date is in the future")
    except ValueError:
        errs.append("published must be YYYY-MM-DD")
    for lang in ("Is", "En"):
        s, t = a["summary" + lang], a["title" + lang]
        if len(s) > 420:
            errs.append(f"summary{lang} longer than 420 characters")
        if len(re.findall(r"(?<!\d)[.!?](\s|$)", s)) > 3:  # ignore ordinal dots in dates (25. október)
            errs.append(f"summary{lang} has more than 3 sentences")
        for q in (QUOTE if lang == "Is" else QUOTE_EN).findall(s + " " + t):
            if len(q.split()) > 15:
                errs.append("quotation longer than 15 words")
        if len(t) > 140:
            errs.append(f"title{lang} longer than 140 characters")
    if a.get("basis") != "article":
        errs.append("basis must be 'article': every item must rest on an article that was opened and read")
    if a.get("type") == "sjonarhorn":
        ps = a.get("perspectives") or []
        if len(ps) < 2 or len({p.get("country") for p in ps}) < 2:
            errs.append("perspective item needs at least 2 outlets from 2 different countries")
        for p in ps:
            ph = (urlparse(p.get("url", "")).hostname or "").lower()
            if not any(ph == d or ph.endswith("." + d) for d in allowed):
                errs.append(f"perspective outlet {ph} not allowed")
            if p.get("basis") != "article":
                errs.append("perspective must rest on an article that was opened and read (basis: article), not a headline")
            for key in ("framingIs", "framingEn"):
                f = p.get(key, "")
                if not f or len(f) > 260:
                    errs.append(f"perspective {key} missing or longer than 260 characters")
                for q in (QUOTE if key == "framingIs" else QUOTE_EN).findall(f):
                    if len(q.split()) > 15:
                        errs.append("quotation longer than 15 words")
    return errs


# ---------- sections ----------
def section_articles(now):
    data = load(os.path.join(NEWS, "articles.json"), {"items": []})
    allowed = load(os.path.join(NEWS, "sources.json"), {"domains": []})["domains"]
    out, bad = [], []
    for a in data.get("items", []):
        errs = validate_article(a, allowed, now)
        if errs:
            bad.append((a.get("id"), errs)); continue
        if (now - datetime.date.fromisoformat(a["published"])).days > 45:
            continue
        out.append({"id": a["id"], "section": a["section"], "kind": "sjónarhorn" if a.get("type") == "sjonarhorn" else "frétt",
                    "perspectives": a.get("perspectives"), "paywall": bool(a.get("paywall")), "date": a["published"],
                    "titleIs": a["titleIs"], "summaryIs": a["summaryIs"],
                    "titleEn": a["titleEn"], "summaryEn": a["summaryEn"],
                    "source": {"name": a["source"], "nameEn": a.get("sourceEn") or a["source"], "url": a["url"]},
                    "link": f"/#{a['iso3'].lower()}" if a.get("iso3") else None, "iso3": a.get("iso3")})
    return out, bad


def section_elections(now):
    data = load(os.path.join(ROOT, "data", "elections.json"), {"countries": []})
    out = []
    for c in data["countries"]:
        name = COUNTRY_IS.get(c["iso3"], c["name"])
        for e in c.get("elections", []):
            d = datetime.date.fromisoformat(e["date"])
            days = (d - now).days
            if 0 <= days <= 10 and e.get("dateStatus") != "expected":
                when = "í dag" if days == 0 else "á morgun" if days == 1 else f"eftir {days} daga"
                when_en = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
                n = len(c.get("parties", []))
                out.append({"id": f"vote-{c['iso3']}-{e['date']}", "section": "kosningar", "kind": "yfirlit",
                            "date": (now).isoformat(), "sortKey": 1,
                            "titleIs": f"Kosið í {name} {when}: {type_is(e['type'])} {date_is(e['date'])}",
                            "summaryIs": f"{n} flokkar eða frambjóðendur eru á kosningakortinu með helstu stefnumálum sínum." if n else "Sjá nánar á kosningakortinu.",
                            "titleEn": f"{c['name']} votes {when_en}: {e['type']}, {date_en(e['date'])}",
                            "summaryEn": f"{n} parties or candidates are on the election map with their main policies." if n else "See the election map for details.",
                            "source": None,
                            "link": f"/#{c['iso3'].lower()}", "iso3": c["iso3"]})
        le = c.get("lastElection")
        if le and le.get("date") and 0 <= (now - datetime.date.fromisoformat(le["date"])).days <= 14:
            out.append({"id": f"result-{c['iso3']}-{le['date']}", "section": "kosningar", "kind": "yfirlit",
                        "date": le["date"], "titleIs": f"Úrslit í {name}: {type_is(le.get('type'))}",
                        "summaryIs": le.get("outcomeIs") or le.get("outcome", ""),
                        "titleEn": f"Result in {c['name']}: {le.get('type') or 'election'}",
                        "summaryEn": le.get("outcome") or "", "source": None,
                        "link": f"/#{c['iso3'].lower()}", "iso3": c["iso3"]})
    return out, []


def section_finance(now):
    feed = load(os.path.join(ROOT, "data", "finance", "feed.json"), {"items": []})
    out = []
    for i in feed["items"]:
        if (now - datetime.date.fromisoformat(i["filed"])).days > 14 or not i.get("summaryIs"):
            continue
        if i["form"] == "8-K" and not (i.get("ai") and i["ai"].get("status") == "verified"):
            continue
        out.append({"id": f"fin-{i['accession']}", "section": "fjarmal", "kind": "yfirlit", "date": i["filed"],
                    "titleIs": i["headlineIs"], "summaryIs": i["summaryIs"],
                    "titleEn": i.get("headlineEn") or "", "summaryEn": i.get("summaryEn") or "",
                    "source": {"name": "SEC EDGAR", "url": i.get("ai", {}).get("exhibit") or i["url"]},
                    "link": f"/fjarmal#{i['ticker'].lower()}", "ai": bool(i.get("ai"))})
    return out, []


SECTIONS = [section_articles, section_elections, section_finance]


def main():
    now = today()
    items, problems = [], []
    for fn in SECTIONS:
        got, bad = fn(now)
        items += got
        problems += bad
    items.sort(key=lambda x: (x["date"], x.get("sortKey", 0)), reverse=True)
    out = {"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "count": len(items), "items": items[:150]}
    json.dump(out, open(os.path.join(ROOT, "data", "news.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for pid, errs in problems:
        print(f"INVALID {pid}: {'; '.join(errs)}")
    print(f"OK: {len(items)} news items ({sum(1 for i in items if i['kind'] == 'frétt')} third-party)")
    if problems and "--strict" in sys.argv:
        sys.exit(1)


if __name__ == "__main__":
    main()
