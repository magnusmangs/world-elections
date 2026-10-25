#!/usr/bin/env python3
"""Day-one Icelandic summaries of US earnings releases (8-K Item 2.02, Exhibit 99.1).

Pipeline per new earnings 8-K in data/finance/feed.json:
  1. Download Exhibit 99.1 from SEC EDGAR and reduce it to plain text.
  2. Ask Claude to EXTRACT figures (with the exact text they appear in) and to write a few
     Icelandic highlight sentences that contain NO digits.
  3. Verify in code. A figure is published only if:
       - its quote appears verbatim in the press release,
       - the number as written appears inside that quote,
       - number x multiplier equals the stated value (0.5% tolerance),
       - it is within a plausible range of the company's last reported quarter (XBRL).
     Highlight sentences are dropped if they contain any digit or advice words.
  4. Build the numeric Icelandic sentences from verified figures with fixed templates.
     Year-on-year change is computed here, never taken from the model.
  5. Anything that fails goes to data/finance/review.json and the feed keeps the neutral
     "release published" text with a link.

Needs ANTHROPIC_API_KEY. Without it the script exits quietly (nothing changes).
Modes:
  (default)  API mode, needs ANTHROPIC_API_KEY (paid).
  --prepare  Claude-session mode, step 1: download pending releases to data/finance/work/ and print instructions.
  --apply    Claude-session mode, step 2: verify data/finance/work/<accession>.answer.json and update the feed.
  --mock F   Test the verifier with a hand-written answer file (no changes written).
Options: --max 8 --days 10 --accession X
"""
import html, json, os, re, sys, time, datetime, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fundamentals import fmt_is, money, date_is, change_is, get, UA  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIN = os.path.join(ROOT, "data", "finance")
REL = os.path.join(FIN, "releases")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
METRICS = {"revenue", "operatingIncome", "netIncome", "eps"}
MULTIPLIERS = {1, 1_000, 1_000_000, 1_000_000_000}
NUMBER_WORDS = re.compile(r"(prósent|milljarð|milljón|milljón|þúsund|helming|tvöf|þrefald|tug|hundr)", re.I)
ADVICE = re.compile(r"(kaupa bréf|selja bréf|kauptækifær|söluráð|mæl(um|i|ir) með|ráðlegg|fjárfestingarráð|ættir að|ætti að kaupa|ætti að selja|góð kaup|gott tækifæri)", re.I)
AI_LABEL = "Unnið sjálfvirkt með gervigreind úr afkomutilkynningu. Allar tölur eru sannreyndar orðrétt gegn frumtextanum."

SYSTEM = """You extract figures from a US company's earnings press release for an Icelandic news service.
Return ONLY a JSON object, no prose, with this shape:
{
 "periodEnd": "YYYY-MM-DD",            // last day of the quarter the release reports
 "figures": [
   {"metric": "revenue|operatingIncome|netIncome|eps",
    "period": "current|prior_year",     // prior_year = same quarter one year earlier
    "basis": "GAAP|non-GAAP",
    "as_written": "the number exactly as printed, e.g. 109,417 or 29.8 or 2.02",
    "multiplier": 1 | 1000 | 1000000 | 1000000000,   // e.g. 1000000 if the table is 'in millions'
    "value": number,                    // as_written x multiplier, in USD (EPS in USD per share)
    "quote": "the exact contiguous text from the release that contains as_written (copy it character for character, max 300 chars)"}
 ],
 "highlights_is": ["2 to 4 short neutral sentences in correct Icelandic about what the company says drove the quarter. NO digits, NO numbers written as words, NO opinions, NO investment advice."],
 "guidance_is": "one neutral Icelandic sentence about outlook if the release gives one, with NO digits; otherwise empty string"
}
Rules: Prefer GAAP figures. Only include a figure if you can quote the exact text it appears in.
Never compute or round numbers yourself; copy them. Total revenue only (not segments). Diluted EPS for eps."""


# ---------- SEC ----------
def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def exhibit_991(cik, accession):
    base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/"
    idx = fetch_text(base + accession + "-index.htm")
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", idx, re.S):
        cells = [re.sub("<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) >= 4 and cells[3].upper().startswith("EX-99.1"):
            href = re.search(r'href="([^"]+)"', row)
            if href:
                return "https://www.sec.gov" + href.group(1)
    return None


def normalize(s):
    s = html.unescape(s).replace(" ", " ").replace("’", "'").replace("—", "-").replace("–", "-")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\$\s+", "$", s)
    s = re.sub(r"\s+([%)])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    return s.strip()


def html_to_text(h):
    h = re.sub(r"(?is)<(script|style).*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", h)
    h = re.sub(r"(?i)</t[dh]>", " ", h)
    h = re.sub(r"<[^>]+>", " ", h)
    return normalize(h)


# ---------- Claude ----------
def ask_claude(text, company):
    key = os.environ["ANTHROPIC_API_KEY"]
    body = {"model": MODEL, "max_tokens": 2000, "system": SYSTEM,
            "messages": [{"role": "user", "content": f"Company: {company}\n\nPRESS RELEASE TEXT:\n{text[:120000]}"}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read().decode())
            raw = "".join(b.get("text", "") for b in out.get("content", []))
            m = re.search(r"\{.*\}", raw, re.S)
            return json.loads(m.group(0))
        except Exception as e:
            if i == 2:
                raise
            time.sleep(5 * (i + 1))


# ---------- verification ----------
def parse_written(s):
    t = s.strip().replace("$", "").replace(",", "").replace(" ", "")
    neg = t.startswith("(") and t.endswith(")") or t.startswith("-")
    t = t.strip("()-")
    t = re.sub(r"(billion|million|thousand|bn|m)$", "", t, flags=re.I)
    v = float(t)
    return -v if neg else v


def verify_figure(f, source, last_xbrl):
    """Return (ok, reason)."""
    try:
        if f.get("metric") not in METRICS:
            return False, "unknown metric"
        q, w = normalize(f.get("quote", "")), normalize(f.get("as_written", ""))
        if not q or not w:
            return False, "missing quote"
        if q not in source:
            return False, "quote not found verbatim in release"
        if w not in q:
            return False, "number not inside quote"
        mult = int(f.get("multiplier", 1))
        if mult not in MULTIPLIERS:
            return False, "bad multiplier"
        if f["metric"] == "eps" and mult != 1:
            return False, "eps multiplier must be 1"
        calc = parse_written(w) * mult
        val = float(f.get("value"))
        if abs(calc - val) > max(abs(val) * 0.005, 0.005):
            return False, f"value {val} != as_written x multiplier {calc}"
        ref = last_xbrl.get(f["metric"])
        if f["metric"] == "revenue" and ref and f.get("period") == "current" and not (0.25 <= val / ref <= 4):
            return False, f"implausible vs last reported quarter revenue ({ref})"
        if f["metric"] == "eps" and abs(val) > 1000:
            return False, "implausible EPS"
        return True, "ok"
    except Exception as e:
        return False, f"error: {e}"


def cross_check(checked):
    """Profit lines can swing wildly (one-off charges), so instead of comparing them with last
    quarter we require them to sit in the same table units as revenue and below 2x revenue."""
    bad = []
    for period in ("current", "prior_year"):
        rev = checked.get(("revenue", period))
        for m in ("netIncome", "operatingIncome"):
            f = checked.get((m, period))
            if not f:
                continue
            if not rev:
                if period == "current":
                    bad.append((m, period, "no verified revenue to cross-check against"))
                continue
            if abs(float(f["value"])) > 2 * abs(float(rev["value"])):
                bad.append((m, period, "larger than twice revenue"))
            elif int(f["multiplier"]) != int(rev["multiplier"]) and int(rev["multiplier"]) != 1_000_000_000 and int(f["multiplier"]) != 1_000_000_000:
                bad.append((m, period, "units differ from revenue table"))
    return bad


def _unused():
    try:
        pass
        return True, "ok"
    except Exception as e:
        return False, f"error: {e}"


def clean_sentence(s):
    s = (s or "").strip()
    if not s or re.search(r"\d", s) or NUMBER_WORDS.search(s) or ADVICE.search(s) or len(s) > 300:
        return None
    return s if s.endswith(".") else s + "."


def build(company_name, model_out, source, last_xbrl, rate):
    checked, rejected = {}, []
    for f in model_out.get("figures", []):
        ok, why = verify_figure(f, source, last_xbrl)
        key = (f.get("metric"), f.get("period"))
        if ok:
            # prefer GAAP if both present
            if key not in checked or (checked[key].get("basis") != "GAAP" and f.get("basis") == "GAAP"):
                checked[key] = f
        else:
            rejected.append({**f, "reason": why})
    for m, period, why in cross_check(checked):
        rejected.append({**checked.pop((m, period)), "reason": why})
    pe = model_out.get("periodEnd", "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", pe or ""):
        return None, checked, rejected + [{"reason": "missing or invalid periodEnd"}]
    cur = lambda m: checked.get((m, "current"))
    prv = lambda m: checked.get((m, "prior_year"))
    if not cur("revenue"):
        return None, checked, rejected + [{"reason": "revenue could not be verified"}]

    def yoy(m):
        a, b = cur(m), prv(m)
        if not a or not b or float(b["value"]) == 0:
            return None
        return round((float(a["value"]) - float(b["value"])) / abs(float(b["value"])) * 100, 1)

    parts = [f"Samkvæmt afkomutilkynningu námu tekjur {company_name} {money(float(cur('revenue')['value']), rate)} "
             f"á ársfjórðungnum sem lauk {date_is(pe)}{change_is(yoy('revenue'))}."]
    if cur("netIncome"):
        v = float(cur("netIncome")["value"])
        parts.append(f"{'Hagnaður' if v >= 0 else 'Tap'} nam {money(abs(v), rate)}{change_is(yoy('netIncome'))}.")
    if cur("eps"):
        parts.append(f"Þynntur hagnaður á hlut var {fmt_is(float(cur('eps')['value']), 2)} USD.")
    highlights = [s for s in (clean_sentence(x) for x in model_out.get("highlights_is", [])[:4]) if s]
    guidance = clean_sentence(model_out.get("guidance_is", ""))
    text = " ".join(parts + highlights + ([guidance] if guidance else []))
    basis = {k[0]: v.get("basis") for k, v in checked.items() if k[1] == "current"}
    return {"periodEnd": pe, "summaryIs": text, "basis": basis}, checked, rejected


# ---------- main ----------
WORK = os.path.join(FIN, "work")  # scratch files for the Claude-session mode, never committed


def apply_result(item, url, out, source, co, rate, review, model_name):
    last = {k: v["value"] for k, v in co["latest"]["metrics"].items()}
    result, checked, rejected = build(co["name"], out, source, last, rate)
    os.makedirs(REL, exist_ok=True)
    record = {"accession": item["accession"], "ticker": item["ticker"], "exhibit": url, "model": model_name,
              "processed": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
              "verified": [{"metric": k[0], "period": k[1], **v} for k, v in checked.items()],
              "rejected": rejected, "result": result}
    json.dump(record, open(os.path.join(REL, f"{item['accession']}.json"), "w"), ensure_ascii=False, indent=1)
    if result:
        item["summaryIs"] = result["summaryIs"]
        item["periodEnd"] = result["periodEnd"]
        item["ai"] = {"status": "verified", "label": AI_LABEL, "exhibit": url, "rejected": len(rejected)}
        print(f"{item['ticker']}: verified ({len(checked)} figures, {len(rejected)} rejected)")
    else:
        item["ai"] = {"status": "needs_review"}
        review["items"].append({"accession": item["accession"], "ticker": item["ticker"], "filed": item["filed"],
                                "exhibit": url, "reasons": [r.get("reason") for r in rejected][:10]})
        print(f"{item['ticker']}: needs review: {[r.get('reason') for r in rejected][:3]}")
    return record


def main():
    args = sys.argv[1:]
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    mode = "prepare" if "--prepare" in args else "apply" if "--apply" in args else "mock" if "--mock" in args else "api"
    if mode == "api" and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set; skipping API mode. (Use --prepare / --apply for the Claude-session mode.)")
        return
    max_n, days = int(opt("--max", 8)), int(opt("--days", 10))
    feed_path = os.path.join(FIN, "feed.json")
    feed = json.load(open(feed_path))
    rate = json.load(open(os.path.join(FIN, "index.json")))["fx"]["usdIsk"]
    review_path = os.path.join(FIN, "review.json")
    review = json.load(open(review_path)) if os.path.exists(review_path) else {"items": []}
    cutoff = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    only = opt("--accession")
    todo = [i for i in feed["items"] if i["form"] == "8-K" and not i.get("ai") and
            (i["accession"] == only if only else i["filed"] >= cutoff)][:max_n]
    os.makedirs(WORK, exist_ok=True)

    if mode == "prepare":
        n = 0
        for item in todo:
            co = json.load(open(os.path.join(FIN, "companies", f"{item['ticker']}.json")))
            url = exhibit_991(co["cik"], item["accession"])
            if not url:
                item["ai"] = {"status": "no_exhibit"}; continue
            txt = os.path.join(WORK, f"{item['accession']}.txt")
            open(txt, "w").write(f"Company: {co['name']} ({item['ticker']})\nExhibit: {url}\n\n" + html_to_text(fetch_text(url)))
            json.dump({"url": url}, open(os.path.join(WORK, f"{item['accession']}.meta.json"), "w"))
            print(f"PENDING {item['ticker']} {item['filed']}: read {os.path.relpath(txt, ROOT)} "
                  f"-> write data/finance/work/{item['accession']}.answer.json")
            n += 1
        json.dump(feed, open(feed_path, "w"), ensure_ascii=False, indent=1)
        if n:
            print("\nINSTRUCTIONS FOR EACH ANSWER FILE:\n" + SYSTEM)
        else:
            print("No new earnings releases to summarise.")
        return

    changed, record = False, None
    for item in todo:
        co = json.load(open(os.path.join(FIN, "companies", f"{item['ticker']}.json")))
        try:
            if mode == "apply":
                ans = os.path.join(WORK, f"{item['accession']}.answer.json")
                if not os.path.exists(ans):
                    continue
                url = json.load(open(os.path.join(WORK, f"{item['accession']}.meta.json")))["url"]
                body = open(os.path.join(WORK, f"{item['accession']}.txt")).read()
                source = normalize(body.split("\n\n", 1)[1])
                raw = open(ans).read()
                out = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
                model_name = "claude (scheduled session)"
            else:
                url = exhibit_991(co["cik"], item["accession"])
                if not url:
                    item["ai"] = {"status": "no_exhibit"}; changed = True; continue
                source = html_to_text(fetch_text(url))
                out = json.load(open(opt("--mock"))) if mode == "mock" else ask_claude(source, co["name"])
                model_name = None if mode == "mock" else MODEL
        except Exception as e:
            print(f"{item['ticker']}: error {e}", file=sys.stderr); continue
        if mode == "mock":
            last = {k: v["value"] for k, v in co["latest"]["metrics"].items()}
            result, checked, rejected = build(co["name"], out, source, last, rate)
            print(json.dumps({"result": result, "rejected": rejected}, ensure_ascii=False, indent=1)[:2500])
            continue
        record = apply_result(item, url, out, source, co, rate, review, model_name)
        changed = True
    if changed:
        json.dump(feed, open(feed_path, "w"), ensure_ascii=False, indent=1)
        json.dump(review, open(review_path, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
    # English twins for the one-language-at-a-time site (templates over the same verified figures).
    import finance_en
    finance_en.main()
