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

function setupSchedulingQuestionForm() {
  const form = document.getElementById("scheduling-question-form");
  const promptInput = document.getElementById("scheduling-question-prompt");
  const dateInput = document.getElementById("scheduling-question-date");

  form.addEventListener("submit", async event => {
      event.preventDefault();

      const prompt = promptInput.value.trim();

      if (!prompt) {
          return;
      }

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
                  dates: [dateInput.value]
              })
          }
      );

      if (!response.ok) {
          showToast("Unable to create scheduling question.", "error");
          return;
      }

      showToast("Scheduling question created.", "success");
      promptInput.value = "";
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

async function initialize() {
  await loadSurvey();
  await loadQuestionTypes();
  setupTitleEditor();
  setupQuestionTypePicker();
}

initialize();