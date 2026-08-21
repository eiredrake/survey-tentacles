let currentUser = null;
let surveyStatuses = [];

async function loadSurveyStatuses() {
    const response = await fetch("/api/surveys/statuses");

    if (!response.ok) {
        surveyStatuses = [];
        return;
    }

    surveyStatuses = await response.json();
}        

async function loadUser() {
    const response = await fetch("/me");

    if (!response.ok) {
        document.getElementById("user").textContent =
            "Unable to load user.";
        return;
    }

    const user = await response.json();

    currentUser = user;

    document.getElementById("user").textContent =
        `Logged in as ${user.name}`;
}

async function loadSurveys() {
    const response = await fetch("/api/surveys");

    if (!response.ok) {
        document.getElementById("surveys").textContent =
            "Unable to load surveys.";
        return;
    }

    const surveys = await response.json();
    const container = document.getElementById("surveys");

    container.innerHTML = "";

    for (const survey of surveys) {
      const item = document.createElement("div");

      const link = document.createElement("a");
      link.href = `/survey.html?id=${survey.id}`;
      link.textContent =
          `${survey.title} — ${survey.questionCount} question(s)`;

      item.appendChild(link);
      if (currentUser.authorities?.includes("ROLE_ADMIN")) {
            const statusSelect = document.createElement("select");

            for (const status of surveyStatuses) {
                const option = document.createElement("option");
                option.value = status;
                option.textContent =
                    status.charAt(0) + status.slice(1).toLowerCase();

                if (status === survey.status) {
                    option.selected = true;
                }

                statusSelect.appendChild(option);
            }

            statusSelect.addEventListener("change", async () => {
                const previousStatus = survey.status;

                const csrfResponse = await fetch("/csrf");
                const csrf = await csrfResponse.json();

                const response = await fetch(`/api/surveys/${survey.id}/status`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        [csrf.headerName]: csrf.token
                    },
                    body: JSON.stringify({
                        status: statusSelect.value
                    })
                });

                if (response.ok) {
                    survey.status = statusSelect.value;
                } else {
                    statusSelect.value = previousStatus;
                    alert("Unable to update survey status.");
                }
            });                    

            item.append(" ");
            item.appendChild(statusSelect);
        }

      container.appendChild(item);
    }
}

function setupCreateSurveyForm() {
  const form = document.getElementById("create-survey-form");
  const titleInput = document.getElementById("create-survey-title");

  form.addEventListener("submit", async event => {
      event.preventDefault();

      const title = titleInput.value.trim();

      if (!title) {
          return;
      }

      const csrfResponse = await fetch("/csrf");
      const csrf = await csrfResponse.json();

      const response = await fetch("/api/surveys", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              [csrf.headerName]: csrf.token
          },
          body: JSON.stringify({
              title: title
          })
      });

      if (!response.ok) {
          alert("Unable to create survey.");
          return;
      }

      const survey = await response.json();

      window.location.href = `/survey.html?id=${survey.id}`;
  });
}


async function initialize() {
  await loadUser();
  await loadSurveyStatuses();
  await loadSurveys();
  setupCreateSurveyForm();
}

initialize();