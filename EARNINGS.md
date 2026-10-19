# Day-one earnings summaries (Claude scheduled session, no API key)

Run on weekdays. Each step is required.

1. `python3 scripts/fundamentals.py` (refresh filings feed; new 8-K earnings releases appear).
2. `python3 scripts/press_releases.py --prepare --max 8 --days 10`
   It lists every pending release as `data/finance/work/<accession>.txt` and prints the extraction rules.
   If it prints "No new earnings releases to summarise." stop here and report that.
3. For each pending file: read the whole .txt, then write `data/finance/work/<accession>.answer.json`
   exactly in the JSON shape the rules describe.
   - Copy every number and every quote character for character from the .txt. Never round or compute.
   - Quotes must be contiguous text from the file (table rows are fine, e.g. "Net income $15,305 $21,155 $14,393").
   - Include current and prior-year values for revenue, net income and diluted EPS when the release shows them.
   - periodEnd: the quarter-end date. If the release does not state it, use the company's last quarter end in
     data/finance/companies/<TICKER>.json plus 13 weeks (or the calendar quarter end if it reports on calendar quarters).
   - highlights_is / guidance_is: correct, neutral Icelandic, no digits, no numbers in words, no opinions or advice.
4. Sync first so you apply on the newest data (the 30-minute GitHub job also updates data/finance):
   `git checkout -- data/finance && git pull --rebase origin main`, then run
   `python3 scripts/press_releases.py --apply` verifies every figure in code. Only verified figures are published.
   Rejected figures are logged in data/finance/releases/<accession>.json; unverifiable releases go to data/finance/review.json.
5. Commit `data/finance` (not data/finance/work) as `Earnings summaries <date>: <tickers>` and push to main.
   Do this immediately after step 4. If the push is rejected because main moved, repeat step 4 and 5 once
   (the answer files in data/finance/work survive the reset). The push triggers the Vercel deploy. Never force-push.
6. Report in a few lines: which releases were published, how many figures were rejected and why, anything in review.json.
