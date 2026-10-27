# Weekly update procedure

The scheduled Claude task follows the `world-elections-update` skill. If the skill is unavailable, follow this file.

1. Finished elections: for every election dated before today, record the result in `lastElection`, remove it from `elections`, update `leaders`, each party's `lastResult` and `inGovernment`, and the `summary`. Add any scheduled run-off.
   In `lastElection` also set `winner` (with `winnerIs`) and `result`: `"new"` if a new party, list or person won, `"incumbent"` if the sitting president, their party, or the party leading the outgoing government won again (for parliaments, judge by who forms or is expected to form the government; while that is unclear, by the largest party or list). Leave `result` out after a first round with a run-off still to come. The map colours a country by `result` for 90 days after the vote (one colour for a new winner, another when the incumbent held on), then goes back to the next-vote colour. A country that voted in the last 90 days gets a file even with no vote ahead (`elections: []`), so its result shows on the map.
2. Votes in the next 30 days: refresh date, candidates, polls (pollster and month), pledges and summary.
3. Calendar sweep for the next 15 months: Wikipedia `<YEAR>_national_electoral_calendar` (this year and next), electionguide.org upcoming list, news on snap elections from the past two weeks, and every entry in `data/watchlist.json`. Add a `data/countries/<ISO3>.json` file for each new national vote. `isoNumeric` must match an `id` in `assets/countries-50m.json`.
4. Rolling review: refresh up to 8 countries with the oldest `lastReviewed` (older than 28 days). Set `lastReviewed` to today on each file checked.
5. Two languages: the site shows one language at a time (Icelandic by default, English with the IS / EN toggle).
   Write every text field in English and add its Icelandic twin right after it with the suffix `Is`:
   `name`/`nameIs` (country), `leaders`, `summary`, `noParties`, each election's `type` and `note`, each party's
   `position`, `ideology`, `lastResult`, `polling` and `policies` (`policiesIs` has the same number of lines),
   `chamber.name` and `asOf`, `poll.pollster` and `note`, `lastElection.type`, `outcome` and `winner`. Names: never invent an Icelandic
   name. Use an Icelandic form only when it is established in Icelandic media (Labour Party = Verkamannaflokkurinn,
   Law and Justice = Lög og réttlæti). Otherwise keep the original name, in the party's own language where it uses the
   Latin alphabet (Lega, Progresívne Slovensko, Studentska lista) or its usual transliteration (Yahadut HaTorah), both in
   `nameIs` and in the Icelandic text. The same goes for alliances, lists, TV channels (Channel 12) and institutions. Natural, neutral Icelandic,
   decimal comma (47,0%), dates as "4. október 2026". Positions: Lengst til vinstri, Vinstri, Mið-vinstri, Miðja,
   Mið-hægri, Hægri, Lengst til hægri, Breið fylking. When you change an English field, update its twin too.
   `build.py` fails on any missing twin.
6. Rules: research every changeable fact fresh; neutral wording with equal depth per party; `position` uses only Far-left, Left, Centre-left, Centre, Centre-right, Right, Far-right (ranges allowed) or Big tent; 3 to 5 concrete policy lines; write "Platform details limited in English-language sources" rather than guess; no em dashes; cite sources.
7. Run `python3 scripts/build.py --today <YYYY-MM-DD>` and fix all errors. Commit as `Weekly update YYYY-MM-DD: <summary>` and push to `main`. Never force-push. Vercel redeploys on push.
8. Report a few lines: countries added, results recorded, dates moved, countries refreshed, anything unverified.
9. Finance review queue: read `data/finance/review.json` and list any earnings releases the AI check could not verify (ticker, date, reasons, exhibit link) in the weekly report.
10. Images: run `python3 scripts/media.py` after adding countries, parties or companies. It finds freely licensed images on Wikimedia Commons via Wikidata (logos by SEC CIK, people by exact name and citizenship, flags) and records author and licence for the captions.
11. Balance of power and polls (the hemicycle and poll bars in the country panel). Optional fields, checked by `build.py`:
    - `chamber`: `{"name", "seats", "majority", "asOf", "source"}`. Current seats in the chamber being elected. Each party gets an integer `seats`; the remainder is drawn grey as "Others". If current composition is unclear, use the last election result and say so in `asOf` ("as elected in June 2024"). Leave `chamber` out for presidential-only votes and for countries with no sitting legislature.
    - `poll`: `{"unit": "percent" | "seats", "date", "pollster", "url", "note"}` plus a number `pollValue` on each party. Use one named poll, not a mix of polls. Only show a poll at most 60 days old with an accessible source; otherwise remove `poll` and the `pollValue`s. Smaller lists not in `parties` go in `note`.
    - Optional party `color` (hex), usually the party's own colour.
    Refresh `poll` for every vote in the next 30 days and in the rolling review. After a result, set `seats` to the new composition and remove `poll`.
12. Election night (`live`). Optional block on a country file, shown at the top of its panel and in the lede. `build.py` also writes `data/live.json`, which open pages re-fetch every minute.
    `{"status": "polls-open" | "exit-poll" | "counting" | "final", "updated": "<ISO UTC timestamp>", "headline", "headlineIs", "unit": "seats" | "percent",
    "counted": <percent of votes counted, optional>, "sourceName", "sourceNameIs", "source": "https://...", "note", "noteIs",
    "results": [{"abbr": "<party abbr>", "value": n}], "blocs": [{"name", "nameIs", "value", "color"}]}`.
    Use one named source per update (an exit poll from one channel, then the official count). When the count is final, record the result in `lastElection` and remove `live`.
