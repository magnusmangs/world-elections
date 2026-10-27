#!/usr/bin/env python3
"""Validate data/countries/*.json and build data/elections.json for the site.

Usage: python3 scripts/build.py [--today YYYY-MM-DD]
Exits non-zero if any country file is invalid.
"""
import json, glob, sys, os, datetime, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQ_COUNTRY = ["iso3", "isoNumeric", "name", "lastReviewed", "elections", "leaders", "summary", "parties", "sources"]
REQ_PARTY = ["name", "position", "inGovernment", "policies"]
STATUSES = {"confirmed", "tentative", "expected"}
RESULTS = {"new", "incumbent"}  # lastElection.result: a new party or person won, or the incumbent held on

# The site shows one language at a time (Icelandic by default, English on request).
# Every English text field needs an Icelandic twin with the suffix "Is". Party names are optional (nameIs).
I18N = {
    "": ["name", "leaders", "summary", "noParties"],
    "elections[]": ["type", "note"],
    "parties[]": ["position", "ideology", "lastResult", "polling"],
    "chamber": ["name", "asOf"],
    "poll": ["note", "pollster"],
    "lastElection": ["type", "outcome", "winner"],
    "live": ["headline", "note", "sourceName"],
}
LIVE_STATUSES = {"polls-open", "exit-poll", "counting", "final"}


def missing_is(c):
    """Return a list of 'path: field' strings where English text has no Icelandic twin."""
    out = []
    def check(obj, fields, where):
        for f in fields:
            v = obj.get(f)
            if isinstance(v, str) and v.strip() and not str(obj.get(f + "Is", "")).strip():
                out.append(f"{where}{f}Is")
    for path, fields in I18N.items():
        if path == "":
            check(c, fields, "")
        elif path.endswith("[]"):
            key = path[:-2]
            for i, o in enumerate(c.get(key) or []):
                check(o, fields, f"{key}[{i}].")
        elif isinstance(c.get(path), dict):
            check(c[path], fields, f"{path}.")
    for i, p in enumerate(c.get("parties") or []):
        pol, polIs = p.get("policies") or [], p.get("policiesIs")
        if pol and (not isinstance(polIs, list) or len(polIs) != len(pol) or not all(str(x).strip() for x in polIs)):
            out.append(f"parties[{i}].policiesIs (must list the same number of lines as policies)")
    return out

def main():
    today = datetime.date.today().isoformat()
    if "--today" in sys.argv:
        today = sys.argv[sys.argv.index("--today") + 1]
    errors, warnings, countries = [], [], []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "countries", "*.json"))):
        name = os.path.basename(path)
        try:
            c = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            errors.append(f"{name}: invalid JSON ({e})"); continue
        for k in REQ_COUNTRY:
            if k not in c: errors.append(f"{name}: missing '{k}'")
        if not re.fullmatch(r"\d{3}", str(c.get("isoNumeric", ""))):
            errors.append(f"{name}: isoNumeric must be 3 digits")
        for e in c.get("elections", []):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", e.get("date", "")):
                errors.append(f"{name}: election date must be YYYY-MM-DD")
            if e.get("dateStatus") not in STATUSES:
                errors.append(f"{name}: dateStatus must be one of {sorted(STATUSES)}")
        for p in c.get("parties", []):
            for k in REQ_PARTY:
                if k not in p: errors.append(f"{name}: party '{p.get('name')}' missing '{k}'")
        ch, pl = c.get("chamber"), c.get("poll")
        if ch is not None:
            if not isinstance(ch.get("seats"), int) or not ch.get("name") or not str(ch.get("source", "")).startswith("https://"):
                errors.append(f"{name}: chamber needs name, integer seats and https source")
            else:
                held = sum(p.get("seats") or 0 for p in c.get("parties", []))
                if held > ch["seats"]: errors.append(f"{name}: party seats {held} exceed chamber {ch['seats']}")
        if pl is not None:
            if pl.get("unit") not in ("seats", "percent") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", pl.get("date", "")) \
               or not pl.get("pollster") or not str(pl.get("url", "")).startswith("https://"):
                errors.append(f"{name}: poll needs unit seats|percent, date, pollster, https url")
            vals = [p["pollValue"] for p in c.get("parties", []) if isinstance(p.get("pollValue"), (int, float))]
            if not vals: errors.append(f"{name}: poll given but no party has pollValue")
            if pl.get("unit") == "percent" and sum(vals) > 100 + 0.5 * len(vals): errors  # published shares are rounded.append(f"{name}: poll shares sum to {sum(vals)}")
            if pl.get("unit") == "seats" and ch and isinstance(ch.get("seats"), int) and sum(vals) > ch["seats"]:
                errors.append(f"{name}: poll seats exceed chamber")
        for p in c.get("parties", []):
            if "seats" in p and not (p["seats"] is None or isinstance(p["seats"], int)): errors.append(f"{name}: {p['name']} seats must be integer")
        le = c.get("lastElection")
        if isinstance(le, dict):
            if "result" in le and le["result"] not in RESULTS:
                errors.append(f"{name}: lastElection.result must be one of {sorted(RESULTS)}")
            if le.get("result") in RESULTS and not str(le.get("winner", "")).strip():
                errors.append(f"{name}: lastElection.result needs a winner")
            try:
                age = (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(le.get("date", ""))).days
            except ValueError:
                age = None
            runoff = any(re.search(r"run-?off|second round", e.get("type", ""), re.I) for e in c.get("elections", []))
            if age is not None and 0 < age <= 90 and "result" not in le and not runoff:
                warnings.append(f"{name}: lastElection is {age} days old but has no result (new|incumbent); the map will not show it")
        lv = c.get("live")
        if lv is not None:
            if lv.get("status") not in LIVE_STATUSES: errors.append(f"{name}: live.status must be one of {sorted(LIVE_STATUSES)}")
            try: datetime.datetime.fromisoformat(str(lv.get("updated", "")).replace("Z", "+00:00"))
            except ValueError: errors.append(f"{name}: live.updated must be an ISO timestamp")
            if not lv.get("sourceName"): errors.append(f"{name}: live needs sourceName")
            if lv.get("source") and not str(lv["source"]).startswith("https://"): errors.append(f"{name}: live.source must be https")
            abbrs = {p.get("abbr") or p.get("name") for p in c.get("parties", [])}
            for r in lv.get("results", []):
                if not isinstance(r.get("value"), (int, float)): errors.append(f"{name}: live result {r.get('abbr')} needs a number")
                if r.get("abbr") not in abbrs and not r.get("color"): warnings.append(f"{name}: live result {r.get('abbr')} is not a listed party (give it a color)")
            for bl in lv.get("blocs", []):
                if not str(bl.get("nameIs", "")).strip(): errors.append(f"{name}: missing Icelandic text live.blocs nameIs")
            if lv.get("unit", "seats") == "seats" and c.get("chamber"):
                tot = sum(r.get("value") or 0 for r in lv.get("results", []))
                if tot > c["chamber"]["seats"]: errors.append(f"{name}: live seats {tot} exceed chamber")
        for m in missing_is(c):
            errors.append(f"{name}: missing Icelandic text {m}")
        if not c.get("sources"):
            errors.append(f"{name}: needs at least one source URL")
        upcoming = sorted([e for e in c.get("elections", []) if e.get("date", "") >= today], key=lambda e: e["date"])
        c["upcoming"] = upcoming
        countries.append(c)
    for w in warnings:
        print("WARNING: " + w)
    if errors:
        print("\n".join(errors)); sys.exit(1)
    countries.sort(key=lambda c: (c["upcoming"][0]["date"] if c["upcoming"] else "9999", c["name"]))
    out = {"updated": today, "countryCount": len(countries),
           "electionCount": sum(len(c["upcoming"]) for c in countries), "countries": countries}
    json.dump(out, open(os.path.join(ROOT, "data", "elections.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    live = {c["iso3"]: c["live"] for c in countries if c.get("live")}
    json.dump({"countries": live}, open(os.path.join(ROOT, "data", "live.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(countries)} countries, {out['electionCount']} upcoming elections, updated {today}")

if __name__ == "__main__":
    main()
