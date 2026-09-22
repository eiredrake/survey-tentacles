const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");
let editingQuestionId = null;

const dirtySources = new Set();

const smartEditors = new WeakMap();

function bindSmartEditor(container, save, button, character = false) {
  smartEditors.get(container)?.destroy();
  const controls = new Map();
  let saving = false;
  const onReadyToSave = (value, { element, reason, relatedTarget }) => {
    if (saving || !element.isConnected || container.hidden) return;
    const focused = relatedTarget || document.activeElement;
    if (reason === "blur" && container.contains(focused) && focused?.closest("button")) return;
    // Name and description are one staged character edit; moving between them must not close the row.
    if (reason === "blur" && character && container.contains(focused)) return;
    saving = true;
    try {
      const result = save();
      if (result?.then) return result.finally(() => { saving = false; });
      saving = false;
      return result;
    } catch (error) { saving = false; throw error; }
  };
  function refresh() {
    if (!container.isConnected) { destroy(); return; }
    for (const [element, control] of controls) {
      if (!container.contains(element)) { control.destroy(); controls.delete(element); }
    }
    for (const target of container.querySelectorAll('input[type="text"], input:not([type]), textarea')) {
      if (!character && target.closest(".relationship-subject, #relationship-subject-editor")) continue;
      if (target.closest("[data-select-option]")) continue;
      if (controls.has(target)) continue;
      const type = target.tagName === "TEXTAREA" ? "multi" : "single";
      controls.set(target, window.SmartInput.create({ target, type, onReadyToSave }));
    }
  }
  const manualSave = () => controls.values().next().value?.triggerSave();
  const observer = new MutationObserver(refresh);
  function destroy() {
    observer.disconnect();
    for (const control of controls.values()) control.destroy();
    controls.clear();
    button?.removeEventListener("click", manualSave);
    smartEditors.delete(container);
  }
  smartEditors.set(container, { destroy, refresh });
  observer.observe(document.body, { childList: true, subtree: true });
  button?.addEventListener("click", manualSave);
  refresh();
}


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

  smartEditors.get(container)?.destroy();
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
  setupPromptQuestionSave("short-text", "Short text");
  setupPromptQuestionSave("meetup", "Meetup Scheduling");
  setupPromptQuestionSave("yes-no-abstain", "Yes/No/Abstain");
  setupNominationQuestionSave();
  setupSelectEditor("single-select", "Single Select");
  setupSelectEditor("multi-select", "Multi Select");
  setupSelectEditor("point-allocation", "Point Allocation", null, () => {
    const input = document.getElementById("point-allocation-editor-budget");
    if (!input.value || !input.checkValidity()) throw new Error("Enter a positive whole-number point budget.");
    return { pointBudget: Number(input.value) };
  });
  const rankedContainer = document.getElementById("ranked-choice-editor-options");
  if (rankedContainer) {
    rankedContainer.ranking = RankedChoice.create(rankedContainer, { editing: true, onChange: () => markDirty("question") });
    setupSelectEditor("ranked-choice", "Ranked Choice", rankedContainer.ranking);
  }
  setupRelationshipEditor();
  setupRelationshipQuestionSave();
}

function addSelectOption(label = "", type = "single-select") {
  const row = document.createElement("div");
  row.className = `${type}-editor-option`;
  row.dataset.selectOption = "";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 255;
  input.value = label;
  input.setAttribute("aria-label", "Option label");
  window.SmartInput.create({
    target: input,
    type: "single",
    onReadyToSave: value => { input.value = value; markDirty("question"); }
  });
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
  smartEditors.get(document.getElementById("question-form-container"))?.refresh();
  return input;
}

function setupSelectEditor(type, displayName, ranking = null, readSettings = () => ({})) {
  const promptInput = document.getElementById(`${type}-editor-prompt`);
  if (!promptInput) return;
  const optionsContainer = document.getElementById(`${type}-editor-options`);
  document.getElementById(`add-${type}-option`).addEventListener("click", () => {
    if (ranking) ranking.add();
    else addSelectOption("", type).focus();
    markDirty("question");
  });
  const saveButton = document.getElementById("save-question-button");
  const saveQuestion = async () => {
    const prompt = promptInput.value.trim();
    const options = ranking ? ranking.getOptions()
      : [...optionsContainer.querySelectorAll("input")].map(input => input.value.trim());
    if (!prompt || !options.length || options.some(option => ranking ? !option.name : !option)) {
      showToast("Enter a question and a label for every option.", "error");
      return;
    }
    const wasEditing = editingQuestionId !== null;
    const url = wasEditing
      ? `/api/surveys/${surveyId}/questions/${editingQuestionId}/${type}`
      : `/api/surveys/${surveyId}/questions/${type}`;
    saveButton.disabled = true;
    try {
      const settings = readSettings();
      const csrf = await getCsrfToken();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ ...settings, prompt, options, displayOrder: 1,
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
  };
  bindSmartEditor(document.getElementById("question-form-container"), saveQuestion, saveButton);
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

  const sortSubjects = setupRelationshipSubjectSorting();
  subjectList.addEventListener("character-updated", sortSubjects);
  let draftRow;

  showEditorButton.addEventListener("click", () => {
    if (!subjectEditor.hidden) { nameInput.focus(); return; }
    nameInput.value = descriptionInput.value = "";
    draftRow = createRelationshipSubjectRow("New character");
    const upload = draftRow.querySelector(".character-upload-button");
    document.getElementById("relationship-draft-upload").replaceChildren(...(upload ? [upload] : []));
    subjectEditor.hidden = false;
    nameInput.focus();
  });

  document.getElementById("cancel-relationship-subject-button").addEventListener("click", () => {
    draftRow = null;
    nameInput.value = descriptionInput.value = "";
    document.getElementById("relationship-draft-upload").replaceChildren();
    subjectEditor.hidden = true;
  });

  const saveCharacter = () => {
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

    if (draftRow?.pendingPortrait) {
      row.pendingPortrait = draftRow.pendingPortrait;
      row.portraitPreview = draftRow.portraitPreview;
      row.cells[0].prepend(QuestionImages.thumbnail(row.portraitPreview, name));
    }
    draftRow = null;
    subjectList.appendChild(row);
    sortSubjects();
    markDirty("question");

    nameInput.value = "";
    descriptionInput.value = "";

    subjectEditor.hidden = true;
  };
  bindSmartEditor(subjectEditor, saveCharacter, addButton, true);
}

function createRelationshipSubjectRow(
  name,
  description = "",
  subjectId = null
) {
  const row =
    document.createElement("tr");

  row.className =
    "relationship-subject";

  if (subjectId != null) row.dataset.subjectId = subjectId;
  row.dataset.name = name;
  row.dataset.description =
    description;

  const nameCell =
    document.createElement("td");

  nameCell.className = "relationship-character-cell";
  const characterName = document.createElement("span");
  characterName.textContent = name;
  nameCell.appendChild(characterName);

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

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "icon-button character-edit-button";
  editButton.title = "Edit character";
  editButton.setAttribute("aria-label", "Edit " + name);
  editButton.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
  editButton.addEventListener("click", () => {
    const nameInput = document.createElement("input");
    nameInput.value = name;
    nameInput.maxLength = 255;
    nameInput.setAttribute("aria-label", "Character name");
    const descriptionInput = document.createElement("input");
    descriptionInput.value = description;
    descriptionInput.maxLength = 255;
    descriptionInput.setAttribute("aria-label", "Character description");
    characterName.replaceWith(nameInput);
    descriptionCell.replaceChildren(descriptionInput);
    const buttons = [...actionsCell.children];
    buttons.forEach(button => { button.hidden = true; });
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "icon-button";
    cancel.title = "Cancel character edits"; cancel.setAttribute("aria-label", cancel.title);
    cancel.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    const save = document.createElement("button");
    save.type = "button"; save.className = "icon-button";
    save.title = "Save character edits"; save.setAttribute("aria-label", save.title);
    save.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>';
    const finish = () => {
      nameInput.replaceWith(characterName);
      descriptionCell.textContent = description;
      cancel.remove(); save.remove();
      buttons.forEach(button => { button.hidden = false; });
      editButton.focus();
    };
    cancel.addEventListener("click", finish);
    const saveCharacter = () => {
      if (!nameInput.value.trim()) { showToast("Enter a character name.", "error"); nameInput.focus(); return; }
      name = nameInput.value.trim(); description = descriptionInput.value.trim();
      row.dataset.name = name; row.dataset.description = description;
      characterName.textContent = name;
      editButton.setAttribute("aria-label", "Edit " + name);
      removeButton.setAttribute("aria-label", "Remove " + name);
      const portrait = actionsCell.querySelector(".character-upload-button");
      if (portrait) { portrait.title = "Edit portrait for " + name; portrait.setAttribute("aria-label", portrait.title); }
      const image = nameCell.querySelector("img");
      if (image) image.alt = name;
      finish();
      markDirty("question");
      row.dispatchEvent(new CustomEvent("character-updated", { bubbles: true }));
    };
    bindSmartEditor(row, saveCharacter, save, true);
    actionsCell.append(cancel, save);
    nameInput.focus();
  });
  actionsCell.appendChild(editButton);
  if (window.QuestionImages) {
    const portrait = document.createElement("button");
    portrait.type = "button";
    portrait.className = "icon-button character-upload-button";
    portrait.title = "Edit portrait for " + name;
    portrait.setAttribute("aria-label", portrait.title);
    portrait.innerHTML = '<i class="fa-solid fa-upload" aria-hidden="true"></i>';
    portrait.addEventListener("click", () => {
      const id = row.dataset.subjectId ? Number(row.dataset.subjectId) : null;
      const draft = id == null || row.pendingPortrait ? {
        image: row.portraitPreview,
        save: async file => {
          const url = file ? await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Unable to read image."));
            reader.readAsDataURL(file);
          }) : null;
          row.pendingPortrait = file;
          row.portraitPreview = file ? { ownerType: "RELATIONSHIP_SUBJECT", ownerId: id, url } : null;
          markDirty("question");
          portrait.title = file ? "Portrait selected for " + name : "Edit portrait for " + name;
          nameCell.querySelector(".image-thumbnail")?.remove();
          if (row.portraitPreview) nameCell.prepend(QuestionImages.thumbnail(row.portraitPreview, name));
          return row.portraitPreview;
        }
      } : undefined;
      QuestionImages.editSubject(editingQuestionId, { id, name }, portrait, draft, () => {
        if (!draft) QuestionImages.renderPortrait(editingQuestionId, { id, name }, nameCell);
      });
    });
    actionsCell.appendChild(portrait);
  }

  if (subjectId != null && window.QuestionImages) QuestionImages.renderPortrait(editingQuestionId, { id: subjectId, name }, nameCell);
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
      smartEditors.get(container)?.destroy();
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

  const tagline = document.getElementById("survey-tagline");
  if (tagline) {
    tagline.value = survey.tagline ?? "";
  }

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

  button.addEventListener(
    "click",
    () => {
      const heading = document.getElementById("survey-title");
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

      const saveTitle = async () => {

          const newTitle =
            input.value.trim();

          if (!newTitle) {
            return;
          }

          const csrf = await getCsrfToken();

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
      };
      window.SmartInput.create({ target: input, type: "single", onReadyToSave: saveTitle });
    }
  );
}

async function saveTagline() {
  const input = document.getElementById("survey-tagline");
  const status = document.getElementById("survey-tagline-status");

  try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/surveys/${surveyId}/tagline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [csrf.headerName]: csrf.token
        },
        body: JSON.stringify({ tagline: input.value })
    });

    if (!response.ok) {
      throw new Error("Failed to save survey tagline.");
    }

    const survey = await response.json();
    input.value = survey.tagline ?? "";
    status.textContent = "Saved";
  } catch (error) {
    console.error(error);
    status.textContent = "Save failed";
  }
}

function setupTaglineEditor() {
  const saveButton = document.getElementById("save-survey-tagline");

  if (!saveButton) {
    return;
  }

  const target = document.getElementById("survey-tagline");
  window.SmartInput.create({ target, type: "single", onReadyToSave: saveTagline });
  saveButton.remove();
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

  const saveQuestion = async () => {
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

      const csrf = await getCsrfToken();

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
  };
  bindSmartEditor(document.getElementById("question-form-container"), saveQuestion, saveButton);
}

function setupPromptQuestionSave(type, displayName) {
  const saveButton = document.getElementById("save-question-button");
  const promptInput = document.getElementById(`${type}-editor-prompt`);
  if (!saveButton || !promptInput) return;
  const saveQuestion = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { showToast("Enter a question.", "error"); return; }
    if (saveButton.disabled) return;
    const wasEditing = editingQuestionId !== null;
    const url = wasEditing ? `/api/surveys/${surveyId}/questions/${editingQuestionId}/${type}`
      : `/api/surveys/${surveyId}/questions/${type}`;
    saveButton.disabled = true;
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ prompt, displayOrder: 1, required: document.querySelector(".question-required")?.checked ?? false })
      });
      if (!response.ok) throw new Error(`Unable to save ${displayName} question.`);
      editingQuestionId = null;
      clearDirty("question");
      const container = document.getElementById("question-form-container");
      container.replaceChildren();
      container.hidden = true;
      await loadQuestions();
      showToast(`${displayName} question ${wasEditing ? "updated" : "created"}.`, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  };
  bindSmartEditor(document.getElementById("question-form-container"), saveQuestion, saveButton);
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

  const saveQuestion = async () => {
      const prompt =
        promptInput.value.trim();

      if (!prompt) {
        showToast(
          "Enter a question.",
          "error"
        );
        return;
      }

      if (saveButton.disabled) return;
      const rows = [...subjectList.querySelectorAll(".relationship-subject")];
      const subjects =
        Array.from(
          subjectList.querySelectorAll(
            ".relationship-subject"
          )
        ).map(
          (subject, index) => ({
            id: subject.dataset.subjectId ? Number(subject.dataset.subjectId) : null,
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

      saveButton.disabled = true;
      try {
        const wasEditing = editingQuestionId !== null;
        const csrf = await getCsrfToken();

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

        const saved = await response.json();
        editingQuestionId = saved.id;
        for (const [index, row] of rows.entries()) {
          const subject = saved.subjects.find(subject => subject.displayOrder === index);
          if (!subject) throw new Error("Unable to match saved characters. Keep this editor open and retry.");
          row.dataset.subjectId = subject.id;
        }
        for (const row of rows) {
          if (!row.pendingPortrait) continue;
          await QuestionImages.saveSubject(saved.id, Number(row.dataset.subjectId), row.pendingPortrait);
          delete row.pendingPortrait;
          delete row.portraitPreview;
        }
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
      } catch (error) {
        showToast(error.message || "Unable to save relationship question. Please retry.", "error");
      } finally { saveButton.disabled = false; }
  };
  bindSmartEditor(document.getElementById("question-form-container"), saveQuestion, saveButton);
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
  const includeTimeCheckbox = document.getElementById("scheduling-editor-include-time");
  const timeContainer = document.getElementById("scheduling-editor-time-container");
  const timeInput = document.getElementById("scheduling-editor-time");
  const dateInput = document.getElementById("scheduling-editor-date");
  const selectionList = document.getElementById("scheduling-editor-selection-list");
  if (!includeTimeCheckbox || !timeContainer || !timeInput || !dateInput || !selectionList) return;

  function selectedTime() {
    const date = timeInput._fdatepicker?.selectedDate;
    return date ? FDatepicker.formatDate(date, "H:i") : "";
  }

  function renderSelections(selectedDates) {
    selectionList.replaceChildren();
    if (!selectedDates.length) { selectionList.textContent = "No dates selected."; return; }
    for (const selectedDate of selectedDates) {
      const selection = document.createElement("div");
      selection.className = "scheduling-selection";
      selection.dataset.date = FDatepicker.formatDate(selectedDate, "Y-m-d");
      selection.dataset.time = includeTimeCheckbox.checked ? selectedTime() : "";
      const text = document.createElement("span");
      text.textContent = selection.dataset.time ? `${selection.dataset.date} ${selection.dataset.time}` : selection.dataset.date;
      selection.appendChild(text);
      selectionList.appendChild(selection);
    }
  }

  const datePicker = new FDatepicker(dateInput, {
    multiple: true, format: "Y-m-d", autoClose: false,
    onSelect: (_, dates) => { renderSelections(dates); markDirty("question"); }
  });
  new FDatepicker(timeInput, {
    timeOnly: true, timepicker: true, ampm: true, format: "h:i a", minutesStep: 1,
    onSelect: () => { renderSelections(datePicker.selectedDates); markDirty("question"); }
  });
  includeTimeCheckbox.addEventListener("change", () => {
    timeContainer.hidden = !includeTimeCheckbox.checked;
    renderSelections(datePicker.selectedDates);
    markDirty("question");
  });
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

        if (question.type === "POINT_ALLOCATION") {
          document.getElementById("point-allocation-editor-prompt").value = questionDetails.prompt;
          document.getElementById("point-allocation-editor-budget").value = questionDetails.pointBudget;
          for (const option of questionDetails.options) addSelectOption(option.label, "point-allocation");
          return;
        }
        if (question.type === "YES_NO_ABSTAIN") {
          document.getElementById("yes-no-abstain-editor-prompt").value = questionDetails.prompt;
          return;
        }
        if (question.type === "MEETUP") {
          document.getElementById("meetup-editor-prompt").value = questionDetails.prompt;
          return;
        }
        if (question.type === "RANKED_CHOICE") {
          document.getElementById("ranked-choice-editor-prompt").value = questionDetails.prompt;
          document.getElementById("ranked-choice-editor-options").ranking.setOptions(questionDetails.options);
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

        const csrf = await getCsrfToken();

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

    await window.QuestionImages?.renderQuestion(question, promptCell);
    row.appendChild(promptCell);
    row.appendChild(typeCell);
    row.appendChild(actionsCell);

    if (window.QuestionImages) {
      const imagesButton = document.createElement("button");
      imagesButton.type = "button";
      imagesButton.className = "icon-button";
      imagesButton.title = "Edit images";
      imagesButton.setAttribute("aria-label", "Edit images for " + question.prompt);
      imagesButton.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i>';
      imagesButton.addEventListener("click", () => QuestionImages.edit(question, row));
      actionsCell.appendChild(imagesButton);
    }
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
        subject.description || "",
        subject.id
      );

    subjectList.appendChild(row);
  }
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
  return sortRows;
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

        if (dateInput?._fdatepicker) {
          dateInput._fdatepicker
            .setDate(
              remainingDates.map(date => new Date(`${date}T00:00`)),
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

  if (dateInput?._fdatepicker) {
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

    dateInput._fdatepicker.setDate(
      selectedDates.map(date => new Date(`${date}T00:00`)),
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
    '<i class="fa-solid fa-plus" aria-hidden="true"></i>';



  heading.appendChild(
    addButton
  );

  container.appendChild(
    heading
  );

  heading.dataset.tableActions = "true";
  setupParticipantPicker(container, addButton, participants);

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
        const csrf = await getCsrfToken();

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

        const csrf = await getCsrfToken();

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
  setupTaglineEditor();
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

      const csrf = await getCsrfToken();

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
      const csrf = await getCsrfToken();

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
  const saveQuestion = async () => {
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
      const csrf = await getCsrfToken();
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
  };
  bindSmartEditor(document.getElementById("question-form-container"), saveQuestion, saveButton);
}
