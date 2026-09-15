// Share one heading row between a section and its table without replacing table controls.
(() => {
  function consolidate() {
    if (!document?.body) return;
    for (const table of document.querySelectorAll("table.survey-table")) {
      const first = table.tHead?.rows[0]?.cells[0];
      if (!first || first.dataset.sectionHeader) continue;
      const details = table.closest("details");
      const summary = details?.querySelector(":scope > summary");
      let heading = table.previousElementSibling;
      if (!heading?.matches(".section-heading, h2, h3")) heading = null;
      if (summary && details.querySelector("table") === table) {
        const title = summary.querySelector("h2, h3")?.textContent;
        if (!title) continue;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "table-section-toggle";
        toggle.textContent = title;
        toggle.setAttribute("aria-label", "Collapse " + title);
        toggle.setAttribute("aria-expanded", "true");
        toggle.addEventListener("click", event => { event.stopPropagation(); details.open = false; summary.focus(); });
        first.replaceChildren(toggle);
        const actions = table.parentElement.querySelector(":scope > [data-table-actions]");
        if (actions) {
          first.append(...actions.childNodes);
          actions.remove();
        }
        details.classList.add("consolidated-table-section");
      } else if (heading) {
        const title = heading.matches("h2, h3") ? heading : heading.querySelector("h2, h3");
        if (!title) continue;
        first.replaceChildren();
        if (heading === title) first.appendChild(title);
        else { first.append(...heading.childNodes); heading.remove(); }
        first.querySelectorAll("button, select, a").forEach(control => {
          control.addEventListener("click", event => event.stopPropagation());
        });
      } else continue;
      first.dataset.sectionHeader = "true";
      first.classList.add("table-section-heading");
      first.scope = "col";
    }
  }
  consolidate();
  new MutationObserver(consolidate).observe(document.body, { childList: true, subtree: true });
})();
