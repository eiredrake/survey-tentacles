window.PointAllocation = (() => {
  function createInputs(section, detail, answers, { disabled, onChange }) {
    const container = section.querySelector(".point-allocation-options");
    const counter = section.querySelector(".point-allocation-remaining");
    const inputs = [];
    for (const option of detail.options) {
      const label = document.createElement("label");
      label.className = "point-allocation-option";
      const text = document.createElement("span");
      text.textContent = option.label;
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = String(detail.pointBudget); input.step = "1";
      input.value = String(answers.find(answer => answer.optionId === option.id)?.points ?? 0);
      input.disabled = disabled;
      input.dataset.optionId = option.id;
      input.addEventListener("input", () => { update(); onChange(); });
      label.append(text, input); container.append(label); inputs.push(input);
    }
    function values() { return inputs.map(input => ({ optionId: Number(input.dataset.optionId), points: Number(input.value) })); }
    function total() { return values().reduce((sum, allocation) => sum + allocation.points, 0); }
    function error() {
      if (inputs.some(input => !input.validity.valid || !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0)) {
        return "Use non-negative whole numbers within the point budget.";
      }
      return total() > detail.pointBudget ? "The total exceeds the point budget." : null;
    }
    function update() {
      const message = error();
      counter.textContent = message || `${total()} of ${detail.pointBudget} points assigned; ${detail.pointBudget - total()} remaining.`;
    }
    update();
    return { values, total, error };
  }

  async function renderResults(surveyId, question, container, userId = null) {
    const base = `/api/surveys/${surveyId}/questions/${question.id}`;
    const [detailResponse, answersResponse] = await Promise.all([
      fetch(base), fetch(`${base}/answers/point-allocation${userId === null ? "" : `/${userId}`}`)
    ]);
    if (!detailResponse.ok || !answersResponse.ok) { showToast("Unable to load point allocations.", "error"); return; }
    const detail = await detailResponse.json(), answers = await answersResponse.json();
    container.replaceChildren();
    if (!answers.length) { container.textContent = "No points assigned yet."; return; }
    const respondents = new Set(answers.map(answer => answer.userId)).size;
    const heading = document.createElement("h3");
    heading.textContent = userId === null ? "Point allocation results" : "Points assigned";
    const summary = document.createElement("p");
    const assigned = answers.reduce((sum, answer) => sum + answer.points, 0);
    summary.textContent = userId === null
      ? `${respondents} response${respondents === 1 ? "" : "s"}; budget of ${detail.pointBudget} points per person.`
      : `${assigned} of ${detail.pointBudget} points assigned; ${detail.pointBudget - assigned} remaining.`;
    const table = document.createElement("table");
    table.className = "survey-table";
    const head = table.createTHead().insertRow();
    for (const title of userId === null ? ["Category", "Total points", "Average points"] : ["Category", "Points"]) {
      const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = title; head.append(cell);
    }
    const body = table.createTBody();
    for (const option of detail.options) {
      const points = answers.filter(answer => answer.optionId === option.id).reduce((sum, answer) => sum + answer.points, 0);
      const row = body.insertRow(); row.insertCell().textContent = option.label; row.insertCell().textContent = points;
      if (userId === null) row.insertCell().textContent = (points / respondents).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    container.append(heading, summary, table);
  }
  return { createInputs, renderResults };
})();
