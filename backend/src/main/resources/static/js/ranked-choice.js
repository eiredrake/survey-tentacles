// Shared candidate ordering for editing and voting; read-only results use the same candidate text.
window.RankedChoice = (() => {
  function button(label, icon, action) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = "icon-button";
    control.title = label;
    control.setAttribute("aria-label", label);
    control.innerHTML = `<i class="fa-solid fa-${icon}" aria-hidden="true"></i>`;
    control.addEventListener("click", action);
    return control;
  }

  function candidateText(container, option) {
    const name = document.createElement("strong");
    name.textContent = option.name;
    const description = document.createElement("span");
    description.textContent = option.description;
    container.append(name, description);
  }

  function create(container, { editing = false, disabled = false, onChange = () => {} } = {}) {
    let options = [], selected = new Set(), dragging = null;
    const list = document.createElement("ol");
    list.className = "ranked-choice-list";
    const status = document.createElement("span");
    status.className = "ranked-choice-status";
    status.setAttribute("role", "status");
    container.replaceChildren(list, status);
    const ranked = () => options.filter(option => editing || selected.has(option.id));
    function move(option, target) {
      if (disabled || option === target || !ranked().includes(option) || !ranked().includes(target)) return;
      const from = options.indexOf(option), to = options.indexOf(target);
      options.splice(from, 1);
      options.splice(to, 0, option);
      render();
      status.textContent = `${option.name || "Candidate"} moved to position ${ranked().indexOf(option) + 1}.`;
      onChange();
    }
    function render() {
      list.replaceChildren();
      const ranking = ranked();
      for (const option of options) {
        const row = document.createElement("li");
        row.className = "ranked-choice-row";
        const index = ranking.indexOf(option);
        const rank = document.createElement("span");
        rank.className = "ranked-choice-rank";
        rank.textContent = index < 0 ? "—" : `${index + 1}.`;
        row.append(rank);
        if (!editing) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = index >= 0;
          checkbox.disabled = disabled;
          checkbox.setAttribute("aria-label", `Rank ${option.name}`);
          checkbox.addEventListener("change", () => {
            checkbox.checked ? selected.add(option.id) : selected.delete(option.id);
            // Selected candidates stay in preference order; newly selected candidates join the end.
            const ordered = options.filter(o => selected.has(o.id) && o !== option);
            if (checkbox.checked) ordered.push(option);
            options = [...ordered, ...options.filter(o => !selected.has(o.id))];
            render();
            list.children[options.indexOf(option)]?.querySelector("input")?.focus();
            onChange();
          });
          row.append(checkbox);
        }
        const content = document.createElement("div");
        content.className = "ranked-choice-content";
        if (editing) {
          for (const [field, label] of [["name", "Candidate name"], ["description", "Candidate description"]]) {
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 255;
            input.value = option[field] || "";
            input.placeholder = label;
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => { option[field] = input.value; onChange(); });
            content.append(input);
          }
        } else candidateText(content, option);
        row.append(content);
        const actions = document.createElement("span");
        actions.className = "ranked-choice-actions";
        for (const [step, label, icon] of [[-1, "Move up", "arrow-up"], [1, "Move down", "arrow-down"]]) {
          const control = button(label, icon, () => {
            move(option, ranking[index + step]);
            list.children[options.indexOf(option)]?.querySelector(`[aria-label="${label}"]`)?.focus();
          });
          control.disabled = disabled || index < 0 || !ranking[index + step];
          actions.append(control);
        }
        if (editing) actions.append(button("Remove candidate", "xmark", () => {
          options.splice(options.indexOf(option), 1); render(); onChange();
        }));
        row.append(actions);
        row.draggable = !disabled && index >= 0;
        row.addEventListener("dragstart", event => {
          if (event.target.closest("input")) { event.preventDefault(); return; }
          dragging = option;
          event.dataTransfer.setData("text/plain", String(options.indexOf(option)));
          event.dataTransfer.effectAllowed = "move";
          row.classList.add("dragging");
        });
        row.addEventListener("dragover", event => {
          if (dragging && index >= 0) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
        });
        row.addEventListener("drop", event => {
          event.preventDefault();
          if (dragging) move(dragging, option);
          dragging = null;
        });
        row.addEventListener("dragend", () => { dragging = null; row.classList.remove("dragging"); });
        list.append(row);
      }
    }
    return {
      setOptions(values, ids = []) {
        options = values.map(value => ({ ...value }));
        selected = new Set(ids);
        if (!editing) options.sort((a, b) => {
          const ai = ids.indexOf(a.id), bi = ids.indexOf(b.id);
          return (ai < 0 ? ids.length : ai) - (bi < 0 ? ids.length : bi);
        });
        render();
      },
      add() { options.push({ name: "", description: "" }); render(); list.lastChild.querySelector("input").focus(); },
      getOptions: () => options.map(option => ({ ...option, name: option.name.trim(), description: option.description.trim() })),
      getRanking: () => ranked().map(option => option.id)
    };
  }

  async function renderResults(surveyId, question, container, userId = null) {
    const base = `/api/surveys/${surveyId}/questions/${question.id}`;
    const [detailResponse, answerResponse] = await Promise.all([
      fetch(base), fetch(`${base}/answers/ranked-choice${userId === null ? "" : `/${userId}`}`)
    ]);
    if (!detailResponse.ok || !answerResponse.ok) {
      showToast("Unable to load ranked-choice results.", "error");
      return;
    }
    const detail = await detailResponse.json(), answers = await answerResponse.json();
    container.replaceChildren();
    if (!answers.length) { container.textContent = "No responses yet."; return; }
    const ballots = new Map();
    for (const answer of answers) {
      if (!ballots.has(answer.userId)) ballots.set(answer.userId, []);
      ballots.get(answer.userId).push(answer);
    }
    for (const ballot of ballots.values()) {
      const heading = document.createElement("h3");
      heading.textContent = ballot[0].name || ballot[0].username;
      const list = document.createElement("ol");
      for (const answer of ballot.sort((a, b) => a.rank - b.rank)) {
        const option = detail.options.find(option => option.id === answer.optionId);
        const row = document.createElement("li");
        row.className = "ranked-choice-content";
        if (option) candidateText(row, option);
        list.append(row);
      }
      container.append(heading, list);
    }
  }
  return { create, renderResults };
})();
