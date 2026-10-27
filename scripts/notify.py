#!/usr/bin/env python3
"""Email election-night alerts through Brevo when a country's `live` block changes.

Usage: python3 scripts/notify.py <before-sha> [--dry-run]
Compares data/live.json at <before-sha> with the working tree. For each country whose live figures changed
(status, results, blocs, counted or headline; a new timestamp alone does not count) it sends one campaign
per language list. When `live` is removed and `lastElection` holds the result, it sends a final-result email.

Env: BREVO_API_KEY, BREVO_LIST_IS, BREVO_LIST_EN, BREVO_SENDER_EMAIL, optional BREVO_SENDER_NAME, SITE_URL.
Without the key or lists it prints what it would send and exits 0, so pushes never fail on it.
"""
import json, os, subprocess, sys, html, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL", "https://world-elections.vercel.app").rstrip("/")
SENDER = os.environ.get("BREVO_SENDER_EMAIL") or "magnusomagnusson@icloud.com"  # must be a verified Brevo sender
KEYS = ("status", "results", "blocs", "counted", "headline")
STATUS = {"polls-open": ("Kjörstaðir opnir", "Polls open"), "exit-poll": ("Útgönguspár", "Exit polls"),
          "counting": ("Talning stendur yfir", "Count under way"), "final": ("Lokatölur", "Final count")}
MONTHS_IS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"]
MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def load_live(sha):
    try:
        raw = subprocess.check_output(["git", "-C", ROOT, "show", f"{sha}:data/live.json"], stderr=subprocess.DEVNULL)
        return json.loads(raw).get("countries", {})
    except Exception:
        return {}


def T(o, f, en):
    return (o.get(f) if en else (o.get(f + "Is") or o.get(f))) or ""


def when(iso, en):
    d = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(datetime.timezone.utc)
    hm = d.strftime("%H:%M")
    return f"{hm} GMT, {d.day} {MONTHS_EN[d.month-1]}" if en else f"kl. {hm}, {d.day}. {MONTHS_IS[d.month-1]}"


def num(v, en):
    return str(v) if en else str(v).replace(".", ",")


def bars(rows, maxv):
    out = []
    for name, val, color, label in rows:
        w = max(1, round(val / maxv * 100)) if maxv else 1
        out.append(f'<tr><td style="padding:3px 8px 3px 0;font-size:14px;white-space:nowrap">{html.escape(name)}</td>'
                   f'<td style="width:100%;padding:3px 0"><div style="background:{color};height:12px;width:{w}%;border-radius:3px"></div></td>'
                   f'<td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;text-align:right">{html.escape(label)}</td></tr>')
    return '<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0">' + "".join(out) + "</table>"


def live_email(c, lv, en):
    name = T(c, "name", en)
    st = STATUS.get(lv.get("status"), STATUS["counting"])[1 if en else 0]
    parties = {p.get("abbr") or p["name"]: p for p in c.get("parties", [])}
    seats = lv.get("unit", "seats") != "percent"
    rows = []
    for r in sorted(lv.get("results", []), key=lambda r: -r["value"]):
        p = parties.get(r["abbr"], {})
        rows.append((p.get("abbr") or r["abbr"], r["value"], p.get("color") or r.get("color") or "#999",
                     num(r["value"], en) + ("" if seats else "%")))
    maj = (c.get("chamber") or {}).get("majority")
    body = f'<p style="margin:0 0 4px;color:#b0124f;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:12px">{html.escape(st)}</p>'
    body += f'<h1 style="margin:0 0 6px;font-size:22px">{html.escape(name)}</h1>'
    if lv.get("headline"):
        body += f'<p style="font-size:17px;font-weight:600;margin:8px 0">{html.escape(T(lv, "headline", en))}</p>'
    if lv.get("blocs"):
        body += bars([(T(b, "name", en), b["value"], b.get("color") or "#999", str(b["value"])) for b in lv["blocs"]], max(b["value"] for b in lv["blocs"]))
    if rows:
        body += bars(rows, max([maj or 0] + [r[1] for r in rows]))
        if seats and maj:
            body += f'<p style="font-size:13px;color:#586472;margin:0">{"Majority" if en else "Meirihluti"}: {maj} {"seats" if en else "sæti"}.</p>'
    cap = T(lv, "sourceName", en) + "."
    if isinstance(lv.get("counted"), (int, float)):
        cap += f' {num(lv["counted"], en)}% {"of votes counted" if en else "atkvæða talin"}.'
    if lv.get("note"):
        cap += " " + T(lv, "note", en)
    body += f'<p style="font-size:13px;color:#586472">{html.escape(cap)}<br>{"Updated" if en else "Uppfært"} {html.escape(when(lv["updated"], en))}.</p>'
    subject = f"{name}: {st.lower() if not en else st}" + (f" ({T(lv, 'headline', en)[:80]})" if lv.get("headline") else "")
    return subject, body


def final_email(c, en):
    le = c.get("lastElection") or {}
    name = T(c, "name", en)
    body = f'<p style="margin:0 0 4px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:12px">{"Result" if en else "Úrslit"}</p>'
    body += f'<h1 style="margin:0 0 6px;font-size:22px">{html.escape(name)}</h1>'
    if le.get("winner"):
        body += f'<p style="font-size:17px;font-weight:600;margin:8px 0">{html.escape(T(le, "winner", en))}</p>'
    if le.get("outcome"):
        body += f'<p style="font-size:15px">{html.escape(T(le, "outcome", en))}</p>'
    return f'{name}: {"result" if en else "úrslit"}', body


def wrap(body, iso, en):
    link = f"{SITE}/{'?lang=en' if en else ''}#{iso.lower()}"
    return (f'<!doctype html><html><body style="margin:0;padding:0;background:#eef2f5">'
            f'<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#17202b;background:#fff">'
            f'{body}<p style="margin:18px 0"><a href="{link}" style="background:#b0124f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">'
            f'{"See it on the site" if en else "Sjá á síðunni"}</a></p>'
            f'<p style="font-size:12px;color:#586472;border-top:1px solid #d9e0e6;padding-top:12px">'
            f'{"You signed up for election alerts on" if en else "Þú skráðir þig á kosningavaktina á"} {html.escape(SITE.replace("https://", ""))}. '
            f'<a href="{{{{ unsubscribe }}}}" style="color:#586472">{"Unsubscribe" if en else "Afskrá"}</a></p>'
            f'</div></body></html>')


def brevo(path, payload):
    req = urllib.request.Request("https://api.brevo.com/v3" + path, data=json.dumps(payload).encode() if payload is not None else b"",
                                 method="POST", headers={"api-key": os.environ["BREVO_API_KEY"], "content-type": "application/json", "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else {}


def send(subject, htmlc, list_id, dry):
    if dry:
        print(f"  [dry-run] list {list_id}: {subject}"); return
    stamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    camp = brevo("/emailCampaigns", {"name": f"{subject[:60]} {stamp}", "subject": subject[:150], "htmlContent": htmlc,
                                    "sender": {"name": os.environ.get("BREVO_SENDER_NAME", "Kosningar í heiminum"), "email": SENDER},
                                    "recipients": {"listIds": [list_id]}})
    brevo(f"/emailCampaigns/{camp['id']}/sendNow", None)
    print(f"  sent campaign {camp['id']} to list {list_id}: {subject}")


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    before = sys.argv[1]
    dry = "--dry-run" in sys.argv
    old = load_live(before) if before and set(before) != {"0"} else {}
    new = json.load(open(os.path.join(ROOT, "data", "live.json"), encoding="utf-8")).get("countries", {})
    lists = {"is": os.environ.get("BREVO_LIST_IS") or "3", "en": os.environ.get("BREVO_LIST_EN") or "4"}  # Brevo list IDs
    if not (os.environ.get("BREVO_API_KEY") and SENDER and any(lists.values())):
        print("Brevo is not configured; dry run only."); dry = True
    jobs = []
    for iso, lv in new.items():
        prev = old.get(iso)
        if lv.get("status") == "polls-open":
            continue  # no email until there are figures
        if prev and all(prev.get(k) == lv.get(k) for k in KEYS):
            continue
        jobs.append((iso, lv))
    for iso in old:
        if iso not in new:
            jobs.append((iso, None))
    if not jobs:
        print("No live changes to email."); return
    for iso, lv in jobs:
        c = json.load(open(os.path.join(ROOT, "data", "countries", f"{iso}.json"), encoding="utf-8"))
        if lv is None and not (c.get("lastElection") or {}).get("winner"):
            continue
        print(iso)
        for lang, lid in lists.items():
            if not lid and not dry:
                continue
            en = lang == "en"
            subject, body = live_email(c, lv, en) if lv else final_email(c, en)
            try:
                send(subject, wrap(body, iso, en), int(lid or 0), dry)
            except Exception as e:  # never block a deploy on email
                print(f"  failed for list {lid}: {e}")


if __name__ == "__main__":
    main()
