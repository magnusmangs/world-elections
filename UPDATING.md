# Weekly update procedure

The scheduled Claude task follows the `world-elections-update` skill. If the skill is unavailable, follow this file.

1. Finished elections: for every election dated before today, record the result in `lastElection`, remove it from `elections`, update `leaders`, each party's `lastResult` and `inGovernment`, and the `summary`. Add any scheduled run-off.
2. Votes in the next 30 days: refresh date, candidates, polls (pollster and month), pledges and summary.
3. Calendar sweep for the next 15 months: Wikipedia `<YEAR>_national_electoral_calendar` (this year and next), electionguide.org upcoming list, news on snap elections from the past two weeks, and every entry in `data/watchlist.json`. Add a `data/countries/<ISO3>.json` file for each new national vote. `isoNumeric` must match an `id` in `assets/countries-50m.json`.
4. Rolling review: refresh up to 8 countries with the oldest `lastReviewed` (older than 28 days). Set `lastReviewed` to today on each file checked.
5. Rules: research every changeable fact fresh; neutral wording with equal depth per party; `position` uses only Far-left, Left, Centre-left, Centre, Centre-right, Right, Far-right (ranges allowed) or Big tent; 3 to 5 concrete policy lines; write "Platform details limited in English-language sources" rather than guess; no em dashes; cite sources.
6. Run `python3 scripts/build.py --today <YYYY-MM-DD>` and fix all errors. Commit as `Weekly update YYYY-MM-DD: <summary>` and push to `main`. Never force-push. Vercel redeploys on push.
7. Report a few lines: countries added, results recorded, dates moved, countries refreshed, anything unverified.
8. Finance review queue: read `data/finance/review.json` and list any earnings releases the AI check could not verify (ticker, date, reasons, exhibit link) in the weekly report.
