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
9. Finance review queue: retired (finance section removed 28 October 2026). Skip this step.
10. Images: run `python3 scripts/media.py` after adding countries or parties. It finds freely licensed images on Wikimedia Commons via Wikidata (people by exact name and citizenship, flags) and records author and licence for the captions.
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
13. Email alerts. Readers sign up on the site (`api/subscribe.js`, Brevo lists per language). Every push that changes a country's `live` figures (status, results, blocs, counted or headline; not the timestamp alone) triggers `.github/workflows/notify.yml`, which sends one Brevo campaign per language list via `scripts/notify.py`. Removing `live` after the result is recorded in `lastElection` sends a final-result email. `polls-open` sends nothing. Alerts are throttled in `scripts/notify.py`: a status change and the final result always send; otherwise only a leader change, a majority crossing or the count passing 50% or 90% sends, at most one alert per country every 3 hours (`ALERT_MIN_GAP_HOURS`) and never two within 15 minutes. So update `live` as often as you like. Brevo's free plan allows 300 emails a day across all sends.

14. US midterms page (`/bandarikin`). Race data lives in `data/us/races.json`, built by `python3 scripts/us_races.py`
    from Wikipedia's 2026 Senate, governor and House rating pages (Cook Political Report ratings) and the list of current
    representatives. Re-run it before election day and commit the result. `data/us/states_meta.json` holds static facts
    (names, Icelandic names, House seats, each state's local newsroom feed). Headlines (`data/us/news/`) are generated
    hourly by `scripts/us_news.py` and not committed.
    Election night: create `data/us/live.json` and update it as races are called. The page re-fetches it every minute.
    `{"status": "counting" | "final", "updated": "<ISO UTC>", "headline", "headlineIs", "sourceName", "source",
      "senate": {"D": n, "R": n, "I": n}, "house": {"D": n, "R": n}, "governors": {"D": n, "R": n},
      "states": {"AZ": {"senate": [{"special": false, "name": "<winner as in races.json>", "party": "D"}],
                        "governor": {"name": "...", "party": "R"}, "house": {"D": 4, "R": 5, "called": 9}}}}`
    Only list a race once a major outlet or AP has called it, and name that source in `sourceName`. Called races are
    coloured by winner on the map; uncalled races keep their rating colour. Delete the file (or set status "final" and
    record results in `data/countries/USA.json`) when the count is done.
