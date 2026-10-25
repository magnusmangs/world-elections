#!/usr/bin/env python3
"""English text for the Fjármál (Finance) page, from the same verified figures as the Icelandic text.

The site shows one language at a time. Icelandic text is written by fundamentals.py and press_releases.py;
this script adds the English twins with fixed templates (no AI prose, no translation of free text):
  - company files:  summaryEn
  - feed items:     headlineEn, summaryEn
Figures come only from the company's XBRL quarters (10-Q/10-K) or from the verified figures recorded in
data/finance/releases/<accession>.json (8-K). English amounts are in USD only.
Idempotent; safe to run after every finance update. No network.
Usage: python3 scripts/finance_en.py
"""
import json, os, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIN = os.path.join(ROOT, "data", "finance")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
HEADLINE = {"8-K": "{name} publishes an earnings release", "10-Q": "{name} files quarterly results", "10-K": "{name} files its annual report"}
KIND = {"8-K": "Earnings release", "10-Q": "Quarterly report", "10-K": "Annual report"}


def date_en(s):
    d = datetime.date.fromisoformat(s)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def usd(v):
    a, sign = abs(v), "-" if v < 0 else ""
    return f"{sign}${a / 1e9:,.1f} billion" if a >= 1e9 else f"{sign}${a / 1e6:,.0f} million"


def change(p):
    if p is None:
        return ""
    if abs(p) < 0.05:
        return ", unchanged from a year earlier"
    return f", {'up' if p > 0 else 'down'} {abs(p):.1f}% from a year earlier"


def summary_en(name, q):
    """Template sentences for one XBRL quarter {periodEnd, metrics}."""
    if not q:
        return ""
    m, parts = q["metrics"], []
    r = m.get("revenue")
    if r:
        parts.append(f"{name} reported revenue of {usd(r['value'])} for the quarter ended {date_en(q['periodEnd'])}{change(r.get('yoy'))}.")
    n = m.get("netIncome")
    if n:
        parts.append(f"{'Net income was' if n['value'] >= 0 else 'Net loss was'} {usd(abs(n['value']))}{change(n.get('yoy'))}.")
    e = m.get("eps")
    if e:
        parts.append(f"Diluted earnings per share were ${e['value']:.2f}.")
    if m.get("operatingCashFlow") and m.get("capex"):
        fcf = m["operatingCashFlow"]["value"] - m["capex"]["value"]
        parts.append(f"Free cash flow (operating cash flow less capital expenditure) was {usd(fcf)}.")
    return " ".join(parts)


def release_en(name, record):
    """Template sentences from the verified figures of an earnings release (8-K Exhibit 99.1)."""
    res = record.get("result") or {}
    pe = res.get("periodEnd")
    figs = {(f["metric"], f["period"]): float(f["value"]) for f in record.get("verified", [])}
    cur = lambda k: figs.get((k, "current"))
    def yoy(k):
        a, b = figs.get((k, "current")), figs.get((k, "prior_year"))
        return None if a is None or not b else round((a - b) / abs(b) * 100, 1)
    if not pe or cur("revenue") is None:
        return ""
    parts = [f"According to its earnings release, {name} had revenue of {usd(cur('revenue'))} for the quarter ended {date_en(pe)}{change(yoy('revenue'))}."]
    if cur("netIncome") is not None:
        v = cur("netIncome")
        parts.append(f"{'Net income was' if v >= 0 else 'Net loss was'} {usd(abs(v))}{change(yoy('netIncome'))}.")
    if cur("eps") is not None:
        parts.append(f"Diluted earnings per share were ${cur('eps'):.2f}.")
    return " ".join(parts)


PENDING_8K = ("An earnings press release was filed with the SEC. Confirmed figures appear here once the company "
              "files its formal report (10-Q or 10-K).")


def main():
    companies = {}
    for path in glob.glob(os.path.join(FIN, "companies", "*.json")):
        c = json.load(open(path, encoding="utf-8"))
        companies[c["ticker"]] = c
        s = summary_en(c["name"], c.get("latest"))
        if c.get("summaryEn") != s:
            c["summaryEn"] = s
            for f in c.get("filings", []):
                f["kindEn"] = KIND.get(f["form"][:4].rstrip("/"), f.get("kind"))
            json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    feed_path = os.path.join(FIN, "feed.json")
    feed = json.load(open(feed_path, encoding="utf-8"))
    changed = 0
    for i in feed["items"]:
        c = companies.get(i["ticker"])
        name = i.get("name") or (c and c["name"]) or i["ticker"]
        form = i["form"][:4].rstrip("/")
        head = HEADLINE.get(form, "{name} files a report").format(name=name)
        if i.get("ai", {}).get("status") == "verified":
            rec_path = os.path.join(FIN, "releases", f"{i['accession']}.json")
            text = release_en(name, json.load(open(rec_path, encoding="utf-8"))) if os.path.exists(rec_path) else ""
        elif form == "8-K":
            text = PENDING_8K
        else:
            q = next((q for q in (c or {}).get("quarters", []) if q["periodEnd"] == i.get("periodEnd")), None)
            text = summary_en(name, q) if q else i.get("summaryEn", "")
        if i.get("headlineEn") != head or i.get("summaryEn") != text or i.get("kindEn") != KIND.get(form):
            i["headlineEn"], i["summaryEn"], i["kindEn"] = head, text, KIND.get(form, i.get("kind"))
            changed += 1
    if changed:
        json.dump(feed, open(feed_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK: English text for {len(companies)} companies, {changed} feed items updated")


if __name__ == "__main__":
    main()
