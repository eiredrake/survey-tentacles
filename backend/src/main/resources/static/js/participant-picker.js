function setupParticipantPicker(container, addButton, participants) {
  const controls = document.createElement("div");
  controls.className = "expected-participant-picker";
  controls.hidden = true;
  container.appendChild(controls);
  addButton.addEventListener("click", async () => {
    if (!controls.hidden) { controls.hidden = true; return; }
    controls.hidden = false;
    controls.textContent = "Loading users and groups...";
    addButton.disabled = true;
    try {
      const [usersResponse, groupsResponse] = await Promise.all([fetch("/api/users"), fetch("/api/participant-groups")]);
      if (!usersResponse.ok || !groupsResponse.ok) throw new Error("Unable to load users and groups.");
      const [users, groups] = await Promise.all([usersResponse.json(), groupsResponse.json()]);
      controls.replaceChildren();
      const fields = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = "Select users and/or groups";
      fields.appendChild(legend);
      const assigned = new Set(participants.map(participant => participant.userId));
      for (const [kind, title, items] of [["user", "Users", users.filter(user => !assigned.has(user.id))], ["group", "Groups", groups]]) {
        const section = document.createElement("div");
        section.className = "participant-choices";
        const heading = document.createElement("h4");
        heading.textContent = title;
        const headingRow = document.createElement("div");
        headingRow.className = "participant-choice-heading";
        headingRow.appendChild(heading);
        if (kind === "group") {
          const manage = document.createElement("a");
          manage.href = "/participant-groups.html";
          manage.target = "_blank";
          manage.rel = "noopener";
          manage.textContent = "Manage participant groups";
          headingRow.appendChild(manage);
        }
        fields.appendChild(headingRow);
        for (const item of items) {
          const label = document.createElement("label"), input = document.createElement("input");
          input.type = "checkbox"; input.dataset.kind = kind; input.value = item.id;
          label.append(input, document.createTextNode(" " + (item.name || item.username) + (kind === "group" ? " (" + item.userIds.length + ")" : "")));
          section.appendChild(label);
        }
        if (!items.length) section.textContent = kind === "user" ? "All known users are already expected." : "No groups yet.";
        fields.appendChild(section);
      }
      const note = document.createElement("p");
      note.textContent = "Groups add their current members as individuals. Later group changes do not change this survey.";
      const save = document.createElement("button");
      save.type = "button"; save.className = "icon-button";
      save.title = "Save participant selection"; save.setAttribute("aria-label", save.title);
      save.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>';
      fields.append(note, save);
      controls.appendChild(fields);
      save.addEventListener("click", async () => {
        const selected = kind => [...fields.querySelectorAll('input[data-kind="' + kind + '"]:checked')].map(input => Number(input.value));
        const userIds = selected("user"), groupIds = selected("group");
        if (!userIds.length && !groupIds.length) { showToast("Select at least one user or group.", "error"); return; }
        fields.disabled = true; addButton.disabled = true;
        try {
          const csrfResponse = await fetch("/csrf");
          if (!csrfResponse.ok) throw new Error("Unable to load CSRF token.");
          const csrf = await csrfResponse.json();
          const response = await fetch("/api/surveys/" + surveyId + "/assignments/batch", {
            method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
            body: JSON.stringify({ userIds, groupIds, required: false })
          });
          if (!response.ok) throw new Error("Unable to add expected participants. Reopen the picker if a group or user was removed.");
          await loadParticipants();
          showToast("Expected participants updated.", "success");
        } catch (error) { showToast(error.message, "error"); }
        finally { fields.disabled = false; addButton.disabled = false; }
      });
    } catch (error) { controls.textContent = error.message; }
    finally { addButton.disabled = false; }
  });
}
