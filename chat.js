// Spjall: spurningar um landið eða fyrirtækið sem er opið. Svör koma eingöngu úr gögnum síðunnar (api/ask).
(function () {
  const ctx = { kind: "general", id: "", label: "Fréttir og kosningar" };
  let history = [];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const fab = el("button", "chat-fab", "Spyrja");
  fab.type = "button"; fab.setAttribute("aria-haspopup", "dialog");
  const box = el("section", "chat-box"); box.hidden = true;
  box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Spyrja um gögnin");
  box.innerHTML = `<div class="chat-head"><div><strong>Spyrja</strong><span class="chat-about"></span></div>
    <button type="button" class="chat-close">Loka</button></div>
    <div class="chat-log" aria-live="polite"></div>
    <form class="chat-form"><label class="visually-hidden" for="chat-q">Spurning</label>
    <textarea id="chat-q" maxlength="500" placeholder="Skrifaðu spurningu…"></textarea><button type="submit">Senda</button></form>
    <p class="chat-note">Svör eru búin til af gervigreind eingöngu úr gögnum síðunnar og geta verið röng. Athugaðu heimildirnar. Ekki fjárfestingarráðgjöf. Spurningar eru ekki vistaðar.</p>`;
  document.body.append(fab, box);
  const log = box.querySelector(".chat-log"), about = box.querySelector(".chat-about");
  const form = box.querySelector("form"), q = box.querySelector("textarea"), send = form.querySelector("button");

  const SUGG = {
    country: () => ["Hvenær eru næstu kosningar?", "Hverjir eru helstu flokkarnir og hvar standa þeir?", "Hvað segja nýjustu fréttir?"],
    company: () => ["Hvernig var síðasti ársfjórðungur?", "Hvernig hafa tekjur þróast síðasta árið?", "Hvað kom fram í nýjustu afkomutilkynningu?"],
    general: () => ["Hvaða kosningar eru næstar?", "Hvað er helst í fréttum?"],
  };

  // Turn plain URLs in the answer into links, safely.
  function render(text, node) {
    const parts = String(text).split(/(https?:\/\/[^\s)<>\]]+)/g);
    parts.forEach((p, i) => {
      if (i % 2) { const a = el("a", null, p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)); a.href = p; a.target = "_blank"; a.rel = "noopener"; node.append(a); }
      else node.append(document.createTextNode(p));
    });
  }
  function add(role, text) { const m = el("div", `chat-msg ${role}`); render(text, m); log.append(m); log.scrollTop = log.scrollHeight; return m; }
  function reset() {
    history = []; log.textContent = "";
    about.textContent = `Spurt um: ${ctx.label}`;
    add("bot", ctx.kind === "general" ? "Spyrðu um kosningar eða fréttir. Opnaðu land eða fyrirtæki til að spyrja nánar um það."
      : `Spyrðu um ${ctx.label}. Ég svara aðeins út frá gögnunum hér á síðunni og vísa í heimildir.`);
    const s = el("div", "chat-sugg");
    (SUGG[ctx.kind] || SUGG.general)(ctx.label).forEach((t) => { const b = el("button", null, t); b.type = "button"; b.onclick = () => ask(t); s.append(b); });
    log.append(s);
  }
  async function ask(text) {
    text = text.trim(); if (!text || send.disabled) return;
    log.querySelectorAll(".chat-sugg").forEach((n) => n.remove());
    add("me", text); q.value = ""; send.disabled = true;
    const wait = add("bot wait", "Hugsa…");
    let answer;
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, context: { kind: ctx.kind, id: ctx.id }, history }) });
      const d = await r.json().catch(() => ({}));
      answer = d.answer || "Ekki tókst að ná í svar.";
      if (r.ok) history.push({ role: "user", content: text }, { role: "assistant", content: answer });
    } catch (_) { answer = "Engin tenging. Reyndu aftur."; }
    wait.remove(); add("bot", answer); send.disabled = false; q.focus();
  }

  function setContext(kind, id, label) {
    const changed = kind !== ctx.kind || id !== ctx.id;
    Object.assign(ctx, { kind: kind || "general", id: id || "", label: label || "Fréttir og kosningar" });
    fab.textContent = ctx.kind === "general" ? "Spyrja" : `Spyrja um ${ctx.label}`;
    if (changed) reset();
  }
  window.chatContext = setContext;

  fab.onclick = () => { box.hidden = false; fab.hidden = true; q.focus(); };
  box.querySelector(".chat-close").onclick = () => { box.hidden = true; fab.hidden = false; fab.focus(); };
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); box.querySelector(".chat-close").click(); } });
  form.onsubmit = (e) => { e.preventDefault(); ask(q.value); };
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q.value); } });
  reset();
})();
