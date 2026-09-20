window.Meetup = (() => {
  function createPicker(section, values, { disabled, onChange }) {
    const normalize = entry => typeof entry === "string" ? new Date(entry).toISOString() : {
      dateTime: new Date(entry.dateTime).toISOString(),
      endDateTime: entry.endDateTime ? new Date(entry.endDateTime).toISOString() : null
    };
    const dates = new Map(values.map(entry => {
      const value = normalize(entry);
      const stored = typeof value === "string" ? value : value.endDateTime ? value : value.dateTime;
      return [JSON.stringify(stored), stored];
    }));
    const input = section.querySelector(".meetup-date-time");
    const endInput = section.querySelector(".meetup-end-time");
    const mode = section.querySelector(".meetup-entry-type");
    const endLabel = section.querySelector(".meetup-end-label");
    const add = section.querySelector(".meetup-add");
    const list = section.querySelector(".meetup-selections");
    section.querySelector(".meetup-time-zone").textContent = `Times are in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
    input.disabled = endInput.disabled = mode.disabled = add.disabled = disabled;
    mode.addEventListener("change", () => { endLabel.hidden = mode.value !== "window"; onChange(); });
    function render() {
      list.replaceChildren();
      for (const [key, value] of dates) {
        const row = document.createElement("li");
        row.className = "scheduling-selection";
        const text = document.createElement("span");
        text.textContent = typeof value === "string" ? formatSchedulingAvailability(null, value)
          : formatSchedulingAvailability(null, value.dateTime, value.endDateTime);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button";
        remove.title = "Remove availability";
        remove.setAttribute("aria-label", `Remove ${text.textContent}`);
        remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        remove.disabled = disabled;
        remove.addEventListener("click", () => { dates.delete(key); render(); onChange(); });
        row.append(text, remove);
        list.append(row);
      }
    }
    function localDateTime(field) {
      const date = new Date(field.value);
      const parts = field.value.split(/[-T:]/).map(Number);
      // A nonexistent local time during a DST jump must not silently become another time.
      if (!field.value || !field.checkValidity() || Number.isNaN(date.getTime()) || parts.length !== 5
          || date.getFullYear() !== parts[0] || date.getMonth() + 1 !== parts[1] || date.getDate() !== parts[2]
          || date.getHours() !== parts[3] || date.getMinutes() !== parts[4]) {
        showToast("Choose a valid local date and time.", "error");
        return null;
      }
      return date.toISOString();
    }
    function addDate() {
      if (disabled) return false;
      const start = localDateTime(input);
      if (!start) return false;
      const end = mode.value === "window" ? localDateTime(endInput) : null;
      if (mode.value === "window" && !end) return false;
      if (end && end <= start) { showToast("Availability must end after it starts.", "error"); return false; }
      const value = end ? { dateTime: start, endDateTime: end } : start;
      dates.set(JSON.stringify(value), value);
      input.value = endInput.value = "";
      render(); onChange();
      return true;
    }
    add.addEventListener("click", addDate);
    for (const field of [input, endInput]) {
      field.addEventListener("input", onChange);
      field.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); addDate(); }
      });
    }
    render();
    return { values: () => [...dates.values()],
      finish: () => !(input.value || (mode.value === "window" && endInput.value)) || addDate() };
  }

  async function renderResults(surveyId, question, container) {
    const response = await fetch(`/api/surveys/${surveyId}/questions/${question.id}/results/meetup`);
    if (!response.ok) { showToast("Unable to load meetup results.", "error"); return; }
    const result = await response.json();
    container.replaceChildren();
    if (!result.available) {
      container.textContent = "Availability results will be shown when the survey closes.";
    } else if (!result.results.length) {
      container.textContent = "No availability submitted.";
    } else renderSchedulingResultList(container, result.results, "participant");
  }
  return { createPicker, renderResults };
})();
