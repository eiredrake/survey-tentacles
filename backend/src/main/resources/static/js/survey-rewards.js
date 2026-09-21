(async function () {
  const section = document.getElementById("survey-rewards");
  if (!section) return;
  const id = new URLSearchParams(location.search).get("id"), { request, cell } = Rewards;
  let busy = false, dirty = false;
  const form = document.getElementById("survey-rewards-form"), status = document.getElementById("survey-rewards-status");
  async function load() {
    const config = await request(`/admin/surveys/${id}`);
    section.hidden = !config.available;
    document.getElementById("survey-rewards-enabled").checked = config.enabled;
    document.getElementById("survey-point-name").textContent = config.pointName;
    const body = document.getElementById("question-rewards"); body.replaceChildren();
    config.questions.forEach(question => {
      const row = document.createElement("tr"); cell(row, question.prompt);
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = "2147483647"; input.step = "1";
      input.required = true; input.value = question.points; input.dataset.questionId = question.id;
      input.setAttribute("aria-label", `${config.pointName} for ${question.prompt}`); cell(row, "").appendChild(input); body.appendChild(row);
    });
    dirty = false;
  }
  form.addEventListener("input", () => { dirty = true; });
  section.addEventListener("toggle", () => { if (section.open && !dirty && !busy) load().catch(error => { status.textContent = error.message; }); });
  window.addEventListener("beforeunload", event => { if (dirty || busy) event.preventDefault(); });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const questionPoints = Object.fromEntries([...form.querySelectorAll("[data-question-id]")].map(input => [input.dataset.questionId, Number(input.value)]));
      await request(`/admin/surveys/${id}`, "PUT", { enabled: document.getElementById("survey-rewards-enabled").checked, questionPoints });
      dirty = false; status.textContent = "Saved.";
    } catch (error) { status.textContent = error.message; showToast(error.message, "error"); }
    finally { busy = false; button.disabled = false; }
  });
  document.getElementById("reload-rewards").addEventListener("click", () => {
    if (!busy && (!dirty || confirm("Discard unsaved rewards changes?"))) load().catch(error => { status.textContent = error.message; });
  });
  try { await load(); } catch (error) { status.textContent = error.message; section.hidden = false; }
})();
