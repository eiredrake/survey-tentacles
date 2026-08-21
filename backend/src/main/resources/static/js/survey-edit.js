const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

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

async function initialize() {
  await loadSurvey();
  setupSchedulingQuestionForm();
}

initialize();