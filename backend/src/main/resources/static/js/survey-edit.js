const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");
function showQuestionEditor(templateId) {
  const container = document.getElementById("question-form-container");
  const template = document.getElementById(templateId);

  if (!template) {
      showToast("Question editor template not found.", "error");
      return;
  }

  container.replaceChildren(
      template.content.cloneNode(true)
  );

  container.hidden = false;
  setupQuestionEditorButtons();
  setupSchedulingEditor();
  setupSchedulingSelectionControls();
  setupSchedulingQuestionSave();
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

function setupSchedulingSelectionControls() {
  const dateInput =
      document.getElementById("scheduling-editor-date");

  const timeInput =
      document.getElementById("scheduling-editor-time");

  const includeTimeCheckbox =
      document.getElementById("scheduling-editor-include-time");

  const addButton =
      document.getElementById("add-scheduling-selection-button");

  const selectionList =
      document.getElementById("scheduling-editor-selection-list");

  if (
      !dateInput ||
      !timeInput ||
      !includeTimeCheckbox ||
      !addButton ||
      !selectionList
  ) {
      return;
  }

  addButton.addEventListener("click", () => {
      const selectedDates =
          dateInput._flatpickr?.selectedDates ?? [];

      if (!selectedDates.length) {
          return;
      }

      if (
          selectionList.textContent.trim() ===
          "No dates selected."
      ) {
          selectionList.replaceChildren();
      }

      for (const selectedDate of selectedDates) {
          const selection =
              document.createElement("div");

          selection.className = "scheduling-selection";

          const year = selectedDate.getFullYear();

          const month = String(
              selectedDate.getMonth() + 1
          ).padStart(2, "0");

          const day = String(
              selectedDate.getDate()
          ).padStart(2, "0");

          const dateValue = `${year}-${month}-${day}`;

          selection.dataset.date = dateValue;
          selection.dataset.time = includeTimeCheckbox.checked ? timeInput.value : "";              

          const text =
              document.createElement("span");

          text.textContent =
              includeTimeCheckbox.checked &&
              timeInput.value
                  ? `${dateValue} ${timeInput.value}`
                  : dateValue;

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

      dateInput._flatpickr.clear();
  });
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

  if (!saveButton) {
      return;
  }

  saveButton.addEventListener("click", async () => {
      const prompt =
          document.getElementById("scheduling-editor-prompt")
              .value
              .trim();

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

      const response = await fetch(
          `/api/surveys/${surveyId}/questions/scheduling`,
          {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  [csrf.headerName]: csrf.token
              },
              body: JSON.stringify({
                  prompt: prompt,
                  displayOrder: 1,
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

      const container =
      document.getElementById("question-form-container");
  
      container.replaceChildren();
      container.hidden = true;
      
      await loadQuestions();

      showToast(
          "Scheduling question created.",
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

  const dateInput =
      document.getElementById("scheduling-editor-date");

  if (!includeTimeCheckbox || !timeContainer || !dateInput) {
      return;
  }

  dateInput._flatpickr = flatpickr(dateInput, {
    mode: "multiple",
    dateFormat: "Y-m-d",
    inline: true
});

  includeTimeCheckbox.addEventListener("change", () => {
      timeContainer.hidden = !includeTimeCheckbox.checked;
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
      editButton.innerHTML =
          '<i class="fa-solid fa-pen-to-square"></i>';

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

async function initialize() {
  await loadSurvey();
  await loadQuestionTypes();
  setupTitleEditor();
  setupQuestionTypePicker();
  await loadQuestions();
}

initialize();