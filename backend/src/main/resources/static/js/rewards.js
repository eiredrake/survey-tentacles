window.Rewards = (() => {
  async function request(path, method = "GET", body) {
    const options = { method };
    if (method !== "GET") {
      const { token, headerName } = await getCsrfToken();
      options.headers = { "Content-Type": "application/json", [headerName]: token };
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`/api/rewards${path}`, options);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || error.message || error.error || "Unable to load or save rewards. Please try again.");
    }
    return response.json();
  }
  function cell(row, value) { const td = document.createElement("td"); td.textContent = value; row.appendChild(td); return td; }
  function history(target, entries, admin = false) {
    target.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement("tr");
      cell(row, formatSchedulingDate(null, entry.occurredAt));
      if (admin) cell(row, entry.userName);
      cell(row, entry.description); cell(row, entry.amount > 0 ? `+${entry.amount}` : entry.amount);
      target.appendChild(row);
    }
    if (!entries.length) { const row = document.createElement("tr"); cell(row, "No transactions yet.").colSpan = admin ? 4 : 3; target.appendChild(row); }
  }
  return { request, cell, button: createIconButton, history };
})();
