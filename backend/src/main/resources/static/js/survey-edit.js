const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");
let editingQuestionId = null;

function showQuestionEditor(templateId) {
    const container =
        document.getElementById("question-form-container");

    const template =
        document.getElementById(templateId);

    if (!template) {
        showToast(
            "Question editor template not found.",
            "error"
        );
        return;
    }

    container.replaceChildren(
        template.content.cloneNode(true)
    );

    container.hidden = false;

    setupQuestionEditorButtons();
    setupSchedulingEditor();
    setupSchedulingQuestionSave();
    setupShortTextQuestionSave();
}

function setupQuestionEditorButtons() {
  const container = document.getElementById("question-form-container");
  const cancelButton = document.getElementById("cancel-question-button");

  if (cancelButton) {
      cancelButton.addEventListener("click", () => {
          container.replaceChildren();
          container.hidden = true;
      });
  }
}

function getSchedulingSelections() {
  const selectionElements =
      document.querySelectorAll(".scheduling-selection");

  return Array.from(selectionElements).map(selection => ({
      date: selection.dataset.date,
      time: selection.dataset.time || null
  }));
}


async function loadSurvey() {
    const container = document.getElementById("survey-editor");

    if (!surveyId) {
        container.textContent = "No survey ID supplied.";
        return;
    }

    const response = await fetch("/api/surveys");

    if (!response.ok) {
        container.textContent = "Unable to load survey.";
        return;
    }

    const surveys = await response.json();
    const survey = surveys.find(
        survey => String(survey.id) === String(surveyId)
    );

    if (!survey) {
        container.textContent = "Survey not found.";
        return;
    }

    document.getElementById("survey-title").textContent =
        `Edit: ${survey.title}`;

    container.textContent = "";
}

function setupTitleEditor() {
  const button = document.getElementById("edit-title-button");
  const heading = document.getElementById("survey-title");

  button.addEventListener("click", () => {
      const currentTitle = heading.textContent.replace(/^Edit:\s*/, "");

      const input = document.createElement("input");
      input.type = "text";
      input.value = currentTitle;

      heading.replaceWith(input);
      input.focus();
      input.select();

      input.addEventListener("keydown", async event => {
        if (event.key !== "Enter") {
            return;
        }
    
        const newTitle = input.value.trim();
    
        if (!newTitle) {
            return;
        }
    
        const csrfResponse = await fetch("/csrf");
        const csrf = await csrfResponse.json();
    
        const response = await fetch(
            `/api/surveys/${surveyId}/title`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [csrf.headerName]: csrf.token
                },
                body: JSON.stringify({
                    title: newTitle
                })
            }
        );
    
        if (!response.ok) {
            showToast("Unable to update survey title.", "error");
            return;
        }
    
        const updatedSurvey = await response.json();
    
        const newHeading = document.createElement("h1");
        newHeading.id = "survey-title";
        newHeading.textContent = `Edit: ${updatedSurvey.title}`;
    
        input.replaceWith(newHeading);
    
        showToast("Survey title updated.", "success");
    });      
  });
}

function setupSchedulingQuestionSave() {
    const saveButton =
    document.getElementById("save-question-button");

    const promptInput = document.getElementById("scheduling-editor-prompt");

    if (!saveButton || !promptInput) {
        return;
    }

  saveButton.addEventListener("click", async () => {
      const required = document.querySelector(".question-required")?.checked ?? false;    
      const prompt = promptInput.value.trim();

      const selections = getSchedulingSelections();

      if (!prompt || !selections.length) {
          showToast(
              "Enter a question and at least one selection.",
              "error"
          );
          return;
      }

      const timeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone;

      const requestSelections = selections.map(selection => ({
          date: selection.date,
          time: selection.time,
          timeZone: selection.time ? timeZone : null
      }));

      const csrfResponse = await fetch("/csrf");
      const csrf = await csrfResponse.json();

      const url = editingQuestionId === null
      ? `/api/surveys/${surveyId}/questions/scheduling`
      : `/api/surveys/${surveyId}/questions/${editingQuestionId}/scheduling`;
  
      const response = await fetch(
          url,
          {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  [csrf.headerName]: csrf.token
              },
              body: JSON.stringify({
                  prompt: prompt,
                  displayOrder: 1,
                  required: required,
                  selections: requestSelections
              })
          }
      );

      if (!response.ok) {
          showToast(
              "Unable to create scheduling question.",
              "error"
          );
          return;
      }

      const wasEditing = editingQuestionId !== null;
      editingQuestionId = null;

      const container =
      document.getElementById("question-form-container");
  
      container.replaceChildren();
      container.hidden = true;
      
      await loadQuestions();

      showToast(
        wasEditing
            ? "Scheduling question updated."
            : "Scheduling question created.",
        "success"
    );
  });
}

function setupShortTextQuestionSave() {
    const saveButton =
        document.getElementById("save-question-button");

    const promptInput =
        document.getElementById("short-text-editor-prompt");

    if (!saveButton || !promptInput) {
        return;
    }

    saveButton.addEventListener("click", async () => {
        const prompt = promptInput.value.trim();

        const required =
            document.querySelector(".question-required")
                ?.checked ?? false;

        if (!prompt) {
            showToast(
                "Enter a question.",
                "error"
            );
            return;
        }

        const csrfResponse = await fetch("/csrf");
        const csrf = await csrfResponse.json();

        const url = editingQuestionId === null
        ? `/api/surveys/${surveyId}/questions/short-text`
        : `/api/surveys/${surveyId}/questions/${editingQuestionId}/short-text`;        

        const response = await fetch(url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [csrf.headerName]: csrf.token
                },
                body: JSON.stringify({
                    prompt: prompt,
                    displayOrder: 1,
                    required: required
                })
            }
        );

        if (!response.ok) {
            showToast(
                "Unable to create short text question.",
                "error"
            );
            return;
        }

        const wasEditing = editingQuestionId !== null;
        editingQuestionId = null;

        const container =
            document.getElementById("question-form-container");

        container.replaceChildren();
        container.hidden = true;

        await loadQuestions();

        showToast(
            wasEditing
                ? "Short text question updated."
                : "Short text question created.",
            "success"
        );
    });
}

async function loadQuestionTypes() {
  const response = await fetch("/api/surveys/question-types");

  if (!response.ok) {
      showToast("Unable to load question types.", "error");
      return;
  }

  const questionTypes = await response.json();
  const select = document.getElementById("question-type-select");

  select.innerHTML = "";

  for (const questionType of questionTypes) {
      const option = document.createElement("option");

      option.value = questionType.editorTemplateId;

      option.textContent = questionType.name
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/\b\w/g, letter => letter.toUpperCase());

      select.appendChild(option);
  }

  select.selectedIndex = -1;
}

function setupQuestionTypePicker() {
  const addButton = document.getElementById("add-question-button");
  const typeSelect = document.getElementById("question-type-select");

  addButton.addEventListener("click", event => {
      event.stopPropagation();

      typeSelect.hidden = false;
      typeSelect.focus();
  });

  typeSelect.addEventListener("click", event => {
      event.stopPropagation();
  });

  typeSelect.addEventListener("change", () => {
      const selectedType = typeSelect.value;

      typeSelect.hidden = true;

      editingQuestionId = null;

      showQuestionEditor(selectedType);
      typeSelect.selectedIndex = -1;
  });

  document.addEventListener("click", () => {
      typeSelect.hidden = true;
  });
}

function setupSchedulingEditor() {
  const includeTimeCheckbox =
      document.getElementById("scheduling-editor-include-time");

  const timeContainer =
      document.getElementById("scheduling-editor-time-container");

  const timeInput =
      document.getElementById("scheduling-editor-time");

  const dateInput =
      document.getElementById("scheduling-editor-date");

  const selectionList =
      document.getElementById("scheduling-editor-selection-list");

  if (
      !includeTimeCheckbox ||
      !timeContainer ||
      !timeInput ||
      !dateInput ||
      !selectionList
  ) {
      return;
  }

  function renderSelections(selectedDates) {
      selectionList.replaceChildren();

      if (!selectedDates.length) {
          selectionList.textContent = "No dates selected.";
          return;
      }

      for (const selectedDate of selectedDates) {
          const year = selectedDate.getFullYear();
          const month = String(
              selectedDate.getMonth() + 1
          ).padStart(2, "0");

          const day = String(
              selectedDate.getDate()
          ).padStart(2, "0");

          const dateValue = `${year}-${month}-${day}`;

          const selection =
              document.createElement("div");

          selection.className = "scheduling-selection";
          selection.dataset.date = dateValue;
          selection.dataset.time =
              includeTimeCheckbox.checked
                  ? timeInput.value
                  : "";

          const text =
              document.createElement("span");

          text.textContent =
              selection.dataset.time
                  ? `${dateValue} ${selection.dataset.time}`
                  : dateValue;

          selection.appendChild(text);
          selectionList.appendChild(selection);
      }
  }

  dateInput._flatpickr = flatpickr(dateInput, {
      mode: "multiple",
      dateFormat: "Y-m-d",
      inline: true,

      onChange: selectedDates => {
          renderSelections(selectedDates);
      }
  });

  includeTimeCheckbox.addEventListener("change", () => {
      timeContainer.hidden =
          !includeTimeCheckbox.checked;

      renderSelections(
          dateInput._flatpickr.selectedDates
      );
  });

  timeInput.addEventListener("change", () => {
      renderSelections(
          dateInput._flatpickr.selectedDates
      );
  });
}

async function loadQuestions() {
  const response = await fetch(
      `/api/surveys/${surveyId}/questions`
  );

  if (!response.ok) {
      showToast("Unable to load questions.", "error");
      return;
  }

  const questions = await response.json();
  const list = document.getElementById("question-list");

  list.replaceChildren();

  for (const question of questions) {
      const row = document.createElement("tr");

      const promptCell = document.createElement("td");
      promptCell.textContent = question.prompt;

      const typeCell = document.createElement("td");
      typeCell.textContent = question.type;

      const actionsCell = document.createElement("td");
      actionsCell.className = "actions-column";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "icon-button";
      editButton.title = "Edit question";
      editButton.setAttribute("aria-label", "Edit question");
      editButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      editButton.addEventListener("click", async () => {
        const response = await fetch(
            `/api/surveys/${surveyId}/questions/${question.id}`
        );
    
        if (!response.ok) {
            showToast("Unable to load question.", "error");
            return;
        }
    
        const questionDetails = await response.json();
    
        editingQuestionId = question.id;
    
        showQuestionEditor(question.editorTemplateId);
    
        const requiredCheckbox =
            document.querySelector(".question-required");
    
        if (requiredCheckbox) {
            requiredCheckbox.checked =
                questionDetails.required === true;
        }
    
        const schedulingPrompt =
            document.getElementById("scheduling-editor-prompt");
    
        if (schedulingPrompt) {
            schedulingPrompt.value =
                questionDetails.prompt;
    
            populateSchedulingSelections(
                questionDetails.options ?? []
            );
    
            return;
        }
    
        const shortTextPrompt =
            document.getElementById("short-text-editor-prompt");
    
        if (shortTextPrompt) {
            shortTextPrompt.value =
                questionDetails.prompt;
        }
    });        

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "icon-button";
      deleteButton.title = "Delete question";
      deleteButton.setAttribute("aria-label", "Delete question");
      deleteButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      
      deleteButton.addEventListener("click", async () => {
        const confirmed = confirm(
            `Delete "${question.prompt}"? This cannot be undone.`
        );
    
        if (!confirmed) {
            return;
        }
    
        const csrfResponse = await fetch("/csrf");
        const csrf = await csrfResponse.json();
    
        const response = await fetch(
            `/api/surveys/${surveyId}/questions/${question.id}`,
            {
                method: "DELETE",
                headers: {
                    [csrf.headerName]: csrf.token
                }
            }
        );
    
        if (!response.ok) {
            showToast("Unable to delete question.", "error");
            return;
        }
    
        await loadQuestions();
    
        showToast("Question deleted.", "success");
      });

      actionsCell.appendChild(editButton);
      actionsCell.appendChild(deleteButton);

      row.appendChild(promptCell);
      row.appendChild(typeCell);
      row.appendChild(actionsCell);

      list.appendChild(row);
  }
}

function populateSchedulingSelections(options) {
  const selectionList =
      document.getElementById("scheduling-editor-selection-list");

  const dateInput =
      document.getElementById("scheduling-editor-date");

  if (!selectionList) {
      return;
  }

  const includeTimeCheckbox =
    document.getElementById("scheduling-editor-include-time");

  const timeContainer =
      document.getElementById("scheduling-editor-time-container");

  const timeInput =
      document.getElementById("scheduling-editor-time");

  selectionList.replaceChildren();

  const timedOption = options.find(option => option.dateTime);

    if (timedOption) {
        const localDateTime = new Date(timedOption.dateTime);
    
        const hours = String(
            localDateTime.getHours()
        ).padStart(2, "0");
    
        const minutes = String(
            localDateTime.getMinutes()
        ).padStart(2, "0");
    
        includeTimeCheckbox.checked = true;
        timeContainer.hidden = false;
        timeInput.value = `${hours}:${minutes}`;
    } else {
        includeTimeCheckbox.checked = false;
        timeContainer.hidden = true;
        timeInput.value = "";
    }  

  for (const option of options) {
      const selection =
          document.createElement("div");

      selection.className = "scheduling-selection";

      let date;
      let time = "";

      if (option.dateTime) {
          const localDateTime =
              new Date(option.dateTime);

          const year =
              localDateTime.getFullYear();

          const month = String(
              localDateTime.getMonth() + 1
          ).padStart(2, "0");

          const day = String(
              localDateTime.getDate()
          ).padStart(2, "0");

          date = `${year}-${month}-${day}`;

          time = [
              String(
                  localDateTime.getHours()
              ).padStart(2, "0"),

              String(
                  localDateTime.getMinutes()
              ).padStart(2, "0")
          ].join(":");
      } else {
          date = option.date;
      }

      selection.dataset.date = date;
      selection.dataset.time = time;

      const text =
          document.createElement("span");

      text.textContent = time
          ? `${date} ${time}`
          : date;

      const removeButton =
          document.createElement("button");

      removeButton.type = "button";
      removeButton.className = "icon-button";
      removeButton.title = "Remove selection";

      removeButton.setAttribute(
          "aria-label",
          "Remove selection"
      );

      removeButton.innerHTML =
          '<i class="fa-solid fa-xmark"></i>';

      removeButton.addEventListener(
          "click",
          () => {
              selection.remove();

              const remainingDates = Array.from(
                  selectionList.querySelectorAll(
                      ".scheduling-selection"
                  )
              ).map(
                  item => item.dataset.date
              );

              if (dateInput?._flatpickr) {
                  dateInput._flatpickr.setDate(
                      remainingDates,
                      false
                  );
              }

              if (!selectionList.children.length) {
                  selectionList.textContent =
                      "No dates selected.";
              }
          }
      );

      selection.appendChild(text);
      selection.appendChild(removeButton);

      selectionList.appendChild(selection);
  }

  if (dateInput?._flatpickr) {
      const selectedDates = Array.from(
          selectionList.querySelectorAll(
              ".scheduling-selection"
          )
      ).map(
          selection => selection.dataset.date
      );

      dateInput._flatpickr.setDate(
          selectedDates,
          false
      );
  }
}

async function loadParticipants() {
    const container =
        document.getElementById("participants-view");

    const response = await fetch(
        `/api/surveys/${surveyId}/assignments`
    );

    if (!response.ok) {
        showToast(
            "Unable to load participants.",
            "error"
        );
        return;
    }

    const participants =
        await response.json();

    container.replaceChildren();

    const heading =
        document.createElement("div");

    heading.className =
        "section-heading";

    const headingText =
        document.createElement("h3");

    headingText.textContent =
        "Assigned Participants";

    const addButton =
        document.createElement("button");

    addButton.type = "button";
    addButton.className = "icon-button";
    addButton.title = "Add participant";
    addButton.setAttribute(
        "aria-label",
        "Add participant"
    );

    addButton.innerHTML =
        '<i class="fa-solid fa-plus"></i>';

    heading.appendChild(headingText);
    heading.appendChild(addButton);

    container.appendChild(heading);

    const addControls =
    document.createElement("div");

    addControls.className = "participant-add-controls";

    addControls.hidden = true;

    const usersResponse = await fetch("/api/users");

    if (!usersResponse.ok) {
        showToast(
            "Unable to load users.",
            "error"
        );
        return;
    }

    const users =
        await usersResponse.json();

    const assignedUserIds =
        new Set(
            participants.map(
                participant =>
                    participant.userId
            )
        );

    const userSelect =
        document.createElement("select");

    const placeholder =
        document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
        "Select user...";

    userSelect.appendChild(
        placeholder
    );

    for (const user of users) {
        if (
            assignedUserIds.has(
                user.userId
            )
        ) {
            continue;
        }

        const option =
            document.createElement("option");

        option.value =
            user.username;

        option.textContent =
            user.name ||
            user.username;

        userSelect.appendChild(
            option
        );
    }

    addControls.appendChild(
        userSelect
    );

    container.appendChild(
        addControls
    );

    addButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            addControls.hidden = false;
            userSelect.focus();
        }
    );

    addControls.addEventListener(
        "click",
        event => {
            event.stopPropagation();
        }
    );

    document.addEventListener(
        "click",
        () => {
            addControls.hidden = true;
        }
    );

    userSelect.addEventListener(
        "change",
        async () => {
            if (!userSelect.value) {
                return;
            }

            const csrfResponse =
                await fetch("/csrf");

            const csrf =
                await csrfResponse.json();

            const response =
                await fetch(
                    `/api/surveys/${surveyId}/assignments`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                            [csrf.headerName]:
                                csrf.token
                        },
                        body: JSON.stringify({
                            username:
                                userSelect.value,
                            required: false
                        })
                    }
                );

            if (!response.ok) {
                showToast(
                    "Unable to add participant.",
                    "error"
                );
                return;
            }

            await loadParticipants();

            showToast(
                "Participant added.",
                "success"
            );
        }
    );

    const table =
        document.createElement("table");

    table.className =
        "survey-table participants-table";

    const thead =
        document.createElement("thead");

    const headerRow =
        document.createElement("tr");

    for (const headingText of [
        "Name",
        "Required",
        "Actions"
    ]) {
        const th =
            document.createElement("th");

        th.textContent =
            headingText;

        headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody =
        document.createElement("tbody");

    for (const participant of participants) {
        const row =
            document.createElement("tr");

        const nameCell =
            document.createElement("td");

        nameCell.textContent =
            participant.name ||
            participant.username;

        const requiredCell =
            document.createElement("td");

        const requiredToggle =
            document.createElement("input");

        requiredToggle.type = "checkbox";
        requiredToggle.checked = participant.required;
        requiredToggle.addEventListener(
            "change",
            async () => {
                const csrfResponse =
                    await fetch("/csrf");
        
                const csrf =
                    await csrfResponse.json();
        
                const response = await fetch(
                    `/api/surveys/${surveyId}/assignments/${participant.userId}/required`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                            [csrf.headerName]:
                                csrf.token
                        },
                        body: JSON.stringify({
                            required:
                                requiredToggle.checked
                        })
                    }
                );
        
                if (!response.ok) {
                    requiredToggle.checked =
                        !requiredToggle.checked;
        
                    showToast(
                        "Unable to update participant.",
                        "error"
                    );
        
                    return;
                }
        
                showToast(
                    "Participant updated.",
                    "success"
                );
            }
        );

        requiredCell.appendChild(
            requiredToggle
        );

        const actionsCell =
            document.createElement("td");

        actionsCell.className =
            "actions-column";

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "icon-button";
        removeButton.title = "Remove participant";
        removeButton.setAttribute(
            "aria-label",
            "Remove participant"
        );

        removeButton.addEventListener(
            "click",
            async () => {
                const confirmed = confirm(
                    `Remove ${participant.name || participant.username} from this survey?`
                );
        
                if (!confirmed) {
                    return;
                }
        
                const csrfResponse =
                    await fetch("/csrf");
        
                const csrf =
                    await csrfResponse.json();
        
                const response = await fetch(
                    `/api/surveys/${surveyId}/assignments/${participant.userId}`,
                    {
                        method: "DELETE",
                        headers: {
                            [csrf.headerName]:
                                csrf.token
                        }
                    }
                );
        
                if (!response.ok) {
                    showToast(
                        "Unable to remove participant.",
                        "error"
                    );
                    return;
                }
        
                await loadParticipants();
        
                showToast(
                    "Participant removed.",
                    "success"
                );
            }
        );        

        removeButton.innerHTML =
            '<i class="fa-solid fa-xmark"></i>';

        actionsCell.appendChild(
            removeButton
        );

        row.appendChild(nameCell);
        row.appendChild(requiredCell);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    }

    table.appendChild(tbody);
    container.appendChild(table);
}

async function initialize() {

  await loadSurvey();
  await loadQuestionTypes();
  setupTitleEditor();
  setupQuestionTypePicker();
  await loadQuestions();
  await loadParticipants();
}

initialize();