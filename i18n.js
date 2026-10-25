// One language at a time. Icelandic is the default; the reader can switch to English with the IS / EN toggle.
// The choice is kept in this browser (localStorage) and can be forced with ?lang=en or ?lang=is.
// Static text: write the Icelandic in the HTML and the English in data-en (also data-en-placeholder,
// data-en-aria-label, data-en-title, data-en-content for <meta>). Scripts use window.LANG and window.tr(is, en).
(function () {
  "use strict";
  const KEY = "site.lang";
  let lang = "is";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "is") { lang = q; localStorage.setItem(KEY, q); }
    else lang = localStorage.getItem(KEY) === "en" ? "en" : "is";
  } catch (_) {}
  const en = lang === "en";
  window.LANG = lang;
  window.tr = (is, enText) => (en ? enText : is);
  document.documentElement.lang = lang;

  function applyStatic(root) {
    if (!en) return;
    root.querySelectorAll("[data-en]").forEach((n) => { n.innerHTML = n.getAttribute("data-en"); });
    for (const a of ["placeholder", "aria-label", "title", "content"]) {
      root.querySelectorAll(`[data-en-${a}]`).forEach((n) => n.setAttribute(a, n.getAttribute(`data-en-${a}`)));
    }
    const t = document.querySelector("title[data-en]");
    if (t) document.title = t.getAttribute("data-en");
  }

  function addToggle() {
    document.querySelectorAll(".sitenav").forEach((nav) => {
      if (nav.querySelector(".lang-toggle")) return;
      const box = document.createElement("span");
      box.className = "lang-toggle";
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", en ? "Language" : "Tungumál");
      for (const [code, label, name] of [["is", "IS", "Íslenska"], ["en", "EN", "English"]]) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.lang = code; b.title = name;
        b.setAttribute("aria-pressed", String(code === lang));
        b.onclick = () => {
          if (code === lang) return;
          try { localStorage.setItem(KEY, code); } catch (_) {}
          const u = new URL(location.href); u.searchParams.delete("lang");
          location.replace(u.toString());
        };
        box.append(b);
      }
      nav.append(box);
    });
  }

  applyStatic(document);
  addToggle();
  window.applyI18n = applyStatic;
})();
