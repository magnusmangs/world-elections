#!/usr/bin/env python3
"""Find freely licensed images for companies, candidates and countries.

Sources: Wikidata (which entity, which image) and Wikimedia Commons (the file, its licence and author).
  companies: matched exactly by SEC CIK (Wikidata P5531) -> logo (P154)
  people:    party leaders/candidates in data/countries, matched by exact name + citizenship -> image (P18)
  countries: flag (P41), matched by ISO 3166-1 alpha-3 (P298)
Only files hosted on Commons with a free licence are kept (public domain, CC0, CC BY, CC BY-SA).
Images are hotlinked from upload.wikimedia.org as thumbnails and always shown with author and licence.
Writes data/media/media.json. Usage: python3 scripts/media.py
"""
import json, os, re, sys, glob, time, html, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "media", "media.json")
UA = "WorldElectionsMedia/1.0 (https://world-elections.vercel.app; magnusomagnusson@icloud.com)"
FREE = re.compile(r"(public domain|pd|cc0|cc[- ]by(?:[- ]sa)?|cc-by|attribution)", re.I)


def get_json(url, data=None):
    for i in range(7):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < 6:
                wait = int(e.headers.get("Retry-After") or 0) or 10 * (i + 1)
                print(f"rate limited, waiting {wait}s", file=sys.stderr)
                time.sleep(min(wait, 90)); continue
            raise
        except Exception:
            if i == 6:
                raise
            time.sleep(3)


def sparql(q):
    data = urllib.parse.urlencode({"query": q, "format": "json"}).encode()
    time.sleep(1)
    return get_json("https://query.wikidata.org/sparql", data)["results"]["bindings"]


def file_name(commons_url):
    return urllib.parse.unquote(commons_url.rsplit("/", 1)[-1]).replace("_", " ")


def commons_info(files, width=240):
    out = {}
    files = list(dict.fromkeys(files))
    for i in range(0, len(files), 20):
        batch = files[i:i + 20]
        body = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo",
                                       "iiprop": "url|extmetadata", "iiurlwidth": width,
                                       "titles": "|".join("File:" + f for f in batch)}).encode()
        time.sleep(4)
        d = get_json("https://commons.wikimedia.org/w/api.php", body)
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for page in d["query"]["pages"].values():
            if "imageinfo" not in page:
                continue
            ii = page["imageinfo"][0]
            md = ii.get("extmetadata", {})
            val = lambda k: re.sub(r"<[^>]+>", "", html.unescape(md.get(k, {}).get("value", ""))).strip()
            lic = val("LicenseShortName") or val("UsageTerms")
            if not FREE.search(lic or ""):
                continue
            title = page["title"][5:]
            out[norm.get(page["title"], page["title"])[5:] if page["title"] in norm else title] = {
                "thumb": (ii.get("thumburl") or ii["url"]).split("?")[0], "page": ii.get("descriptionurl"),
                "license": lic, "licenseUrl": val("LicenseUrl"),
                "author": (val("Artist") or val("Credit") or "Óþekktur höfundur")[:120],
                "trademark": "trademark" in (val("Restrictions") + val("UsageTerms")).lower() or "logo" in title.lower()}
    return out


def clean_author(a, lic):
    a = re.sub(r"\s+", " ", a or "").strip()
    a = re.sub(r"^(Original:|Vector:|Author:)\s*", "", a, flags=re.I)
    a = re.split(r"\s(Vector|Derivative work|Modified by|SVG)[:\s]", a)[0]
    m = re.match(r"^(.{3,60}?)\1$", a)  # "Unknown authorUnknown author"
    if m:
        a = m.group(1)
    if not a or re.search(r"see file history|unknown author|^unknown$", a, re.I):
        a = ""
    if re.search(r"public domain|^pd|cc0", lic or "", re.I):
        return "Almenningseign"  # no attribution required; caption still links to the file page
    return (a or "Höfundur óþekktur")[:60]


def main():
    media = {"note": "Freely licensed images from Wikimedia Commons, found via Wikidata. Always show author and licence.",
             "companies": {}, "people": {}, "flags": {}}
    # companies by CIK
    cos = {}
    for f in glob.glob(os.path.join(ROOT, "data", "finance", "companies", "*.json")):
        c = json.load(open(f)); cos[c["cik"]] = c["ticker"]
    vals = " ".join(f'"{k}"' for k in cos)
    rows = sparql(f"SELECT ?cik ?item ?logo WHERE {{ VALUES ?cik {{ {vals} }} ?item wdt:P5531 ?cik . OPTIONAL {{ ?item wdt:P154 ?logo . }} }}")
    logos = {}
    for r in rows:
        if "logo" in r:
            logos.setdefault(cos[r["cik"]["value"]], file_name(r["logo"]["value"]))
    # people: name + citizenship
    people, flags_iso = [], set()
    for f in glob.glob(os.path.join(ROOT, "data", "countries", "*.json")):
        c = json.load(open(f)); flags_iso.add(c["iso3"])
        for p in c.get("parties", []):
            name = (p.get("leader") or "").split(" and ")[0].split(";")[0].split("(")[0].strip()
            if name and len(name.split()) >= 2 and not re.search(r"\b(new leader|to be|possible|primary|opposition|coalition|citizens)\b", name, re.I):
                people.append((name, c["iso3"]))
    people = list(dict.fromkeys(people))
    img_people = {}
    for i in range(0, len(people), 60):
        chunk = people[i:i + 60]
        vals = " ".join(f'("{n.replace(chr(34), "")}"@en "{iso}")' for n, iso in chunk)
        q = f"""SELECT ?name ?iso ?p ?img WHERE {{ VALUES (?name ?iso) {{ {vals} }}
          ?p rdfs:label ?name ; wdt:P31 wd:Q5 ; wdt:P27 ?c ; wdt:P18 ?img . ?c wdt:P298 ?iso . }}"""
        for r in sparql(q):
            key = f'{r["iso"]["value"]}|{r["name"]["value"]}'
            img_people.setdefault(key, (r["p"]["value"].rsplit("/", 1)[-1], file_name(r["img"]["value"])))
    # flags
    vals = " ".join(f'"{i}"' for i in sorted(flags_iso | {"ISL", "GBR", "DEU", "RUS", "CHN", "UKR", "QAT", "IND", "JPN", "TUR", "HKG", "ZAF", "AUS", "CAN", "SGP"}))
    flags = {r["iso"]["value"]: file_name(r["flag"]["value"]) for r in
             sparql(f"SELECT ?iso ?flag WHERE {{ VALUES ?iso {{ {vals} }} ?c wdt:P298 ?iso ; wdt:P41 ?flag . }}")}
    info = commons_info(list(logos.values()) + [v[1] for v in img_people.values()] + list(flags.values()))
    for t, fn in logos.items():
        if fn in info: media["companies"][t] = {"file": fn, **info[fn]}
    for k, (qid, fn) in img_people.items():
        if fn in info: media["people"][k] = {"wikidata": qid, "file": fn, **info[fn]}
    for iso, fn in flags.items():
        if fn in info: media["flags"][iso] = {"file": fn, **info[fn]}
    for sec in ("companies", "people", "flags"):
        for v in media[sec].values():
            v["author"] = clean_author(v["author"], v["license"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(media, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"OK: {len(media['companies'])}/{len(cos)} company logos, {len(media['people'])}/{len(people)} people, {len(media['flags'])} flags")


if __name__ == "__main__":
    main()
