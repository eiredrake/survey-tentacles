const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");
let editingQuestionId = null;

const dirtySources = new Set();

function markDirty(source) {
  dirtySources.add(source);
}

function clearDirty(source) {
  dirtySources.delete(source);
}

function hasUnsavedChanges() {
  return dirtySources.size > 0;
}

window.addEventListener("beforeunload", event => {
  if (!hasUnsavedChanges()) {
    return;
  }

  event.preventDefault();
});

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

  container.addEventListener("input", () => {
    markDirty("question");
  });
  
  container.addEventListener("change", () => {
    markDirty("question");
  });  

  setupQuestionEditorButtons();
  setupSchedulingEditor();
  setupSchedulingQuestionSave();
  setupShortTextQuestionSave();
  setupNominationQuestionSave();
  setupSelectEditor("single-select", "Single Select");
  setupSelectEditor("multi-select", "Multi Select");
  setupRelationshipEditor();
  setupRelationshipQuestionSave();
}

function addSelectOption(label = "", type = "single-select") {
  const row = document.createElement("div");
  row.className = `${type}-editor-option`;
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 255;
  input.value = label;
  input.setAttribute("aria-label", "Option label");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button";
  remove.title = "Remove option";
  remove.setAttribute("aria-label", "Remove option");
  remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  remove.addEventListener("click", () => {
    row.remove();
    markDirty("question");
  });
  row.append(input, remove);
  document.getElementById(`${type}-editor-options`).appendChild(row);
  return input;
}

function setupSelectEditor(type, displayName) {
  const promptInput = document.getElementById(`${type}-editor-prompt`);
  if (!promptInput) return;
  const optionsContainer = document.getElementById(`${type}-editor-options`);
  document.getElementById(`add-${type}-option`).addEventListener("click", () => {
    addSelectOption("", type).focus();
    markDirty("question");
  });
  const saveButton = document.getElementById("save-question-button");
  saveButton.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    const options = [...optionsContainer.querySelectorAll("input")].map(input => input.value.trim());
    if (!prompt || !options.length || options.some(label => !label)) {
      showToast("Enter a question and a label for every option.", "error");
      return;
    }
    const wasEditing = editingQuestionId !== null;
    const url = wasEditing
      ? `/api/surveys/${surveyId}/questions/${editingQuestionId}/${type}`
      : `/api/surveys/${surveyId}/questions/${type}`;
    saveButton.disabled = true;
    try {
      const csrfResponse = await fetch("/csrf");
      if (!csrfResponse.ok) throw new Error("Unable to load CSRF token.");
      const csrf = await csrfResponse.json();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ prompt, options, displayOrder: 1,
          required: document.querySelector(".question-required").checked })
      });
      if (!response.ok) throw new Error(`Unable to save ${displayName} question.`);
      const result = await response.json();
      editingQuestionId = null;
      clearDirty("question");
      const container = document.getElementById("question-form-container");
      container.replaceChildren();
      container.hidden = true;
      await loadQuestions();
      showToast(result.responsesCleared ? "Question updated. Previous responses cleared."
        : wasEditing ? `${displayName} question updated.` : `${displayName} question created.`, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  });
}

function setupRelationshipEditor() {
  const nameInput =
    document.getElementById("relationship-editor-name");

  const descriptionInput =
    document.getElementById("relationship-editor-description");

  const showEditorButton =
    document.getElementById(
      "show-relationship-subject-editor-button"
    );

  const subjectEditor =
    document.getElementById("relationship-subject-editor");

  const addButton =
    document.getElementById("add-relationship-subject-button");

  const subjectList =
    document.getElementById("relationship-editor-subject-list");

  if (
    !nameInput ||
    !descriptionInput ||
    !showEditorButton ||
    !subjectEditor ||
    !addButton ||
    !subjectList
  ) {
    return;
  }

  showEditorButton.addEventListener("click", () => {
    subjectEditor.hidden = false;
    nameInput.focus();
  });

  addButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const description =
      descriptionInput.value.trim();

    if (!name) {
      showToast(
        "Enter a character name.",
        "error"
      );
      return;
    }

    const row =
      createRelationshipSubjectRow(
        name,
        description
      );

    subjectList.appendChild(row);

    nameInput.value = "";
    descriptionInput.value = "";

    subjectEditor.hidden = true;
  });
}

function createRelationshipSubjectRow(
  name,
  description = ""
) {
  const row =
    document.createElement("tr");

  row.className =
    "relationship-subject";

  row.dataset.name = name;
  row.dataset.description =
    description;

  const nameCell =
    document.createElement("td");

  nameCell.textContent = name;

  const descriptionCell =
    document.createElement("td");

  descriptionCell.textContent =
    description;

  const actionsCell =
    document.createElement("td");

  actionsCell.className =
    "actions-column";

  const removeButton =
    document.createElement("button");

  removeButton.type = "button";
  removeButton.className =
    "icon-button";

  removeButton.title =
    "Remove character";

  removeButton.setAttribute(
    "aria-label",
    `Remove ${name}`
  );

  removeButton.innerHTML =
    '<i class="fa-solid fa-xmark"></i>';

  removeButton.addEventListener(
    "click",
    () => {
      row.remove();
    }
  );

  actionsCell.appendChild(
    removeButton
  );

  row.appendChild(nameCell);
  row.appendChild(descriptionCell);
  row.appendChild(actionsCell);

  return row;
}

function setupQuestionEditorButtons() {
  const container =
    document.getElementById(
      "question-form-container"
    );

  const cancelButton =
    document.getElementById(
      "cancel-question-button"
    );

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      clearDirty("question");
  
      container.replaceChildren();
      container.hidden = true;
  
      editingQuestionId = null;
    });
  }
}

function getSchedulingSelections() {
  const selectionElements =
    document.querySelectorAll(
      ".scheduling-selection"
    );

  return Array.from(
    selectionElements
  ).map(selection => ({
    date: selection.dataset.date,
    time:
      selection.dataset.time || null
  }));
}

async function loadSurvey() {
  const container =
    document.getElementById(
      "survey-editor"
    );

  if (!surveyId) {
    container.textContent =
      "No survey ID supplied.";
    return;
  }

  const response =
    await fetch("/api/surveys");

  if (!response.ok) {
    container.textContent =
      "Unable to load survey.";
    return;
  }

  const surveys =
    await response.json();

  const survey = surveys.find(
    survey =>
      String(survey.id) ===
      String(surveyId)
  );

  if (!survey) {
    container.textContent = "Survey not found.";
    return;
  }

  const developmentBanner = document.getElementById("development-mode-banner");

  if (developmentBanner && survey.status === "DEVELOPMENT") {
      developmentBanner.hidden = false;
  }  

  document.getElementById("survey-title").textContent =`Edit: ${survey.title}`;

  const preview = document.getElementById("survey-image-preview");
  
  const image = document.getElementById("survey-image");
  
  if (preview && image && survey.imageFilename) {
    image.src =`/api/surveys/${surveyId}/image`;
    preview.hidden = false;
  }    

  container.textContent = "";
}

function setupTitleEditor() {
  const button =
    document.getElementById(
      "edit-title-button"
    );

  const heading =
    document.getElementById(
      "survey-title"
    );

  button.addEventListener(
    "click",
    () => {
      const currentTitle =
        heading.textContent.replace(
          /^Edit:\s*/,
          ""
        );

      const input =
        document.createElement("input");

      input.type = "text";
      input.value = currentTitle;

      heading.replaceWith(input);

      input.focus();
      input.select();

      input.addEventListener(
        "keydown",
        async event => {
          if (event.key !== "Enter") {
            return;
          }

          const newTitle =
            input.value.trim();

          if (!newTitle) {
            return;
          }

          const csrfResponse =
            await fetch("/csrf");

          const csrf =
            await csrfResponse.json();

          const response =
            await fetch(
              `/api/surveys/${surveyId}/title`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  [csrf.headerName]:
                    csrf.token
                },
                body: JSON.stringify({
                  title: newTitle
                })
              }
            );

          if (!response.ok) {
            showToast(
              "Unable to update survey title.",
              "error"
            );
            return;
          }

          const updatedSurvey =
            await response.json();

          const newHeading =
            document.createElement("h1");

          newHeading.id =
            "survey-title";

          newHeading.textContent =
            `Edit: ${updatedSurvey.title}`;

          input.replaceWith(
            newHeading
          );

          showToast(
            "Survey title updated.",
            "success"
          );
        }
      );
    }
  );
}

function setupSchedulingQuestionSave() {
  const saveButton =
    document.getElementById(
      "save-question-button"
    );

  const promptInput =
    document.getElementById(
      "scheduling-editor-prompt"
    );

  if (!saveButton || !promptInput) {
    return;
  }

  saveButton.addEventListener(
    "click",
    async () => {
      const required =
        document.querySelector(
          ".question-required"
        )?.checked ?? false;

      const prompt =
        promptInput.value.trim();

      const selections =
        getSchedulingSelections();

      if (
        !prompt ||
        !selections.length
      ) {
        showToast(
          "Enter a question and at least one selection.",
          "error"
        );
        return;
      }

      const timeZone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone;

      const requestSelections =
        selections.map(
          selection => ({
            date: selection.date,
            time: selection.time,
            timeZone:
              selection.time
                ? timeZone
                : null
          })
        );

      const csrfResponse =
        await fetch("/csrf");

      const csrf =
        await csrfResponse.json();

      const url =
        editingQuestionId === null
          ? `/api/surveys/${surveyId}/questions/scheduling`
          : `/api/surveys/${surveyId}/questions/${editingQuestionId}/scheduling`;

      const response =
        await fetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              [csrf.headerName]:
                csrf.token
            },
            body: JSON.stringify({
              prompt: prompt,
              displayOrder: 1,
              required: required,
              selections:
                requestSelections
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
      clearDirty("question");      

      const container =
        document.getElementById(
          "question-form-container"
        );

      container.replaceChildren();
      container.hidden = true;

      await loadQuestions();

      showToast(
        wasEditing
          ? "Scheduling question updated."
          : "Scheduling question created.",
        "success"
      );
    }
  );
}

function setupShortTextQuestionSave() {
  const saveButton =
    document.getElementById(
      "save-question-button"
    );

  const promptInput =
    document.getElementById(
      "short-text-editor-prompt"
    );

  if (!saveButton || !promptInput) {
    return;
  }

  saveButton.addEventListener(
    "click",
    async () => {
      const prompt =
        promptInput.value.trim();

      const required =
        document.querySelector(
          ".question-required"
        )?.checked ?? false;

      if (!prompt) {
        showToast(
          "Enter a question.",
          "error"
        );
        return;
      }

      const csrfResponse =
        await fetch("/csrf");

      const csrf =
        await csrfResponse.json();

      const url =
        editingQuestionId === null
          ? `/api/surveys/${surveyId}/questions/short-text`
          : `/api/surveys/${surveyId}/questions/${editingQuestionId}/short-text`;

      const response =
        await fetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              [csrf.headerName]:
                csrf.token
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

      const wasEditing =
        editingQuestionId !== null;

      editingQuestionId = null;
      clearDirty("question");      

      const container =
        document.getElementById(
          "question-form-container"
        );

      container.replaceChildren();
      container.hidden = true;

      await loadQuestions();

      showToast(
        wasEditing
          ? "Short text question updated."
          : "Short text question created.",
        "success"
      );
    }
  );
}

function setupRelationshipQuestionSave() {
  const saveButton =
    document.getElementById(
      "save-question-button"
    );

  const promptInput =
    document.getElementById(
      "relationship-editor-prompt"
    );

  const subjectList =
    document.getElementById(
      "relationship-editor-subject-list"
    );

  if (
    !saveButton ||
    !promptInput ||
    !subjectList
  ) {
    return;
  }

  saveButton.addEventListener(
    "click",
    async () => {
      const prompt =
        promptInput.value.trim();

      if (!prompt) {
        showToast(
          "Enter a question.",
          "error"
        );
        return;
      }

      const subjects =
        Array.from(
          subjectList.querySelectorAll(
            ".relationship-subject"
          )
        ).map(
          (subject, index) => ({
            name:
              subject.dataset.name,
            description:
              subject.dataset
                .description || "",
            displayOrder: index
          })
        );

      if (subjects.length === 0) {
        showToast(
          "Add at least one character.",
          "error"
        );
        return;
      }

      const required =
        document.querySelector(
          ".question-required"
        )?.checked ?? false;

      const csrfResponse =
        await fetch("/csrf");

      const csrf =
        await csrfResponse.json();

      const url =
        editingQuestionId === null
          ? `/api/surveys/${surveyId}/questions/relationship`
          : `/api/surveys/${surveyId}/questions/${editingQuestionId}/relationship`;

      const response =
        await fetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              [csrf.headerName]:
                csrf.token
            },
            body: JSON.stringify({
              prompt: prompt,
              displayOrder: 1,
              required: required,
              subjects: subjects
            })
          }
        );

      if (!response.ok) {
        showToast(
          "Unable to save relationship question.",
          "error"
        );
        return;
      }

      const wasEditing = editingQuestionId !== null;

      editingQuestionId = null;
      clearDirty("question");

      const container =
        document.getElementById(
          "question-form-container"
        );

      container.replaceChildren();
      container.hidden = true;

      await loadQuestions();

      showToast(
        wasEditing
          ? "Relationship question updated."
          : "Relationship question created.",
        "success"
      );
    }
  );
}

async function loadQuestionTypes() {
  const response =
    await fetch(
      "/api/surveys/question-types"
    );

  if (!response.ok) {
    showToast(
      "Unable to load question types.",
      "error"
    );
    return;
  }

  const questionTypes =
    await response.json();

  const select =
    document.getElementById(
      "question-type-select"
    );

  select.innerHTML = "";

  for (
    const questionType
    of questionTypes
  ) {
    const option =
      document.createElement("option");

    option.value =
      questionType.editorTemplateId;

    option.textContent =
      questionType.name
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(
          /\b\w/g,
          letter =>
            letter.toUpperCase()
        );

    select.appendChild(option);
  }

  select.selectedIndex = -1;
}

function setupQuestionTypePicker() {
  const addButton =
    document.getElementById(
      "add-question-button"
    );

  const typeSelect =
    document.getElementById(
      "question-type-select"
    );

  addButton.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      typeSelect.hidden = false;
      typeSelect.focus();
    }
  );

  typeSelect.addEventListener(
    "click",
    event => {
      event.stopPropagation();
    }
  );

  typeSelect.addEventListener(
    "change",
    () => {
      const selectedType =
        typeSelect.value;

      typeSelect.hidden = true;

      editingQuestionId = null;

      showQuestionEditor(
        selectedType
      );

      typeSelect.selectedIndex =
        -1;
    }
  );

  document.addEventListener(
    "click",
    () => {
      typeSelect.hidden = true;
    }
  );
}

function setupSchedulingEditor() {
  const includeTimeCheckbox =
    document.getElementById(
      "scheduling-editor-include-time"
    );

  const timeContainer =
    document.getElementById(
      "scheduling-editor-time-container"
    );

  const timeInput =
    document.getElementById(
      "scheduling-editor-time"
    );

  const dateInput =
    document.getElementById(
      "scheduling-editor-date"
    );

  const selectionList =
    document.getElementById(
      "scheduling-editor-selection-list"
    );

  if (
    !includeTimeCheckbox ||
    !timeContainer ||
    !timeInput ||
    !dateInput ||
    !selectionList
  ) {
    return;
  }

  function renderSelections(
    selectedDates
  ) {
    selectionList.replaceChildren();

    if (!selectedDates.length) {
      selectionList.textContent =
        "No dates selected.";
      return;
    }

    for (
      const selectedDate
      of selectedDates
    ) {
      const year =
        selectedDate.getFullYear();

      const month =
        String(
          selectedDate.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          selectedDate.getDate()
        ).padStart(2, "0");

      const dateValue =
        `${year}-${month}-${day}`;

      const selection =
        document.createElement("div");

      selection.className =
        "scheduling-selection";

      selection.dataset.date =
        dateValue;

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
      selectionList.appendChild(
        selection
      );
    }
  }

  dateInput._flatpickr =
    flatpickr(
      dateInput,
      {
        mode: "multiple",
        dateFormat: "Y-m-d",
        inline: true,

        onChange: selectedDates => {
          renderSelections(
            selectedDates
          );
          markDirty("question");
        }
      }
    );

  includeTimeCheckbox
    .addEventListener(
      "change",
      () => {
        timeContainer.hidden =
          !includeTimeCheckbox.checked;

        renderSelections(
          dateInput._flatpickr
            .selectedDates
        );
        markDirty("question");
      }
    );

  timeInput.addEventListener(
    "change",
    () => {
      renderSelections(
        dateInput._flatpickr
          .selectedDates
      );
    }
  );
}

async function loadQuestions() {
  const response =
    await fetch(
      `/api/surveys/${surveyId}/questions`
    );

  if (!response.ok) {
    showToast(
      "Unable to load questions.",
      "error"
    );
    return;
  }

  const questions =
    await response.json();

  const list =
    document.getElementById(
      "question-list"
    );

  list.replaceChildren();

  for (const question of questions) {
    const row =
      document.createElement("tr");

    const promptCell =
      document.createElement("td");

    promptCell.textContent =
      question.prompt;

    const typeCell =
      document.createElement("td");

    typeCell.textContent =
      question.type;

    const actionsCell =
      document.createElement("td");

    actionsCell.className =
      "actions-column";

    const editButton =
      document.createElement("button");

    editButton.type = "button";
    editButton.className =
      "icon-button";

    editButton.title =
      "Edit question";

    editButton.setAttribute(
      "aria-label",
      "Edit question"
    );

    editButton.innerHTML =
      '<i class="fa-solid fa-pen-to-square"></i>';

    editButton.addEventListener(
      "click",
      async () => {
        const response =
          await fetch(
            `/api/surveys/${surveyId}/questions/${question.id}`
          );

        if (!response.ok) {
          showToast(
            "Unable to load question.",
            "error"
          );
          return;
        }

        const questionDetails =
          await response.json();

        editingQuestionId =
          question.id;

        showQuestionEditor(
          question.editorTemplateId
        );

        const requiredCheckbox =
          document.querySelector(
            ".question-required"
          );

        if (requiredCheckbox) {
          requiredCheckbox.checked =
            questionDetails.required ===
            true;
        }

        const schedulingPrompt =
          document.getElementById(
            "scheduling-editor-prompt"
          );

        if (schedulingPrompt) {
          schedulingPrompt.value =
            questionDetails.prompt;

          populateSchedulingSelections(
            questionDetails.options ??
              []
          );

          return;
        }

        if (question.type === "SINGLE_SELECT" || question.type === "MULTI_SELECT") {
          const type = question.type === "MULTI_SELECT" ? "multi-select" : "single-select";
          document.getElementById(`${type}-editor-prompt`).value = questionDetails.prompt;
          for (const option of questionDetails.options ?? []) addSelectOption(option.label, type);
          return;
        }

        if (question.type === "NOMINATION") {
          document.getElementById("nomination-editor-prompt").value = questionDetails.prompt;
          document.getElementById("nomination-editor-maximum").value = questionDetails.maxNominations;
          return;
        }

        const shortTextPrompt =
          document.getElementById(
            "short-text-editor-prompt"
          );

        if (shortTextPrompt) {
          shortTextPrompt.value =
            questionDetails.prompt;

          return;
        }

        const relationshipPrompt =
          document.getElementById(
            "relationship-editor-prompt"
          );

        if (relationshipPrompt) {
          relationshipPrompt.value =
            questionDetails.prompt;

          populateRelationshipSubjects(
            questionDetails.subjects ??
              []
          );
        }
      }
    );

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "icon-button";

    deleteButton.title =
      "Delete question";

    deleteButton.setAttribute(
      "aria-label",
      "Delete question"
    );

    deleteButton.innerHTML =
      '<i class="fa-solid fa-xmark"></i>';

    deleteButton.addEventListener(
      "click",
      async () => {
        const confirmed =
          confirm(
            `Delete "${question.prompt}"? This cannot be undone.`
          );

        if (!confirmed) {
          return;
        }

        const csrfResponse =
          await fetch("/csrf");

        const csrf =
          await csrfResponse.json();

        const response =
          await fetch(
            `/api/surveys/${surveyId}/questions/${question.id}`,
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
            "Unable to delete question.",
            "error"
          );
          return;
        }

        await loadQuestions();

        showToast(
          "Question deleted.",
          "success"
        );
      }
    );

    actionsCell.appendChild(
      editButton
    );

    actionsCell.appendChild(
      deleteButton
    );

    row.appendChild(promptCell);
    row.appendChild(typeCell);
    row.appendChild(actionsCell);

    list.appendChild(row);
  }
}

function populateRelationshipSubjects(
  subjects
) {
  const subjectList =
    document.getElementById(
      "relationship-editor-subject-list"
    );

  if (!subjectList) {
    return;
  }

  subjectList.replaceChildren();

  const sortedSubjects =
    [...subjects].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { sensitivity: "base" }
        )
    );

  for (const subject of sortedSubjects) {
    const row =
      createRelationshipSubjectRow(
        subject.name,
        subject.description || ""
      );

    subjectList.appendChild(row);
  }

  setupRelationshipSubjectSorting();
}

function setupRelationshipSubjectSorting() {
  const subjectList =
    document.getElementById(
      "relationship-editor-subject-list"
    );

  const table =
    subjectList?.closest(
      ".relationship-editor-table"
    );

  if (!subjectList || !table) {
    return;
  }

  const sortHeaders = [
    ...table.querySelectorAll(
      "[data-sort-key]"
    )
  ];

  for (const header of sortHeaders) {
    header.classList.add(
      "sortable-header"
    );
  }

  let currentSortKey =
    "character";

  let currentSortAscending =
    true;

  const updateSortIndicators = () => {
    for (const header of sortHeaders) {
      header.classList.remove(
        "sort-ascending",
        "sort-descending"
      );

      if (
        header.dataset.sortKey ===
        currentSortKey
      ) {
        header.classList.add(
          currentSortAscending
            ? "sort-ascending"
            : "sort-descending"
        );
      }
    }
  };

  const sortRows = () => {
    const rows = [
      ...subjectList.querySelectorAll(
        ".relationship-subject"
      )
    ];

    rows.sort((a, b) => {
      const aValue =
        currentSortKey === "description"
          ? a.dataset.description || ""
          : a.dataset.name || "";

      const bValue =
        currentSortKey === "description"
          ? b.dataset.description || ""
          : b.dataset.name || "";

      const comparison =
        aValue.localeCompare(
          bValue,
          undefined,
          { sensitivity: "base" }
        );

      return currentSortAscending
        ? comparison
        : -comparison;
    });

    for (const row of rows) {
      subjectList.appendChild(row);
    }
  };

  for (const header of sortHeaders) {
    header.addEventListener(
      "click",
      () => {
        const sortKey =
          header.dataset.sortKey;

        if (
          sortKey === currentSortKey
        ) {
          currentSortAscending =
            !currentSortAscending;
        } else {
          currentSortKey =
            sortKey;

          currentSortAscending =
            true;
        }

        sortRows();
        updateSortIndicators();
      }
    );
  }

  updateSortIndicators();
}

function populateSchedulingSelections(
  options
) {
  const selectionList =
    document.getElementById(
      "scheduling-editor-selection-list"
    );

  const dateInput =
    document.getElementById(
      "scheduling-editor-date"
    );

  if (!selectionList) {
    return;
  }

  const includeTimeCheckbox =
    document.getElementById(
      "scheduling-editor-include-time"
    );

  const timeContainer =
    document.getElementById(
      "scheduling-editor-time-container"
    );

  const timeInput =
    document.getElementById(
      "scheduling-editor-time"
    );

  selectionList.replaceChildren();

  const timedOption =
    options.find(
      option => option.dateTime
    );

  if (timedOption) {
    const localDateTime =
      new Date(
        timedOption.dateTime
      );

    const hours =
      String(
        localDateTime.getHours()
      ).padStart(2, "0");

    const minutes =
      String(
        localDateTime.getMinutes()
      ).padStart(2, "0");

    includeTimeCheckbox.checked =
      true;

    timeContainer.hidden = false;

    timeInput.value =
      `${hours}:${minutes}`;
  } else {
    includeTimeCheckbox.checked =
      false;

    timeContainer.hidden = true;
    timeInput.value = "";
  }

  for (const option of options) {
    const selection =
      document.createElement("div");

    selection.className =
      "scheduling-selection";

    let date;
    let time = "";

    if (option.dateTime) {
      const localDateTime =
        new Date(
          option.dateTime
        );

      const year =
        localDateTime.getFullYear();

      const month =
        String(
          localDateTime.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          localDateTime.getDate()
        ).padStart(2, "0");

      date =
        `${year}-${month}-${day}`;

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

    text.textContent =
      time
        ? `${date} ${time}`
        : date;

    const removeButton =
      document.createElement("button");

    removeButton.type = "button";

    removeButton.className =
      "icon-button";

    removeButton.title =
      "Remove selection";

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

        const remainingDates =
          Array.from(
            selectionList
              .querySelectorAll(
                ".scheduling-selection"
              )
          ).map(
            item =>
              item.dataset.date
          );

        if (dateInput?._flatpickr) {
          dateInput._flatpickr
            .setDate(
              remainingDates,
              false
            );
        }

        if (
          !selectionList
            .children.length
        ) {
          selectionList.textContent =
            "No dates selected.";
        }
      }
    );

    selection.appendChild(text);

    selection.appendChild(
      removeButton
    );

    selectionList.appendChild(
      selection
    );
  }

  if (dateInput?._flatpickr) {
    const selectedDates =
      Array.from(
        selectionList
          .querySelectorAll(
            ".scheduling-selection"
          )
      ).map(
        selection =>
          selection.dataset.date
      );

    dateInput._flatpickr.setDate(
      selectedDates,
      false
    );
  }
}

async function loadParticipants() {
  const container =
    document.getElementById(
      "participants-view"
    );

  const response =
    await fetch(
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
  addButton.className =
    "icon-button";

  addButton.title =
    "Add participant";

  addButton.setAttribute(
    "aria-label",
    "Add participant"
  );

  addButton.innerHTML =
    '<i class="fa-solid fa-plus"></i>';

  heading.appendChild(
    headingText
  );

  heading.appendChild(
    addButton
  );

  container.appendChild(
    heading
  );

  const addControls =
    document.createElement("div");

  addControls.className =
    "participant-add-controls";

  addControls.hidden = true;

  const usersResponse =
    await fetch("/api/users");

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

  for (
    const headingText
    of [
      "Name",
      "Required",
      "Actions"
    ]
  ) {
    const th =
      document.createElement("th");

    th.textContent =
      headingText;

    headerRow.appendChild(th);
  }

  thead.appendChild(
    headerRow
  );

  table.appendChild(
    thead
  );

  const tbody =
    document.createElement("tbody");

  for (
    const participant
    of participants
  ) {
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

    requiredToggle.type =
      "checkbox";

    requiredToggle.checked =
      participant.required;

    requiredToggle.addEventListener(
      "change",
      async () => {
        const csrfResponse =
          await fetch("/csrf");

        const csrf =
          await csrfResponse.json();

        const response =
          await fetch(
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
                  requiredToggle
                    .checked
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

    removeButton.className =
      "icon-button";

    removeButton.title =
      "Remove participant";

    removeButton.setAttribute(
      "aria-label",
      "Remove participant"
    );

    removeButton.innerHTML =
      '<i class="fa-solid fa-xmark"></i>';

    removeButton.addEventListener(
      "click",
      async () => {
        const confirmed =
          confirm(
            `Remove ${
              participant.name ||
              participant.username
            } from this survey?`
          );

        if (!confirmed) {
          return;
        }

        const csrfResponse =
          await fetch("/csrf");

        const csrf =
          await csrfResponse.json();

        const response =
          await fetch(
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
  setupSurveyImageUpload();
  setupQuestionTypePicker();

  await loadQuestions();
  await loadParticipants();
}

function setupSurveyImageUpload() {
  const fileInput =
    document.getElementById(
      "survey-image-file"
    );

  const uploadButton =
    document.getElementById(
      "upload-survey-image-button"
    );

  const preview =
    document.getElementById(
      "survey-image-preview"
    );

  const removeButton =
    document.getElementById(
      "remove-survey-image-button"
    );    

  const image =
    document.getElementById(
      "survey-image"
    );

  if (
    !fileInput ||
    !uploadButton ||
    !removeButton ||
    !preview ||
    !image
  ) {
    return;
  }

  uploadButton.addEventListener(
    "click",
    async () => {
      const file =
        fileInput.files[0];

      if (!file) {
        showToast(
          "Choose an image first.",
          "error"
        );
        return;
      }

      const csrfResponse =
        await fetch("/csrf");

      const csrf =
        await csrfResponse.json();

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const response =
        await fetch(
          `/api/surveys/${surveyId}/image`,
          {
            method: "POST",
            headers: {
              [csrf.headerName]:
                csrf.token
            },
            body: formData
          }
        );

      if (!response.ok) {
        showToast(
          "Unable to upload survey image.",
          "error"
        );
        return;
      }

      image.src =
        `/api/surveys/${surveyId}/image?t=${Date.now()}`;

      preview.hidden = false;
      fileInput.value = "";

      showToast(
        "Survey image uploaded.",
        "success"
      );
    }
  );

  removeButton.addEventListener(
    "click",
    async () => {
      const csrfResponse =
        await fetch("/csrf");
  
      const csrf =
        await csrfResponse.json();
  
      const response =
        await fetch(
          `/api/surveys/${surveyId}/image`,
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
          "Unable to remove survey image.",
          "error"
        );
        return;
      }
  
      image.removeAttribute("src");
      preview.hidden = true;
      fileInput.value = "";
  
      showToast(
        "Survey image removed.",
        "success"
      );
    }
  );
}

initialize();

function setupNominationQuestionSave() {
  const promptInput = document.getElementById("nomination-editor-prompt");
  if (!promptInput) return;
  const maximum = document.getElementById("nomination-editor-maximum");
  const saveButton = document.getElementById("save-question-button");
  saveButton.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    const maxNominations = maximum.value === "" ? 0 : Number(maximum.value);
    if (!prompt || prompt.length > 255 || !Number.isInteger(maxNominations) || maxNominations < 0 || maxNominations > 2147483647) {
      showToast("Enter a question and a whole-number limit of 0 or more.", "error");
      return;
    }
    const wasEditing = editingQuestionId !== null;
    const url = "/api/surveys/" + surveyId + "/questions/" + (wasEditing ? editingQuestionId + "/" : "") + "nomination";
    saveButton.disabled = true;
    try {
      const csrfResponse = await fetch("/csrf");
      if (!csrfResponse.ok) throw new Error("Unable to load CSRF token.");
      const csrf = await csrfResponse.json();
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ prompt, maxNominations, displayOrder: 1, required: document.querySelector(".question-required").checked })
      });
      if (!response.ok) throw new Error("Unable to save nomination question.");
      editingQuestionId = null;
      clearDirty("question");
      const container = document.getElementById("question-form-container");
      container.replaceChildren();
      container.hidden = true;
      await loadQuestions();
      showToast(wasEditing ? "Nomination question updated." : "Nomination question created.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  });
}
