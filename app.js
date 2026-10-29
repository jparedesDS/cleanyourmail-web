(() => {
  const doc = document;
  const lang = doc.documentElement.lang || "en";
  const toast = doc.getElementById("toast");
  let toastTimer = null;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  };

  // Provider tabs
  const tabs = Array.from(doc.querySelectorAll("[data-provider]"));
  const panels = Array.from(doc.querySelectorAll("[data-panel]"));

  const activateProvider = (name, focus = false) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.provider === name;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
  };

  if (tabs.length) {
    const initial = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
    activateProvider(initial.dataset.provider);

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateProvider(tab.dataset.provider));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        activateProvider(next.dataset.provider, true);
      });
    });
  }

  // Before / after toggle
  const compare = doc.getElementById("inboxCompare");
  if (compare) {
    const before = compare.querySelector(".inbox-before");
    const after = compare.querySelector(".inbox-after");
    const viewButtons = Array.from(compare.parentElement.querySelectorAll("[data-view]"));
    const setView = (view) => {
      if (before) before.hidden = view !== "before";
      if (after) after.hidden = view !== "after";
      compare.dataset.view = view;
      viewButtons.forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.view === view ? "true" : "false");
      });
    };
    viewButtons.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    setView("after");
  }

  // Copy buttons
  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("copy failed");
  };

  doc.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        await copyText(button.dataset.copy || "");
        button.textContent = lang === "es" ? "Copiado" : "Copied";
        showToast(lang === "es" ? "Copiado al portapapeles" : "Copied to clipboard");
        setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        showToast(lang === "es" ? "No se pudo copiar" : "Could not copy");
      }
    });
  });
})();
