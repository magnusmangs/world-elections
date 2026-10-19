(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const M = ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ágú.", "sep.", "okt.", "nóv.", "des."];
  const dateShort = (s) => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()}. ${M[d.getUTCMonth()]}`; };
  const TAG = { kosningar: "Kosningar", fjarmal: "Fjármál" };
  let items = [], filter = "all";
  try { filter = localStorage.getItem("frettir.filter") || "all"; } catch (_) {}

  function render() {
    document.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    const list = items.filter((i) => filter === "all" || i.section === filter);
    $("news").innerHTML = list.length ? list.map((i) => {
      const href = i.link || (i.source && i.source.url) || "#";
      const ext = !i.link;
      const src = i.kind === "frétt"
        ? `Heimild: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>`
        : i.source ? `Úr gögnum síðunnar. Frumgagn: <a href="${esc(i.source.url)}" target="_blank" rel="noopener">${esc(i.source.name)}</a>${i.ai ? ". Unnið með gervigreind, tölur sannreyndar" : ""}` : "Úr gögnum síðunnar";
      return `<li>
        <time datetime="${esc(i.date)}">${esc(dateShort(i.date))}<br><span class="tag tag-${esc(i.section)}">${esc(TAG[i.section] || i.section)}</span></time>
        <div>
          <h3><a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(i.titleIs)}</a></h3>
          ${i.summaryIs ? `<p>${esc(i.summaryIs)}</p>` : ""}
          <p class="src">${src}</p>
        </div></li>`;
    }).join("") : `<li>Engar fréttir í þessum flokki síðustu vikurnar.</li>`;
  }
  document.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter; try { localStorage.setItem("frettir.filter", filter); } catch (_) {} render();
  }));
  fetch("data/news.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    items = d.items || [];
    $("updated").textContent = `Síðast uppfært ${d.updated.slice(0, 10)} kl. ${d.updated.slice(11, 16)} (UTC).`;
    render();
  }).catch(() => { $("news").innerHTML = "<li>Ekki tókst að sækja fréttirnar. Endurhlaðið síðuna.</li>"; });
})();
