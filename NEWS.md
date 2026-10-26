# Daily election news (scheduled Claude session)

The site shows one language at a time (Icelandic by default, English with the IS / EN toggle), so every item is written
in both languages. Never leave one language out: a page that mixes languages looks unprofessional.

Goal: 3 to 10 short, sourced news items per day (Icelandic and English) about national elections in the next 30 days
and results from the last 7 days. Neutral, accurate, and always credited.

1. `python3 scripts/build.py` then open `data/elections.json` and list countries voting within 30 days.
2. For each (closest dates first), search recent news (last 7 days) from outlets in `data/news/sources.json`.
   Use separate searches for different parties or candidates so coverage is balanced. Skip opinion pieces.
3. Open and read every article you use (WebFetch) and confirm the headline, publication date and the facts you report.
   Never rely on headlines or search snippets. Set `"basis": "article"` on every item. Prefer free-to-read articles;
   if you use a paywalled one, use only what you could read and set `"paywall": true`. Skip outlets marked
   `readable: false` in outlets.json as sources.
4. Add items to `data/news/articles.json` (newest first). Fields:
   `id` (iso3-date-outlet), `section` "kosningar", `iso3`, `published` (article date, YYYY-MM-DD), `added` (today),
   `titleIs` (own words, max 140 chars), `summaryIs` (own words, max 3 sentences / 420 chars),
   `titleEn` and `summaryEn` (the same item in English, same limits, same facts),
   `source` (outlet name; add the pollster in brackets if relevant; if that contains Icelandic words such as "Stöð 12",
   add `sourceEn` with the English form), `url` (canonical https link).
   - Write the summaries yourself, in Icelandic and in English. Never translate whole sentences from the article.
   - Names: never invent an Icelandic name for a party, list, alliance, TV channel or institution. Use the Icelandic
     form only when it is established in Icelandic media; otherwise keep the original name (Studentska lista, Lega,
     Channel 12), matching `nameIs` in the country file.
     No quotation longer than 15 words. Report polls with pollster and date.
   - One item per story; do not add a second item that repeats an existing one.
   - New outlet? Add its domain to `data/news/sources.json` only if it is a reputable news organisation,
     public broadcaster, election authority or research institute.
5. If an article shows that the election data itself is wrong or outdated (new leader, new party leading polls,
   moved date, resignation), fix `data/countries/<ISO3>.json` too, cite the article in its sources, and set lastReviewed.
   Every English text field there has an Icelandic twin (`summary` / `summaryIs`, `policies` / `policiesIs` ...):
   update both. `build.py` fails if a twin is missing.
6. After an election: add the result to that country's `lastElection` {date, type, outcome (English), outcomeIs (Icelandic), winner, winnerIs, result ("new" or "incumbent", see UPDATING.md step 1; leave out while a run-off is pending)}
   from an official or wire source, and remove the past entry from `elections`.
7. Perspectives (Sjónarhorn), 1 to 2 per day for the biggest stories:
   - Run `python3 scripts/headlines.py`, then open `data/news/headlines/<ISO3>.json` for the countries in the news.
     `domestic` is what the country's own outlets lead with; `foreign` is coverage by outlets in other countries.
   - Pick a story covered by outlets in at least 2 (ideally 3+) different countries, including at least one domestic
     outlet where possible. Prefer outlets of different types (public broadcaster, newspaper, state media).
   - Open and read each article (WebFetch). Every perspective must rest on the article itself: set `"basis": "article"`.
     Headline-only perspectives are not allowed. If an outlet blocks reading (outlets.json `readable: false`) or the
     article cannot be opened, leave that outlet out; never work around a block. If fewer than 2 readable outlets from
     2 countries remain, do not publish the perspective.
   - Find article URLs through WebSearch (search the headline) so they can be opened; prefer free-to-read articles and
     set `"paywall": true` on any item or perspective whose article needs a subscription.
   - Add an item with `"type": "sjonarhorn"` and `perspectives`: [{outlet, country (ISO3), published, basis
     ("article" or "headline"), url, framingIs, framingEn}]. framingIs / framingEn describe, in neutral Icelandic and
     English, what that outlet emphasises (max 260 chars each). summaryIs / summaryEn state the main differences without
     judging which outlet is right.
   - State media must be described as such; the registry's `type` field says which outlets are state-run.
8. Outlet registry: if a country in the news has no domestic outlet in `data/news/outlets.json`, add 1 to 3 of its
   leading outlets (public broadcaster first, then major newspapers of different leanings) with a working RSS feed,
   and add their domains to `data/news/sources.json`. Check the feed loads by running headlines.py.
9. Run `python3 scripts/build.py` and `python3 scripts/news.py --strict`. Fix every INVALID line (a missing English or
   Icelandic field is INVALID).
10. Commit `data/` as `News <date>: <countries>` and push to main (git pull --rebase first). Never force-push.
11. Report briefly: items added, data corrections made, anything you could not verify.
