// POST /api/ask  {question, context: {kind: "country"|"company"|"general", id}, history?: [{role, content}]}
// Answers only from the site's own data for the page in view. Provider: Claude if ANTHROPIC_API_KEY is set,
// otherwise Groq (free tier) if GROQ_API_KEY is set. Nothing is logged or stored.
const { buildContext } = require("../lib/context");

const SYSTEM = `You are the question-answering assistant of a neutral Icelandic news site about elections and company results.
Answer ONLY from the JSON in <data>. It is the site's verified data for the page the reader is looking at.
Rules:
- If the answer is not in the data, say so plainly and point to the listed sources or links. Never guess, never use outside knowledge, never invent numbers, dates, polls or quotes.
- Copy numbers exactly as they appear in the data, with units and the period they refer to. Money: say USD, and you may add ISK using usdIsk.rate when given, saying it is converted.
- Name the source for facts that come from news items or filings (outlet name or "SEC").
- Be neutral. Give each party or candidate the same treatment. No opinions, predictions of who will win, or investment advice (never say buy, sell or hold).
- Answer in the reader's site language given below, unless the question is clearly written in another language. Correct, plain Icelandic or English. Short: at most about 120 words unless asked for more.
- No em dashes.`;

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 60 * 60 * 1000, max = 30;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

async function callClaude(system, messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 600, system, messages }),
  });
  if (!r.ok) throw new Error(`claude ${r.status}`);
  const d = await r.json();
  return (d.content || []).map((b) => b.text || "").join("").trim();
}

async function callGroq(system, messages) {
  const models = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.3-70b-versatile"].filter(Boolean);
  let last;
  for (const model of models) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 600, messages: [{ role: "system", content: system }, ...messages] }),
    });
    if (r.ok) { const d = await r.json(); return (d.choices?.[0]?.message?.content || "").trim(); }
    last = `groq ${model} ${r.status}`;
    if (r.status !== 404 && r.status !== 400) break;
  }
  throw new Error(last);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const question = String(body.question || "").trim().slice(0, 500);
  const en = body.lang === "en";
  const L = (is, enText) => (en ? enText : is);
  if (!question) return res.status(400).json({ error: L("Engin spurning.", "No question.") });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  if (rateLimited(ip)) return res.status(429).json({ answer: L("Of margar spurningar á stuttum tíma. Reyndu aftur eftir smá stund.", "Too many questions in a short time. Please try again shortly.") });

  const ctx = buildContext(body.context?.kind, body.context?.id);
  if (!ctx) return res.status(404).json({ answer: L("Ég fann engin gögn um þetta efni á síðunni.", "I found no data on this topic on the site.") });
  const system = `${SYSTEM}\nThe reader is using the site in ${en ? "English" : "Icelandic"}.\n\n<data topic="${ctx.label}">\n${JSON.stringify(ctx.data)}\n</data>\nUseful links on this site: ${ctx.links.join(", ")}`;
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
  const messages = [...history, { role: "user", content: question }];

  try {
    let answer, provider;
    if (process.env.ANTHROPIC_API_KEY) { answer = await callClaude(system, messages); provider = "claude"; }
    else if (process.env.GROQ_API_KEY) { answer = await callGroq(system, messages); provider = "groq"; }
    else return res.status(503).json({ answer: L("Spjallið er ekki virkt enn. Lykil vantar fyrir mállíkanið.", "Chat is not active yet. The language model key is missing.") });
    answer = answer.replace(/—/g, ",");
    return res.status(200).json({ answer, provider, topic: ctx.label });
  } catch (e) {
    return res.status(502).json({ answer: L("Ekki tókst að ná í svar núna. Reyndu aftur eftir smá stund.", "Could not get an answer right now. Please try again shortly.") });
  }
};
