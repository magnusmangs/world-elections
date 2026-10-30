#!/usr/bin/env python3
"""Build data/us/races.json for the US midterms page from Wikipedia's race pages.

Fetches the raw wikitext of:
  2026 United States Senate elections            (nominees per state, Cook rating, current composition)
  2026 United States gubernatorial elections     (same for governors)
  2026 United States House of Representatives election ratings   (Cook rating per competitive district)
  List of current United States representatives  (current House delegation per state)
and writes one JSON file with every state's races. Re-run before election day to pick up late changes:
  python3 scripts/us_races.py
Figures are only as current as Wikipedia, which cites each rating and candidate list to its source.
Uses a descriptive User-Agent and pauses between requests, as Wikimedia asks.
"""
import json, os, re, sys, time, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "us", "races.json")
META = os.path.join(ROOT, "data", "us", "states_meta.json")
UA = "WorldElectionsBot/1.0 (https://world-elections.vercel.app; magnusomagnusson@icloud.com)"
PAGES = {
    "senate": "2026_United_States_Senate_elections",
    "governor": "2026_United_States_gubernatorial_elections",
    "houseRatings": "2026_United_States_House_of_Representatives_election_ratings",
    "reps": "List_of_current_United_States_representatives",
}


def fetch(title, cache_dir=None):
    if cache_dir and os.path.exists(os.path.join(cache_dir, title + ".wiki")):
        return open(os.path.join(cache_dir, title + ".wiki"), encoding="utf-8").read()
    url = f"https://en.wikipedia.org/wiki/{title}?action=raw"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=40).read().decode("utf-8")
        except Exception as e:
            print(f"  {title}: {e}; retrying", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"Could not fetch {title}")


# ---------- wikitext helpers ----------
def strip_refs(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)


def plain(s):
    s = strip_refs(s)
    s = re.sub(r"\{\{sortname\|([^|}]+)\|([^|}]+)(\|[^}]*)?\}\}", r"\1 \2", s)
    s = re.sub(r"\{\{[Ss]mall\|([^}]*)\}\}", r"\1", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    for _ in range(3):
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", "; ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "").replace("<nowiki/>", "")
    return re.sub(r"\s+", " ", s).strip(" |;")


def section(wiki, title_regex):
    m = re.search(r"^==+\s*" + title_regex + r"\s*==+\s*$", wiki, re.M)
    if not m:
        return ""
    lvl = len(re.match(r"=+", wiki[m.start():]).group())
    rest = wiki[m.end():]
    n = re.search(r"^={2,%d}[^=]" % lvl, rest, re.M)
    return rest[: n.start()] if n else rest


def first_table(text):
    # Tables open with "{|" and close with "|}" at the start of a line; "|}}" inside templates does not count.
    i = text.find("{|")
    if i < 0:
        return ""
    depth, out = 0, []
    for ln in text[i:].split("\n"):
        st = ln.lstrip()
        if st.startswith("{|"):
            depth += 1
        out.append(ln)
        if st.startswith("|}") and not st.startswith("|}}"):
            depth -= 1
            if depth == 0:
                break
    return "\n".join(out)


def rows(table):
    return re.split(r"\n\|-[^\n]*", table)


def rating(text):
    m = re.search(r"\{\{USRaceRating\|([^}]*)\}\}", text)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split("|")]
    if parts[0].lower() == "tossup":
        return {"rating": "Tossup", "party": None}
    r = {"Safe": "Solid"}.get(parts[0].capitalize(), parts[0].capitalize())
    return {"rating": r, "party": parts[1].upper() if len(parts) > 1 else None}


def party_short(p):
    p = plain(p)
    p = re.sub(r"\s*Party.*$", "", p).replace("Minnesota ", "").strip()
    p = {"Democratic–Farmer–Labor": "Democratic", "Democratic-Farmer-Labor": "Democratic", "DFL": "Democratic",
         "Independent politician": "Independent"}.get(p, p)
    return p


def infobox(text):
    i = text.find("{{Infobox election")
    if i < 0:
        return {}
    depth, j = 0, i
    while j < len(text):
        if text.startswith("{{", j):
            depth += 1; j += 2; continue
        if text.startswith("}}", j):
            depth -= 1; j += 2
            if depth == 0:
                break
            continue
        j += 1
    return {m.group(1): m.group(2).strip() for m in re.finditer(r"^\|[ \t]*(\w+)[ \t]*=[ \t]*(.*)$", text[i:j], re.M)}


def state_sections(wiki, names):
    out = {}
    for m in re.finditer(r"^==\s*([A-Z][A-Za-z ]+?)(\s*\(special\))?\s*==\s*$", wiki, re.M):
        name = m.group(1).strip()
        if name not in names:
            continue
        rest = wiki[m.end():]
        n = re.search(r"^==[^=]", rest, re.M)
        out[(name, bool(m.group(2)))] = rest[: n.start()] if n else rest
    return out


def predictions(wiki):
    """Cook rating (first ratings column) per (state, special)."""
    out = {}
    for r in rows(first_table(section(wiki, r"Predictions"))):
        r = r.strip()
        m = re.search(r"^!\s*\[\[[^|\]]*\|([^\]]+)\]\](.*)$", r, re.M)
        if not m:
            continue
        special = "special" in r.split("\n")[0].lower()
        rt = rating(r)
        if rt:
            out[(plain(m.group(1)), special)] = rt
    return out


def statuses(wiki, sec_regex, kind):
    """Status text from the race summary table, keyed by state (regular races only)."""
    out = {}
    for r in rows(first_table(section(wiki, sec_regex))):
        m = re.search(r"^!\s*\[\[2026 [^|\]]*?" + kind + r"[^|\]]* in ([^|\]]+)\|", r.strip(), re.M)
        if not m:
            continue
        txt = plain(r)
        s = re.search(r"(Incumbent[^;|]*|Interim appointee[^;|]*|New [^;|]*elected)", txt)
        out[m.group(1).strip()] = s.group(1).strip() if s else ""
    return out


def surname(n):
    n = re.sub(r"\b(Jr\.|Sr\.|II|III)\b", "", n).strip()
    return n.split()[-1].lower() if n else ""


def status_code(incumbent, noms, status_text, section_text):
    if incumbent and any(n["name"].lower() == incumbent.lower() or
                         (surname(n["name"]) == surname(incumbent) and n["name"].split()[0] == incumbent.split()[0]) for n in noms):
        return "running"
    t = (status_text + " " + section_text[:1500]).lower()
    sn = surname(incumbent)
    if any(k in t for k in ("lost renomination", "lose renomination", "lost the primary", "lost nomination", "lost the republican", "lost the democratic")) \
            or (sn and re.search(r"defeat(?:ed|ing)\s+(?:incumbent\s+)?(?:governor\s+|senator\s+)?(?:\w+\s+){0,2}" + re.escape(sn), t)):
        return "lost"
    if "term-limited" in t or "term limited" in t or "term limits" in t:
        return "term"
    return "retiring"


def races(wiki, names, kind, summary_regex, kind_word):
    secs = state_sections(wiki, names)
    rat = predictions(wiki)
    st = statuses(wiki, summary_regex, kind_word)
    out = {}
    for (name, special), txt in secs.items():
        box = infobox(txt)
        noms = []
        for k in range(1, 6):
            nm = box.get(f"nominee{k}") or box.get(f"candidate{k}")
            if nm:
                noms.append({"name": plain(nm), "party": party_short(box.get(f"party{k}", ""))})
        inc = plain(box.get("before_election", ""))
        inc_party = party_short(box.get("before_party", ""))
        if not inc and noms:  # some infoboxes leave the incumbent out when they are running
            inc, inc_party = noms[0]["name"], noms[0]["party"]
        body = plain(strip_refs(txt.split("}}\n", 1)[-1]))
        code = status_code(inc, noms, "" if special else st.get(name, ""), body)
        out.setdefault(name, []).append({
            "kind": kind, "special": special, "incumbent": inc, "incumbentParty": inc_party,
            "status": code, "candidates": noms, "rating": rat.get((name, special)),
        })
    return out


def composition(wiki):
    box = infobox(wiki)
    comp = {}
    for k in range(1, 6):
        p = box.get(f"party{k}")
        if p and box.get(f"seats_before{k}"):
            n = re.search(r"\d+", plain(box[f"seats_before{k}"]))
            if n:
                comp[{"Independent (US)": "Independent"}.get(party_short(p), party_short(p))] = int(n.group())
    return comp


def house_ratings(wiki):
    out = {}
    for r in rows(first_table(section(wiki, r"Latest published ratings for competitive seats"))):
        m = re.search(r"!\s*\{\{ushr\|(\w\w)\|(\w+)", r)
        if not m:
            continue
        lines = r.strip().split("\n")
        vacant = any("vacant" in ln.lower() and "party shading" not in ln.lower() for ln in lines[1:4])
        inc_line = next((ln for ln in lines[1:5] if re.search(r"party shading", ln, re.I)), "")
        if vacant:  # vacant seat: the shaded line is the last result, not a member
            inc_line = "| Vacant (" + ("Republican" if "republican" in inc_line.lower() else "Democratic") + ")"
        low = inc_line.lower()
        new_seat = "new seat" in low or "party shading/vacant" in low
        party = "" if new_seat else "R" if "republican" in low else "D" if ("democratic" in low or "dfl" in low) else "I" if "independent" in low else ""
        inc = "" if (new_seat or vacant) else plain(inc_line)
        open_seat = new_seat or "retiring" in inc.lower() or "running for" in inc.lower() or vacant or "resign" in inc.lower()
        inc = re.split(r";|\(", inc)[0].strip()
        rt = rating("\n".join(lines[3:]))
        if rt and rt["rating"] != "Solid":  # keep seats Cook itself calls competitive
            out.setdefault(m.group(1), []).append({"district": m.group(2), "incumbent": inc, "party": party,
                                                   "open": open_seat, "newSeat": new_seat, "rating": rt})
    return out


def delegations(wiki):
    deleg = {}
    for m in re.finditer(r'^!scope="row"\s*\|\{\{ushr\|(\w\w)\|(\w+)\|X\}\}\s*\n(.*?)(?=\n\|-)', wiki, re.M | re.S):
        ab, body = m.group(1), m.group(3)
        lines = [ln.strip("| ").strip().replace("<nowiki/>", "") for ln in body.split("\n")[:4]]
        p = "vacant" if "vacant" in body[:300].lower() else None
        for ln in lines:
            if ln == "Republican":
                p = "R"; break
            if ln.startswith("Democratic") or ln.startswith("DFL"):
                p = "D"; break
            if ln == "Independent":
                p = "I"; break
        d = deleg.setdefault(ab, {"R": 0, "D": 0, "I": 0, "vacant": 0})
        d[p or "vacant"] += 1
    return deleg


def main():
    cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else None
    meta = json.load(open(META, encoding="utf-8"))
    names = {s["name"] for s in meta["states"]}
    wiki = {}
    for k, title in PAGES.items():
        wiki[k] = fetch(title, cache)
        time.sleep(3)
    senate = races(wiki["senate"], names, "senate", r"Elections leading to the next Congress", "Senate")
    gov = races(wiki["governor"], names, "governor", r"States", "gubernatorial")
    hr = house_ratings(wiki["houseRatings"])
    dl = delegations(wiki["reps"])
    states = {}
    for s in meta["states"]:
        ab, nm = s["abbr"], s["name"]
        comp = sorted(hr.get(ab, []), key=lambda x: int(x["district"]) if x["district"].isdigit() else 0)
        d = dl.get(ab, {"R": 0, "D": 0, "I": 0, "vacant": 0})
        states[ab] = {"senate": senate.get(nm, []), "governor": (gov.get(nm) or [None])[0],
                      "house": {"seats": s["houseSeats"], "delegation": d, "competitive": comp}}
    tot = {k: sum(v["house"]["delegation"][k] for v in states.values()) for k in ("R", "D", "I", "vacant")}
    out = {
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "electionDate": "2026-11-03",
        "ratingSource": {"name": "Cook Political Report", "url": "https://www.cookpolitical.com/ratings"},
        "sources": ["https://en.wikipedia.org/wiki/" + t for t in PAGES.values()],
        "senateBefore": composition(wiki["senate"]),
        "governorsBefore": composition(wiki["governor"]),
        "houseBefore": tot,
        "states": states,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ns = sum(len(v["senate"]) for v in states.values())
    ng = sum(1 for v in states.values() if v["governor"])
    nc = sum(len(v["house"]["competitive"]) for v in states.values())
    print(f"OK: {ns} Senate races, {ng} governor races, {nc} rated House districts, House {tot}, Senate {out['senateBefore']}, governors {out['governorsBefore']}")


if __name__ == "__main__":
    main()
