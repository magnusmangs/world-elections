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

def main():
    today = datetime.date.today().isoformat()
    if "--today" in sys.argv:
        today = sys.argv[sys.argv.index("--today") + 1]
    errors, countries = [], []
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
            if pl.get("unit") == "percent" and sum(vals) > 100.5: errors.append(f"{name}: poll shares sum to {sum(vals)}")
            if pl.get("unit") == "seats" and ch and isinstance(ch.get("seats"), int) and sum(vals) > ch["seats"]:
                errors.append(f"{name}: poll seats exceed chamber")
        for p in c.get("parties", []):
            if "seats" in p and not (p["seats"] is None or isinstance(p["seats"], int)): errors.append(f"{name}: {p['name']} seats must be integer")
        if not c.get("sources"):
            errors.append(f"{name}: needs at least one source URL")
        upcoming = sorted([e for e in c.get("elections", []) if e.get("date", "") >= today], key=lambda e: e["date"])
        c["upcoming"] = upcoming
        countries.append(c)
    if errors:
        print("\n".join(errors)); sys.exit(1)
    countries.sort(key=lambda c: (c["upcoming"][0]["date"] if c["upcoming"] else "9999", c["name"]))
    out = {"updated": today, "countryCount": len(countries),
           "electionCount": sum(len(c["upcoming"]) for c in countries), "countries": countries}
    json.dump(out, open(os.path.join(ROOT, "data", "elections.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(countries)} countries, {out['electionCount']} upcoming elections, updated {today}")

if __name__ == "__main__":
    main()
