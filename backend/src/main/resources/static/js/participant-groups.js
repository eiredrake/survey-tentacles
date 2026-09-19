let knownUsers = [], editingGroupId = null, groupDirty = false, groupBusy = false;
const groupForm = document.getElementById("group-editor");
window.addEventListener("beforeunload", event => { if (groupDirty || groupBusy) event.preventDefault(); });
groupForm.addEventListener("input", () => { groupDirty = true; });
groupForm.addEventListener("change", () => { groupDirty = true; });

function canLeaveGroup() { return !groupBusy && (!groupDirty || confirm("Discard unsaved group changes?")); }
function editGroup(group = null) {
  if (!canLeaveGroup()) return;
  editingGroupId = group?.id ?? null;
  document.getElementById("group-editor-title").textContent = group ? "Edit group" : "Create group";
  document.getElementById("group-name").value = group?.name ?? "";
  const members = document.getElementById("group-members");
  members.replaceChildren();
  for (const user of knownUsers) {
    const label = document.createElement("label"), input = document.createElement("input");
    input.type = "checkbox"; input.value = user.id; input.checked = group?.userIds.includes(user.id) ?? false;
    label.append(input, document.createTextNode(" " + (user.name || user.username)));
    members.appendChild(label);
  }
  if (!knownUsers.length) members.textContent = "Users become available after they sign in to Tentacles.";
  groupDirty = false; groupForm.hidden = false;
  document.getElementById("group-name").focus();
}

async function groupRequest(url, method, body) {
  const token = await getCsrfToken();
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", [token.headerName]: token.token },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(response.status === 409 ? "A group with this name already exists. Choose another name."
    : "Unable to save changes. The group or one of its users may have been removed.");
}

async function loadGroups() {
  const response = await fetch("/api/participant-groups");
  if (!response.ok) throw new Error("Unable to load participant groups.");
  const groups = await response.json(), list = document.getElementById("group-list");
  list.replaceChildren();
  for (const group of groups) {
    const row = document.createElement("tr");
    const name = document.createElement("td"), count = document.createElement("td"), actions = document.createElement("td");
    name.textContent = group.name; count.textContent = group.userIds.length; actions.className = "actions-column";
    for (const [title, icon, action] of [["Edit group", "fa-pen-to-square", () => editGroup(group)], ["Delete group", "fa-xmark", async () => {
      if (!canLeaveGroup() || !confirm('Delete "' + group.name + '"? Existing survey participants will stay unchanged.')) return;
      groupBusy = true; document.getElementById("group-fields").disabled = true;
      try {
        await groupRequest("/api/participant-groups/" + group.id, "DELETE");
        groupDirty = false; groupForm.hidden = true;
        await loadGroups(); showToast("Group deleted.", "success");
      } catch (error) { showToast(error.message, "error"); }
      finally { groupBusy = false; document.getElementById("group-fields").disabled = false; }
    }]]) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "icon-button"; button.title = title;
      button.setAttribute("aria-label", title + " " + group.name);
      button.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
      button.addEventListener("click", action); actions.appendChild(button);
    }
    row.append(name, count, actions); list.appendChild(row);
  }
  if (!groups.length) { const row = list.insertRow(); const cell = row.insertCell(); cell.colSpan = 3; cell.textContent = "No participant groups yet."; }
}

document.getElementById("new-group").addEventListener("click", () => editGroup());
document.getElementById("cancel-group").addEventListener("click", () => { if (canLeaveGroup()) { groupForm.hidden = true; groupDirty = false; } });
groupForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (groupBusy) return;
  const name = document.getElementById("group-name").value.trim();
  if (!name) { showToast("Enter a group name.", "error"); return; }
  const userIds = [...document.querySelectorAll("#group-members input:checked")].map(input => Number(input.value));
  groupBusy = true; document.getElementById("group-fields").disabled = true;
  try {
    await groupRequest("/api/participant-groups" + (editingGroupId == null ? "" : "/" + editingGroupId), editingGroupId == null ? "POST" : "PUT", { name, userIds });
    groupDirty = false; groupForm.hidden = true;
    await loadGroups(); showToast("Group saved.", "success");
  } catch (error) { showToast(error.message, "error"); }
  finally { groupBusy = false; document.getElementById("group-fields").disabled = false; }
});

async function initialize() {
  try {
    const response = await fetch("/me");
    if (!response.ok) throw new Error("Unable to load user.");
    const user = await response.json();
    document.getElementById("user").textContent = user.name || user.username;
    if (!user.authorities?.includes("ROLE_ADMIN")) throw new Error("Only administrators can manage participant groups.");
    const usersResponse = await fetch("/api/users");
    if (!usersResponse.ok) throw new Error("Unable to load users.");
    knownUsers = (await usersResponse.json()).sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
    await loadGroups(); document.getElementById("group-management").hidden = false;
  } catch (error) { showToast(error.message, "error"); }
}
initialize();
