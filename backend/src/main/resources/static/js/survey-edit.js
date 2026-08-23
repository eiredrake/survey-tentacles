const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");
let editingQuestionId = null;

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
      editButton.innerHTML =
          '<i class="fa-solid fa-pen-to-square"></i>';

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
        
            const promptInput =
            document.getElementById("scheduling-editor-prompt");
        
            promptInput.value = questionDetails.prompt;
            populateSchedulingSelections(questionDetails.options);
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

  selectionList.replaceChildren();

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

async function initialize() {
  await loadSurvey();
  await loadQuestionTypes();
  setupTitleEditor();
  setupQuestionTypePicker();
  await loadQuestions();
}

initialize();