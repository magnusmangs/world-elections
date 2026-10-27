// POST /api/subscribe  {email, lang: "is"|"en", consent: true}
// Adds the reader to the Brevo list for their language. Election-night alerts go to these lists (scripts/notify.py).
// Env: BREVO_API_KEY, BREVO_LIST_IS, BREVO_LIST_EN, optional BREVO_DOI_TEMPLATE_ID (double opt-in; recommended),
// optional SITE_URL. With a double opt-in template, Brevo emails a confirmation link and only adds the contact once clicked.
const SITE = process.env.SITE_URL || "https://world-elections.vercel.app";
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 60 * 60 * 1000, max = 8;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch (_) { body = {}; } }
  const en = body.lang === "en";
  const L = (is, e) => (en ? e : is);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  if (body.website) return res.status(200).json({ ok: true, message: L("Takk.", "Thanks.") }); // honeypot
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: L("Netfangið virðist ekki rétt.", "That email address does not look right.") });
  if (body.consent !== true) return res.status(400).json({ error: L("Hakaðu við samþykkið til að skrá þig.", "Tick the consent box to sign up.") });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: L("Of margar tilraunir. Reyndu aftur síðar.", "Too many attempts. Please try again later.") });

  const key = process.env.BREVO_API_KEY;
  const listId = Number(en ? process.env.BREVO_LIST_EN : process.env.BREVO_LIST_IS);
  if (!key || !listId) return res.status(503).json({ error: L("Póstlistinn er ekki tilbúinn enn.", "The mailing list is not set up yet.") });

  const doi = Number(process.env.BREVO_DOI_TEMPLATE_ID || 0);
  const url = doi ? "https://api.brevo.com/v3/contacts/doubleOptinConfirmation" : "https://api.brevo.com/v3/contacts";
  const payload = doi
    ? { email, includeListIds: [listId], templateId: doi, redirectionUrl: `${SITE}/?skraning=stadfest${en ? "&lang=en" : ""}`, attributes: { LANG: en ? "en" : "is" } }
    : { email, listIds: [listId], updateEnabled: true, attributes: { LANG: en ? "en" : "is" } };
  try {
    const r = await fetch(url, { method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok && r.status !== 204) {
      const t = await r.text();
      // An attribute that does not exist in the account is the most common setup error; retry without it.
      if (/attribute/i.test(t)) {
        delete payload.attributes;
        const r2 = await fetch(url, { method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
        if (!r2.ok && r2.status !== 204) throw new Error(`brevo ${r2.status} ${await r2.text()}`);
      } else if (!/duplicate|already/i.test(t)) throw new Error(`brevo ${r.status} ${t}`);
    }
    return res.status(200).json({ ok: true, message: doi
      ? L("Næstum komið. Við sendum þér staðfestingarpóst; smelltu á hlekkinn í honum.", "Almost there. We sent you a confirmation email; click the link in it.")
      : L("Þú ert á listanum. Við sendum þér fréttir af kosninganóttum.", "You are on the list. We will email you on election nights.") });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: L("Ekki tókst að skrá þig. Reyndu aftur síðar.", "Sign-up failed. Please try again later.") });
  }
};
