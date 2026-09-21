(async function () {
  const { request, cell, button, history } = Rewards;
  const admin = document.body.dataset.rewardsAdmin === "true";
  const status = document.getElementById("rewards-status");
  const report = error => { status.textContent = error.message; showToast(error.message, "error"); };
  let perkId = null, busy = false;
  const pending = new Map();

  async function refresh() {
    if (admin) {
      const [settings, perks, redemptions] = await Promise.all([request("/settings"), request("/admin/perks"), request("/admin/redemptions")]);
      document.getElementById("rewards-enabled").checked = settings.enabled;
      document.getElementById("point-name").value = settings.pointName;
      status.textContent = "";
      renderPerks(perks, null, settings.pointName);
      history(document.getElementById("redemptions"), redemptions, true);
    } else {
      const account = await request("/account");
      document.getElementById("balance").textContent = `${account.balance} ${account.settings.pointName}`;
      status.textContent = account.settings.enabled ? "" : "Rewards are paused. Your balance and history are preserved.";
      renderPerks(account.perks, account.balance, account.settings.pointName);
      history(document.getElementById("reward-history"), account.history);
      const leaders = document.getElementById("leaderboard"); leaders.replaceChildren();
      account.leaderboard.forEach((leader, index) => {
        const row = document.createElement("tr"); cell(row, index + 1); cell(row, leader.name); cell(row, leader.earned); leaders.appendChild(row);
      });
    }
  }

  function renderPerks(perks, balance, pointName) {
    const list = document.getElementById("perks"); list.replaceChildren();
    for (const perk of perks) {
      const row = document.createElement("tr"); cell(row, perk.name); cell(row, perk.description); cell(row, `${perk.cost} ${pointName}`);
      if (admin) cell(row, perk.active ? "Available" : "Retired");
      const actions = cell(row, ""); actions.className = "actions-column";
      const action = button(admin ? `Edit ${perk.name}` : `Redeem ${perk.name}`, admin ? "pen-to-square" : "gift", async () => {
        if (admin) { editPerk(perk); return; }
        if (busy || !confirm(`Spend ${perk.cost} ${pointName} on ${perk.name}?`)) return;
        busy = true; action.disabled = true;
        // Preserve a request ID on network failure so a retry cannot spend twice.
        if (!pending.has(perk.id)) pending.set(perk.id, crypto.randomUUID());
        try {
          await request("/redeem", "POST", { perkId: perk.id, requestId: pending.get(perk.id) });
          pending.delete(perk.id); showToast("Perk redeemed.", "success"); await refresh();
        } catch (error) { report(error); }
        finally { busy = false; action.disabled = false; }
      });
      action.disabled = !admin && perk.cost > balance; actions.appendChild(action); list.appendChild(row);
    }
    if (!perks.length) { const row = document.createElement("tr"); cell(row, "No perks available.").colSpan = admin ? 5 : 4; list.appendChild(row); }
  }

  function editPerk(perk = null) {
    const form = document.getElementById("perk-form");
    if (!form.hidden && !confirm("Discard the current perk changes?")) return;
    perkId = perk?.id ?? null; form.hidden = false;
    document.getElementById("perk-name").value = perk?.name ?? "";
    document.getElementById("perk-description").value = perk?.description ?? "";
    document.getElementById("perk-cost").value = perk?.cost ?? 1;
    document.getElementById("perk-active").checked = perk?.active ?? true;
    document.getElementById("perk-name").focus();
  }

  if (admin) {
    document.getElementById("add-perk").addEventListener("click", () => editPerk());
    document.getElementById("cancel-perk").addEventListener("click", () => { document.getElementById("perk-form").hidden = true; });
    for (const id of ["rewards-settings", "perk-form"]) document.getElementById(id).addEventListener("submit", async event => {
      event.preventDefault(); if (busy) return; busy = true;
      const submit = event.target.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        if (id === "rewards-settings") await request("/admin/settings", "PUT", {
          enabled: document.getElementById("rewards-enabled").checked, pointName: document.getElementById("point-name").value
        });
        else {
          await request(`/admin/perks${perkId === null ? "" : `/${perkId}`}`, perkId === null ? "POST" : "PUT", {
            name: document.getElementById("perk-name").value, description: document.getElementById("perk-description").value,
            cost: Number(document.getElementById("perk-cost").value), active: document.getElementById("perk-active").checked
          });
          event.target.hidden = true;
        }
        await refresh(); showToast("Rewards settings saved.", "success");
      } catch (error) { report(error); }
      finally { busy = false; submit.disabled = false; }
    });
  }
  try { await refresh(); } catch (error) { report(error); }
})();
