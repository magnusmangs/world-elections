#!/usr/bin/env python3
"""Brennidepill (focus): validate topic files and write the index.

One file per topic in data/brennidepill/<id>.json. The page (/brennidepill) reads index.json for the list
and the topic file for a single topic (/brennidepill/<id>). Procedure for writing a topic: BRENNIDEPILL.md.

Checks: required fields, an Icelandic twin (suffix Is) for every text field, source ids that exist,
at least two camps in `sides`, sources from at least two camps and at least one domestic outlet,
known `level` and `status` values, no em dashes. Exit code 1 on any error.
"""
import datetime
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "data", "brennidepill")
LEVELS = {"confirmed", "single", "disputed"}
STATUS = {"developing", "settled", "archived"}
CAMPS = {"liberal", "centre", "right", "left", "state", "intl", "ref", "official"}
TWINS = {
    "": ["title", "dek"],
    "facts": ["text"], "timeline": ["text"], "next": ["text"], "unknowns": ["text"],
    "sides": ["camp", "view"], "disputed": ["q", "a", "b", "status"],
    "media": ["group", "frame"], "numbers": ["value", "label"],
}


def check(t, fname):
    errs = []
    stem = os.path.splitext(os.path.basename(fname))[0]
    if t.get("id") != stem:
        errs.append(f"id must equal file name ({stem})")
    for k in ("id", "iso3", "status", "started", "updated", "title", "dek", "bottomLine", "facts", "sides", "sources", "method"):
        if not t.get(k):
            errs.append(f"missing {k}")
    if t.get("status") not in STATUS:
        errs.append(f"status must be one of {sorted(STATUS)}")
    if not re.fullmatch(r"[A-Z]{3}", t.get("iso3", "")):
        errs.append("iso3 must be three capital letters")
    try:
        datetime.date.fromisoformat(t.get("started", ""))
        datetime.datetime.strptime(t.get("updated", ""), "%Y-%m-%dT%H:%MZ")
    except ValueError:
        errs.append("started must be YYYY-MM-DD and updated YYYY-MM-DDTHH:MMZ")
    for k in ("bottomLine", "method"):
        if t.get(k) and not t.get(k + "Is"):
            errs.append(f"missing {k}Is")
    if len(t.get("bottomLine") or []) != len(t.get("bottomLineIs") or []):
        errs.append("bottomLine and bottomLineIs need the same number of lines")
    for block, fields in TWINS.items():
        rows = [t] if not block else t.get(block) or []
        for i, row in enumerate(rows):
            for f in fields:
                if row.get(f) and not row.get(f + "Is"):
                    errs.append(f"{block or 'topic'}[{i}].{f} has no {f}Is")
            for f in ("quote", "quoteBy"):
                if row.get(f) and not row.get(f + "Is"):
                    errs.append(f"{block}[{i}].{f} has no {f}Is")
    ids = {}
    for s in t.get("sources", []):
        for k in ("id", "outlet", "camp", "lang", "title", "url"):
            if not s.get(k):
                errs.append(f"source {s.get('id')} missing {k}")
        if s.get("camp") not in CAMPS:
            errs.append(f"source {s.get('id')}: camp must be one of {sorted(CAMPS)}")
        if not str(s.get("url", "")).startswith("https://"):
            errs.append(f"source {s.get('id')}: url must be https")
        if s.get("id") in ids:
            errs.append(f"duplicate source id {s.get('id')}")
        ids[s.get("id")] = s
    used = set()
    for block in ("facts", "timeline", "sides", "disputed", "numbers", "next"):
        for i, row in enumerate(t.get(block) or []):
            for sid in row.get("src", []):
                used.add(sid)
                if sid not in ids:
                    errs.append(f"{block}[{i}] cites unknown source {sid}")
    for i, g in enumerate(t.get("media") or []):
        for sid in g.get("outlets", []):
            used.add(sid)
            if sid not in ids:
                errs.append(f"media[{i}] cites unknown source {sid}")
    for sid in ids:
        if sid not in used:
            errs.append(f"source {sid} is never cited")
    for i, f in enumerate(t.get("facts") or []):
        if f.get("level") not in LEVELS:
            errs.append(f"facts[{i}].level must be one of {sorted(LEVELS)}")
        if f.get("level") == "confirmed" and len({ids[s]["outlet"] for s in f.get("src", []) if s in ids}) < 2:
            errs.append(f"facts[{i}] is 'confirmed' but cites fewer than two outlets")
    if len(t.get("sides") or []) < 2:
        errs.append("sides needs at least two camps")
    camps = {s["camp"] for s in ids.values() if s.get("camp") not in ("ref",)}
    if len(camps) < 2:
        errs.append("sources must come from at least two camps")
    if not any(s.get("camp") not in ("intl", "ref") for s in ids.values()):
        errs.append("needs at least one domestic outlet")
    if "—" in json.dumps(t, ensure_ascii=False):
        errs.append("contains an em dash")
    return errs


def main():
    topics, bad = [], 0
    for fname in sorted(glob.glob(os.path.join(DIR, "*.json"))):
        if os.path.basename(fname) == "index.json":
            continue
        t = json.load(open(fname, encoding="utf-8"))
        errs = check(t, fname)
        if errs:
            bad += 1
            print(f"INVALID {os.path.basename(fname)}:\n  " + "\n  ".join(errs))
            continue
        topics.append({k: t.get(k) for k in ("id", "iso3", "status", "started", "updated", "title", "titleIs", "dek", "dekIs")}
                      | {"sources": len(t["sources"]), "outlets": len({s["outlet"] for s in t["sources"]})})
    topics.sort(key=lambda x: x["updated"], reverse=True)
    topics.sort(key=lambda x: x["status"] == "archived")
    out = {"updated": max((t["updated"] for t in topics), default=None), "topics": topics}
    json.dump(out, open(os.path.join(DIR, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK: {len(topics)} focus topics" + (f", {bad} invalid" if bad else ""))
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
