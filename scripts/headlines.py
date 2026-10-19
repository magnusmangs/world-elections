#!/usr/bin/env python3
"""Collect headlines from the outlet registry and index them by country.

Reads  data/news/outlets.json   (outlets per country with RSS feeds)
       data/news/keywords.json  (words that mark a headline as about a country)
       data/elections.json      (leader surnames are added as extra keywords)
Writes data/news/headlines/index.json and data/news/headlines/<ISO3>.json:
  domestic: what the country's own outlets lead with
  foreign:  headlines about the country from outlets in other countries, grouped by outlet country
Only titles, links, dates and outlet metadata are stored; no article text.
Usage: python3 scripts/headlines.py [--days 7]
"""
import json, os, re, sys, html, datetime, email.utils, urllib.request, concurrent.futures as cf
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS = os.path.join(ROOT, "data", "news")
OUT = os.path.join(NEWS, "headlines")
COMMON_SURNAMES = {"silva", "santos", "costa", "pereira", "oliveira", "souza", "garcia", "garcía", "rodriguez", "rodríguez",
                   "martinez", "martínez", "lopez", "lópez", "gonzalez", "gonzález", "hernandez", "hernández", "perez",
                   "pérez", "torres", "ramos", "smith", "jones", "johnson", "brown", "williams", "ahmed", "singh",
                   "kumar", "nguyen", "musa", "mohamed", "mohammed", "hassan", "ibrahim", "james", "thomas", "martin",
                   "david", "peters", "moore", "white", "wilson", "taylor"}
UA = "Mozilla/5.0 (compatible; FrettirBot/1.0; +https://world-elections.vercel.app/frettir)"


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(datetime.timezone.utc)
    except Exception:
        pass
    try:
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(datetime.timezone.utc)
    except Exception:
        return None


def text(el, *names):
    for n in names:
        for child in el.iter():
            tag = child.tag.split("}")[-1]
            if tag == n and (child.text or child.attrib.get("href")):
                return (child.text or child.attrib.get("href")).strip()
    return ""


def fetch(outlet):
    try:
        req = urllib.request.Request(outlet["feed"], headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=20).read()
        root = ET.fromstring(raw)
    except Exception as e:
        return outlet, [], str(e)[:80]
    items = []
    for el in root.iter():
        if el.tag.split("}")[-1] not in ("item", "entry"):
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", text(el, "title"))).strip()
        link = text(el, "link")
        if not link:
            for ch in el:
                if ch.tag.split("}")[-1] == "link" and ch.attrib.get("href"):
                    link = ch.attrib["href"]
        when = parse_date(text(el, "pubDate", "published", "updated", "date"))
        if "*http" in link:  # unwrap redirect links such as Folha's redir.folha.com.br/...*https://...
            link = link[link.index("*http") + 1:]
        if title and link.startswith("http"):
            items.append({"title": title[:220], "url": link.strip(), "published": when.isoformat() if when else None})
    return outlet, items, None


def build_patterns(now_countries):
    kw = json.load(open(os.path.join(NEWS, "keywords.json")))["countries"]
    elections = json.load(open(os.path.join(ROOT, "data", "elections.json")))
    extra = {}
    for c in elections["countries"]:
        names = []
        for p in c.get("parties", [])[:3]:
            last = (p.get("leader") or "").split(" and ")[0].split(",")[0].split("(")[0].strip().split(" ")[-1]
            if len(last) >= 5 and last[0].isupper() and last.lower() not in COMMON_SURNAMES:
                names.append(last)
        extra[c["iso3"]] = names
    pats = {}
    for iso in set(kw) | set(extra) | set(now_countries):
        words = kw.get(iso, []) + extra.get(iso, [])
        if not words:
            continue
        alt = "|".join(re.escape(w.strip()) + (r"\s" if w.endswith(" ") else "") for w in sorted(set(words), key=len, reverse=True))
        pats[iso] = re.compile(r"(?<![\w-])(" + alt + r")", re.I)
    return pats


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 7
    reg = json.load(open(os.path.join(NEWS, "outlets.json")))
    outlets = reg["outlets"]
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(fetch, outlets))
    pats = build_patterns({o["country"] for o in outlets})
    domestic, foreign, status = {}, {}, []
    for outlet, items, err in results:
        status.append({"id": outlet["id"], "name": outlet["name"], "country": outlet["country"],
                       "ok": err is None and bool(items), "error": err, "items": len(items)})
        meta = {"outlet": outlet["name"], "outletCountry": outlet["country"], "type": outlet["type"],
                "lang": outlet["lang"], "domain": outlet["domain"]}
        seen = set()
        for it in items:
            if it["published"] and datetime.datetime.fromisoformat(it["published"]) < cutoff:
                continue
            if it["url"] in seen:
                continue
            seen.add(it["url"])
            row = {**it, **meta}
            domestic.setdefault(outlet["country"], []).append(row)
            for iso, pat in pats.items():
                if iso != outlet["country"] and pat.search(it["title"]):
                    foreign.setdefault(iso, []).append(row)
    os.makedirs(OUT, exist_ok=True)
    key = lambda r: r["published"] or ""
    index = []
    for iso in sorted(set(domestic) | set(foreign)):
        dom = sorted(domestic.get(iso, []), key=key, reverse=True)[:40]
        fr = sorted(foreign.get(iso, []), key=key, reverse=True)[:80]
        json.dump({"iso3": iso, "domestic": dom, "foreign": fr}, open(os.path.join(OUT, f"{iso}.json"), "w"),
                  ensure_ascii=False, indent=0)
        index.append({"iso3": iso, "domestic": len(dom), "foreign": len(fr),
                      "foreignCountries": len({r["outletCountry"] for r in fr})})
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    json.dump({"updated": now, "countries": index, "outlets": status, "countryNamesIs": reg.get("countryNamesIs", {})},
              open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=1)
    ok = sum(1 for s in status if s["ok"])
    print(f"OK: {ok}/{len(status)} feeds, {len(index)} countries indexed")


if __name__ == "__main__":
    main()
