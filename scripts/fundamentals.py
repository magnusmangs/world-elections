#!/usr/bin/env python3
"""Fetch company fundamentals from SEC EDGAR and write data for the Fjármál page.

Sources (all free, no key):
  - https://www.sec.gov/files/company_tickers.json        ticker -> CIK
  - https://data.sec.gov/submissions/CIK##########.json   filing history
  - https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json  reported numbers (XBRL)
  - https://api.frankfurter.dev/v2/rate/USD/ISK?providers=SBI       Seðlabanki official USD/ISK

Every figure is taken from the company's own XBRL filing. Text is generated from fixed
Icelandic templates, so nothing is paraphrased or guessed.

Usage: python3 scripts/fundamentals.py
"""
import json, os, sys, time, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "finance")
UA = os.environ.get("SEC_USER_AGENT", "World Elections Fjarmal magnusomagnusson@icloud.com")
FILING_FORMS = {"10-K", "10-Q", "8-K", "10-K/A", "10-Q/A"}

METRICS = {
    # key: (label_is, candidate XBRL tags, unit, kind)  kind: flow (duration) or stock (instant)
    "revenue": ("Tekjur", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
                           "RevenuesNetOfInterestExpense", "RevenueFromContractWithCustomerIncludingAssessedTax"], "USD", "flow"),
    "operatingIncome": ("Rekstrarhagnaður", ["OperatingIncomeLoss"], "USD", "flow"),
    "netIncome": ("Hagnaður", ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], "USD", "flow"),
    "eps": ("Hagnaður á hlut (þynntur)", ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], "USD/shares", "flow"),
    "operatingCashFlow": ("Handbært fé frá rekstri", ["NetCashProvidedByUsedInOperatingActivities",
                           "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], "USD", "flow"),
    "capex": ("Fjárfesting í rekstrarfjármunum", ["PaymentsToAcquirePropertyPlantAndEquipment",
                           "PaymentsToAcquireProductiveAssets"], "USD", "flow"),
    "cash": ("Handbært fé", ["CashAndCashEquivalentsAtCarryingValue",
                           "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], "USD", "stock"),
    "longTermDebt": ("Langtímaskuldir", ["LongTermDebtNoncurrent", "LongTermDebt"], "USD", "stock"),
}


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))
    return None


def days(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def facts_for(cf, tags, unit):
    """Return deduplicated facts {(start,end): (val, filed, form)} for the first tag with recent data."""
    best, best_end = None, ""
    gaap = cf.get("facts", {}).get("us-gaap", {})
    for tag in tags:
        units = gaap.get(tag, {}).get("units", {}).get(unit)
        if not units:
            continue
        dedup = {}
        for f in units:
            if f.get("form") not in FILING_FORMS and not str(f.get("form", "")).startswith("10-"):
                continue
            key = (f.get("start"), f["end"])
            if key not in dedup or f["filed"] > dedup[key][1]:
                dedup[key] = (f["val"], f["filed"], f.get("form"), f.get("accn"))
        last = max((k[1] for k in dedup), default="")
        if last > best_end:
            best, best_end = dedup, last
    return best or {}


def quarterly(dedup, kind):
    """Discrete quarterly values keyed by period end date."""
    out = {}
    if kind == "stock":
        for (start, end), v in dedup.items():
            if start is None:
                out[end] = {"end": end, "val": v[0], "filed": v[1], "accn": v[3]}
        return out
    spans = {k: v for k, v in dedup.items() if k[0]}
    # direct quarters
    for (s, e), v in spans.items():
        if 80 <= days(s, e) <= 100:
            out[e] = {"start": s, "end": e, "val": v[0], "filed": v[1], "accn": v[3]}
    # derive missing quarters from year-to-date differences (cash flow items, fiscal Q4)
    by_start = {}
    for (s, e), v in spans.items():
        by_start.setdefault(s, []).append((e, v))
    for s, lst in by_start.items():
        lst.sort()
        for i in range(1, len(lst)):
            e, v = lst[i]
            pe, pv = lst[i - 1]
            if e in out:
                continue
            if 80 <= days(pe, e) <= 120 and days(s, e) > 150:
                out[e] = {"start": pe, "end": e, "val": v[0] - pv[0], "filed": v[1], "accn": v[3], "derived": True}
    return out


def pct(a, b):
    if a is None or b in (None, 0):
        return None
    return round((a - b) / abs(b) * 100, 1)


def find_prior_year(series, end):
    target = datetime.date.fromisoformat(end) - datetime.timedelta(days=365)
    cands = [k for k in series if abs((datetime.date.fromisoformat(k) - target).days) <= 20]
    return series[cands[0]] if cands else None


# ---------- Icelandic formatting ----------
def fmt_is(x, dec=1):
    s = f"{x:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def money(v_usd, rate):
    """'102,5 ma. USD (12.405 ma. kr.)'"""
    if v_usd is None:
        return None
    a = abs(v_usd)
    if a >= 1e9:
        usd = f"{fmt_is(v_usd / 1e9)} ma. USD"
    else:
        usd = f"{fmt_is(v_usd / 1e6, 0)} m. USD"
    isk = v_usd * rate
    isk_s = f"{fmt_is(isk / 1e9, 0)} ma. kr." if abs(isk) >= 1e9 else f"{fmt_is(isk / 1e6, 0)} m. kr."
    return f"{usd} ({isk_s})"


MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"]


def date_is(d):
    d = datetime.date.fromisoformat(d)
    return f"{d.day}. {MONTHS[d.month - 1]} {d.year}"


def change_is(p):
    if p is None:
        return ""
    if abs(p) < 0.05:
        return ", óbreytt frá sama tíma í fyrra"
    word = "aukning" if p > 0 else "samdráttur"
    return f", {word} um {fmt_is(abs(p))}% frá sama tíma í fyrra"


def summary_is(name, latest, rate):
    m = latest["metrics"]
    end = date_is(latest["periodEnd"])
    parts = []
    r = m.get("revenue")
    if r:
        parts.append(f"Tekjur {name} námu {money(r['value'], rate)} á ársfjórðungnum sem lauk {end}{change_is(r.get('yoy'))}.")
    n = m.get("netIncome")
    if n:
        verb = "Hagnaður nam" if n["value"] >= 0 else "Tap nam"
        val = money(abs(n["value"]), rate)
        parts.append(f"{verb} {val}{change_is(n.get('yoy'))}.")
    e = m.get("eps")
    if e:
        parts.append(f"Þynntur hagnaður á hlut var {fmt_is(e['value'], 2)} USD.")
    if m.get("operatingCashFlow") and m.get("capex"):
        fcf = m["operatingCashFlow"]["value"] - m["capex"]["value"]
        parts.append(f"Frjálst sjóðstreymi (handbært fé frá rekstri að frádreginni fjárfestingu) var {money(fcf, rate)}.")
    return " ".join(parts)


def write_if_changed(path, body, now):
    """Only bump the 'updated' stamp (and touch the file) when the content really changed,
    so the scheduled job does not create empty commits."""
    old = json.load(open(path)) if os.path.exists(path) else None
    if old is not None:
        old_updated = old.pop("updated", None)
        if old == body:
            return False
    json.dump({"updated": now, **body}, open(path, "w"), ensure_ascii=False, indent=1)
    return True


def main():
    os.makedirs(os.path.join(OUT, "companies"), exist_ok=True)
    wl = json.load(open(os.path.join(OUT, "watchlist.json")))
    watch = [w["ticker"] if isinstance(w, dict) else w for w in wl["tickers"]]
    display = {w["ticker"].upper(): w.get("name") for w in wl["tickers"] if isinstance(w, dict)}
    fx = get("https://api.frankfurter.dev/v2/rate/USD/ISK?providers=SBI")
    rate, rate_date = float(fx["rate"]), fx["date"]
    tick = get("https://www.sec.gov/files/company_tickers.json")
    cik_by = {v["ticker"].upper(): (str(v["cik_str"]).zfill(10), v["title"]) for v in tick.values()}

    prev_feed_path = os.path.join(OUT, "feed.json")
    prev = json.load(open(prev_feed_path)) if os.path.exists(prev_feed_path) else {"items": []}
    known = {i["accession"] for i in prev.get("items", [])}
    feed = list(prev.get("items", []))
    index = []

    for t in watch:
        if t.upper() not in cik_by:
            print(f"skip {t}: not found in SEC ticker list", file=sys.stderr); continue
        cik, title = cik_by[t.upper()]
        time.sleep(0.15)
        sub = get(f"https://data.sec.gov/submissions/CIK{cik}.json")
        time.sleep(0.15)
        cf = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")
        name = display.get(t.upper()) or sub.get("name", title)

        series = {}
        for key, (_, tags, unit, kind) in METRICS.items():
            series[key] = quarterly(facts_for(cf, tags, unit), kind)
        rev_ends = sorted(series["revenue"]) or sorted(series["netIncome"])
        if not rev_ends:
            print(f"skip {t}: no quarterly data", file=sys.stderr); continue
        quarters = []
        for end in rev_ends[-8:]:
            q = {"periodEnd": end, "metrics": {}}
            for key in METRICS:
                v = series[key].get(end)
                if not v:
                    continue
                if key == "eps" and v.get("derived"):
                    continue  # per-share figures are not additive; never derive them
                item = {"value": v["val"]}
                if METRICS[key][3] == "flow":
                    py = find_prior_year(series[key], end)
                    if py:
                        item["yoy"] = pct(v["val"], py["val"])
                    if v.get("derived"):
                        item["derived"] = True
                q["metrics"][key] = item
                q["filed"] = max(q.get("filed", ""), v["filed"])
                q["accession"] = v.get("accn")
            quarters.append(q)
        latest = quarters[-1]
        ttm = {}
        for key in ["revenue", "netIncome", "operatingCashFlow", "capex"]:
            vals = [series[key].get(e, {}).get("val") for e in rev_ends[-4:]]
            if len(vals) == 4 and all(v is not None for v in vals):
                ttm[key] = sum(vals)

        recent = sub.get("filings", {}).get("recent", {})
        filings = []
        for i, form in enumerate(recent.get("form", [])):
            if form not in ("10-K", "10-Q", "8-K"):
                continue
            items = recent.get("items", [""] * 999)[i] if recent.get("items") else ""
            if form == "8-K" and "2.02" not in (items or ""):
                continue
            acc = recent["accessionNumber"][i]
            doc = recent["primaryDocument"][i]
            url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/{doc}"
            filings.append({"form": form, "filed": recent["filingDate"][i], "accession": acc,
                            "reportDate": recent.get("reportDate", [""] * 999)[i], "url": url,
                            "kind": "Afkomutilkynning" if form == "8-K" else ("Ársskýrsla" if form.startswith("10-K") else "Ársfjórðungsuppgjör")})
            if len(filings) >= 8:
                break

        company = {"ticker": t.upper(), "cik": cik, "name": name, "sector": sub.get("sicDescription", ""),
                   "fiscalYearEnd": sub.get("fiscalYearEnd"), "latest": latest, "quarters": quarters, "ttm": ttm,
                   "summaryIs": summary_is(name, latest, rate), "filings": filings,
                   "source": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"}
        json.dump(company, open(os.path.join(OUT, "companies", f"{t.upper()}.json"), "w"), ensure_ascii=False, indent=1)
        index.append({"ticker": t.upper(), "name": name, "sector": company["sector"], "periodEnd": latest["periodEnd"],
                      "revenue": latest["metrics"].get("revenue", {}).get("value"),
                      "revenueYoY": latest["metrics"].get("revenue", {}).get("yoy"),
                      "netIncome": latest["metrics"].get("netIncome", {}).get("value"),
                      "lastFiled": filings[0]["filed"] if filings else latest.get("filed")})

        by_end = {q["periodEnd"]: q for q in quarters}
        for f in filings:
            if f["accession"] in known:
                continue
            headline = {"8-K": f"{name} birtir afkomutilkynningu", "10-Q": f"{name} skilar ársfjórðungsuppgjöri",
                        "10-K": f"{name} skilar ársskýrslu"}[f["form"]]
            if f["form"] == "8-K":
                text = ("Fréttatilkynning um afkomu var birt hjá SEC. Staðfestar tölur úr uppgjörinu "
                        "birtast hér þegar fyrirtækið skilar formlegu uppgjöri (10-Q eða 10-K).")
            else:
                q = by_end.get(f.get("reportDate"))
                text = summary_is(name, q, rate) if q else ""
            feed.append({"ticker": t.upper(), "name": name, "form": f["form"], "kind": f["kind"], "filed": f["filed"],
                         "periodEnd": f.get("reportDate"), "accession": f["accession"], "url": f["url"],
                         "headlineIs": headline, "summaryIs": text})
            known.add(f["accession"])
        print(f"ok {t}: {latest['periodEnd']} rev={latest['metrics'].get('revenue', {}).get('value')}")

    feed.sort(key=lambda i: (i["filed"], i["ticker"]), reverse=True)
    feed = feed[:200]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    index.sort(key=lambda c: c["name"])
    write_if_changed(prev_feed_path, {"items": feed}, now)
    write_if_changed(os.path.join(OUT, "index.json"),
                     {"fx": {"usdIsk": rate, "date": rate_date, "source": "Seðlabanki Íslands (via frankfurter.dev)"},
                      "companies": index}, now)
    print(f"done: {len(index)} companies, {len(feed)} feed items, USD/ISK {rate} ({rate_date})")


if __name__ == "__main__":
    main()
    # English twins for the one-language-at-a-time site (templates over the same verified figures).
    import finance_en
    finance_en.main()
