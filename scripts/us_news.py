#!/usr/bin/env python3
"""Headlines for the US midterms page: each state's own newsroom plus national outlets.

Reads  data/us/states_meta.json  (one local outlet per state, national outlets, all with RSS feeds)
       data/us/races.json        (candidate names, used to match national headlines to states)
Writes data/us/news/index.json   (national headlines and feed status)
       data/us/news/<AB>.json    (per state: election headlines from the local outlet, and national headlines
                                  that name the state or one of its candidates)
Only titles, links, dates and outlet names are stored; no article text. Runs hourly with headlines.py.
Usage: python3 scripts/us_news.py [--days 10]
"""
import json, os, re, sys, datetime, concurrent.futures as cf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from headlines import fetch  # same RSS/Atom reader as the world headlines

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
US = os.path.join(ROOT, "data", "us")
OUT = os.path.join(US, "news")
ELECTION = re.compile(r"\b(elections?|electoral|votes?|voters?|voting|ballots?|polls?|polling|campaign\w*|candidates?|midterms?|"
                      r"senate|senators?|governors?|gubernatorial|congress\w*|u\.s\. house|house race|house seat|district|"
                      r"redistrict\w*|primary|gop|republicans?|democrats?|democratic|endorse\w*|debates?|turnout|absentee|"
                      r"early vote|recount|canvass\w*|attack ads?|super pac)\b", re.I)
COMMON = {"smith", "jones", "johnson", "brown", "williams", "miller", "davis", "wilson", "moore", "taylor", "thomas", "white",
          "martin", "james", "green", "scott", "young", "allen", "king", "wright", "hill", "baker", "nelson", "carter",
          "mitchell", "roberts", "turner", "phillips", "campbell", "parker", "evans", "edwards", "collins", "stewart",
          "morris", "rogers", "reed", "cook", "bell", "murphy", "bailey", "cooper", "howard", "ward", "cox", "gray",
          "james", "watson", "brooks", "kelly", "sanders", "price", "bennett", "wood", "barnes", "ross", "henderson",
          "coleman", "jenkins", "perry", "powell", "long", "patterson", "hughes", "flores", "washington", "butler",
          "simmons", "foster", "bryant", "alexander", "russell", "griffin", "hayes", "myers", "ford", "hamilton",
          "graham", "sullivan", "wallace", "west", "cole", "jordan", "reynolds", "fisher", "ellis", "harrison", "gibson",
          "marshall", "owens", "lee", "walker", "hall", "lewis", "clark", "jackson", "harris", "thompson", "garcia",
          "anderson", "taylor", "booker", "moody", "love", "block", "little", "green", "sand", "long", "bray", "byrd"}
STATE_WORDS = {"Georgia": r"Georgia(?! Tech)", "Washington": r"Washington State|Washington state", "New York": r"New York(?! Times| Post)"}


def surnames(st):
    out = set()
    for r in st.get("senate", []) + ([st["governor"]] if st.get("governor") else []):
        for c in r["candidates"][:3]:
            if c["party"] not in ("Democratic", "Republican", "Independent"):
                continue
            last = re.sub(r"\b(Jr\.|Sr\.|II|III)\b", "", c["name"]).strip().split()[-1]
            if len(last) >= 5 and last.lower() not in COMMON:
                out.add(last)
    return out


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 10
    meta = json.load(open(os.path.join(US, "states_meta.json"), encoding="utf-8"))
    races = json.load(open(os.path.join(US, "races.json"), encoding="utf-8"))["states"]
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    jobs = [{"id": s["abbr"], "name": s["outlet"]["name"], "feed": s["outlet"]["feed"], "local": s["abbr"]} for s in meta["states"]]
    jobs += [{"id": n["name"], "name": n["name"], "feed": n["feed"], "type": n["type"]} for n in meta["national"]]
    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(fetch, jobs))

    def fresh(items):
        seen, out = set(), []
        for it in items:
            if it["published"] and datetime.datetime.fromisoformat(it["published"]) < cutoff:
                continue
            if it["url"] in seen:
                continue
            seen.add(it["url"]); out.append(it)
        return out

    key = lambda r: r["published"] or ""
    status, local, national = [], {}, []
    for outlet, items, err in results:
        items = fresh(items)
        status.append({"outlet": outlet["name"], "state": outlet.get("local"), "ok": err is None and bool(items), "items": len(items), "error": err})
        if outlet.get("local"):
            local[outlet["local"]] = [{**it, "outlet": outlet["name"]} for it in items]
        else:
            national += [{**it, "outlet": outlet["name"], "type": outlet["type"]} for it in items]
    national.sort(key=key, reverse=True)

    pats = {}
    for s in meta["states"]:
        words = [STATE_WORDS.get(s["name"], re.escape(s["name"]))] + [re.escape(n) for n in sorted(surnames(races.get(s["abbr"], {})))]
        pats[s["abbr"]] = re.compile(r"(?<![\w-])(" + "|".join(words) + r")(?![\w-])")

    os.makedirs(OUT, exist_ok=True)
    counts = {}
    for s in meta["states"]:
        ab = s["abbr"]
        loc_all = sorted(local.get(ab, []), key=key, reverse=True)
        loc = [it for it in loc_all if ELECTION.search(it["title"]) or pats[ab].search(it["title"])][:15]
        nat = [it for it in national if pats[ab].search(it["title"])][:15]
        json.dump({"state": ab, "outlet": s["outlet"]["name"], "site": s["outlet"]["site"], "local": loc, "national": nat},
                  open(os.path.join(OUT, f"{ab}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        counts[ab] = {"local": len(loc), "national": len(nat)}
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    json.dump({"updated": now, "national": [it for it in national if ELECTION.search(it["title"])][:40], "counts": counts, "feeds": status},
              open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    ok = sum(1 for x in status if x["ok"])
    print(f"OK: {ok}/{len(status)} US feeds, {sum(c['local'] for c in counts.values())} local and "
          f"{sum(c['national'] for c in counts.values())} national state headlines")


if __name__ == "__main__":
    main()
