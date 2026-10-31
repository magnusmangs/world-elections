# Brennidepill (focus): how to write a topic

Brennidepill takes a story that is emerging from one country and has confusing or conflicting reports, and takes it
apart objectively. It is not a news item. It answers: what is confirmed, what each side says, what is disputed or
unverified, how outlets in different camps frame it, what happened when, and what comes next.

Page: `/brennidepill` (list) and `/brennidepill/<id>` (topic). Code: `brennidepill.html`, `brennidepill.js`,
`brennidepill.css`. Data: `data/brennidepill/<id>.json`, one file per topic. `python3 scripts/brennidepill.py` validates
every file and writes `data/brennidepill/index.json` (commit both). Topics updated in the last 14 days also appear in
the Fréttir feed (`section_focus` in `scripts/news.py`), and a country with an open topic gets an "Í brennidepli" link at
the top of its panel on the map. The first topic, Poland's Constitutional Tribunal (October 2026), is the reference
example.

## When to open a topic

- A domestic political, constitutional or security event where reports conflict, or where domestic and foreign
  coverage diverge sharply.
- Enough happening to need a timeline and more than one camp's view. A single clear fact is a news item, not a topic.

## Research

1. Read domestic outlets in the original language across the spectrum: liberal, centre or commercial, right, left,
   state or public media. Use `data/news/outlets.json` and `data/news/headlines/` for the country's outlets. Aim for
   at least three outlets per camp you can reach. If a site blocks fetching, move on; never work around it.
2. Read international wire services (Reuters, AP, AFP) and major foreign outlets for background and reactions.
3. Read official primary sources where they exist: the institution's own site, government and presidential
   statements, court rulings, Venice Commission or similar opinions.
4. Running several research agents in parallel works well: one per camp plus one for legal background and
   international reaction. Ask each to separate facts confirmed by several outlets from single-source claims.

## Writing

- `id`: `<iso3 lowercase>-<short Icelandic slug>-<yyyy-mm>`, equal to the file name.
- `status`: `developing` while events move, `settled` when the story has stopped moving, `archived` to hide it from
  map panels and the feed (the page still lists it).
- `updated`: UTC time of the latest check (`YYYY-MM-DDTHH:MMZ`). Say in `method` when the material was compiled.
- `facts`: each with `level`: `confirmed` (outlets from at least two camps, checked by the script), `single` (one
  party or outlet) or `disputed`.
- `sides`: at least two camps, each in its own terms, with the strongest version of its argument. A short attributed
  quote is optional. Never characterise one side in the other's words.
- `disputed`: the question, side A, side B, and a plain `status` ("Legal dispute, unresolved", "No independent footage
  verified", "Rumour, no evidence").
- `media`: how each camp frames the story, based only on articles read. Cite the articles.
- `timeline`, `next`, `numbers`, `unknowns` as in the reference example. Times are local.
- `sources`: every cited article with `outlet`, `camp` (liberal, centre, right, left, state, official, intl, ref),
  `lang`, `title` (original language) and `url`. Every source must be cited somewhere, and every citation must exist.
- Every text field in English with its Icelandic twin (suffix `Is`), same rules as the country files (UPDATING.md
  step 5): natural neutral Icelandic, decimal comma, no invented Icelandic names. No em dashes.
- Neutral wording: equal depth for each camp, no adjectives that take sides, label rumours as rumours, and prefer
  "says" over loaded verbs.

## Updating

Re-check while `status` is `developing`: add new timeline rows and facts, move facts between levels as they are
confirmed or contradicted, refresh `updated`, then run `python3 scripts/brennidepill.py` and `python3 scripts/news.py`.
Commit as `Brennidepill <date>: <topic>, <what changed>`.
