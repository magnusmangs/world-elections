# Daily election news (scheduled Claude session)

Goal: 3 to 10 short, sourced Icelandic news items per day about national elections in the next 30 days
and results from the last 7 days. Neutral, accurate, and always credited.

1. `python3 scripts/build.py` then open `data/elections.json` and list countries voting within 30 days.
2. For each (closest dates first), search recent news (last 7 days) from outlets in `data/news/sources.json`.
   Use separate searches for different parties or candidates so coverage is balanced. Skip opinion pieces.
3. Open every article you use (WebFetch) and confirm the headline, publication date and the facts you report.
   Do not rely on search snippets. Paywalled article: use only what is visible, or skip it.
4. Add items to `data/news/articles.json` (newest first). Fields:
   `id` (iso3-date-outlet), `section` "kosningar", `iso3`, `published` (article date, YYYY-MM-DD), `added` (today),
   `titleIs` (own words, max 140 chars), `summaryIs` (own words, max 3 sentences / 420 chars),
   `source` (outlet name; add the pollster in brackets if relevant), `url` (canonical https link).
   - Write the summary yourself in Icelandic. Never translate whole sentences from the article.
     No quotation longer than 15 words. Report polls with pollster and date.
   - One item per story; do not add a second item that repeats an existing one.
   - New outlet? Add its domain to `data/news/sources.json` only if it is a reputable news organisation,
     public broadcaster, election authority or research institute.
5. If an article shows that the election data itself is wrong or outdated (new leader, new party leading polls,
   moved date, resignation), fix `data/countries/<ISO3>.json` too, cite the article in its sources, and set lastReviewed.
6. After an election: add the result to that country's `lastElection` {date, type, outcome (English), outcomeIs (Icelandic)}
   from an official or wire source, and remove the past entry from `elections`.
7. Run `python3 scripts/build.py` and `python3 scripts/news.py --strict`. Fix every INVALID line.
8. Commit `data/` as `News <date>: <countries>` and push to main (git pull --rebase first). Never force-push.
9. Report briefly: items added, data corrections made, anything you could not verify.
