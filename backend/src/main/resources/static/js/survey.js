const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

let surveyStatus = null;
let currentUser = null;

async function loadCurrentUser() {
    const response = await fetch("/me");

    if (!response.ok) {
        return;
    }

    currentUser = await response.json();
}     

async function loadAssignmentAdmin() {
    if (!currentUser?.authorities?.includes("ROLE_ADMIN")) {
        return;
    }

    const main = document.querySelector("main");

    const section = document.createElement("section");
    section.id = "assignment-admin";

    const heading = document.createElement("h2");
    heading.textContent = "Survey Assignments";
    section.appendChild(heading);

    const usersResponse = await fetch("/api/users");
    const users = await usersResponse.json();

    const userSelect = document.createElement("select");

    for (const user of users) {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.name;
        userSelect.appendChild(option);
    }

    const requiredCheckbox = document.createElement("input");
    requiredCheckbox.type = "checkbox";
    requiredCheckbox.checked = true;

    const requiredLabel = document.createElement("label");
    requiredLabel.appendChild(requiredCheckbox);
    requiredLabel.append(" Required");

    const addButton = document.createElement("button");
    addButton.textContent = "Add User";

    addButton.addEventListener("click", async () => {
        const csrfResponse = await fetch("/csrf");
        const csrf = await csrfResponse.json();

        const response = await fetch(
            `/api/surveys/${surveyId}/assignments`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [csrf.headerName]: csrf.token
                },
                body: JSON.stringify({
                    username: userSelect.value,
                    required: requiredCheckbox.checked
                })
            }
        );

        if (!response.ok) {
            alert("Unable to add assignment.");
            return;
        }

        location.reload();
    });            

    section.appendChild(userSelect);
    section.appendChild(requiredLabel);
    section.appendChild(addButton);            

    const response = await fetch(
        `/api/surveys/${surveyId}/assignments`
    );

    if (!response.ok) {
        section.append("Unable to load assignments.");
        main.appendChild(section);
        return;
    }

    const assignments = await response.json();

    const list = document.createElement("ul");

    for (const assignment of assignments) {
        const item = document.createElement("li");

        item.append(`${assignment.name} — `);

        const requiredToggle = document.createElement("input");
        requiredToggle.type = "checkbox";
        requiredToggle.checked = assignment.required;

        const requiredToggleLabel = document.createElement("label");
        requiredToggleLabel.appendChild(requiredToggle);
        requiredToggleLabel.append(" Required");
        item.appendChild(requiredToggleLabel);

        requiredToggle.addEventListener("change", async () => {
            const csrfResponse = await fetch("/csrf");
            const csrf = await csrfResponse.json();

            const response = await fetch(
                `/api/surveys/${surveyId}/assignments/${assignment.userId}/required`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        [csrf.headerName]: csrf.token
                    },
                    body: JSON.stringify({
                        required: requiredToggle.checked
                    })
                }
            );

            if (!response.ok) {
                requiredToggle.checked = !requiredToggle.checked;
                showToast("Unable to update assignment.", "error");
                return;
            }

            showToast("Assignment updated.", "success");
        });

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", async () => {
            const csrfResponse = await fetch("/csrf");
            const csrf = await csrfResponse.json();

            const response = await fetch(
                `/api/surveys/${surveyId}/assignments/${assignment.userId}`,
                {
                    method: "DELETE",
                    headers: {
                        [csrf.headerName]: csrf.token
                    }
                }
            );

            if (!response.ok) {
                alert("Unable to remove assignment.");
                return;
            }

            location.reload();
        });

        item.appendChild(removeButton);
        list.appendChild(item);
    }

    section.appendChild(list);
    main.appendChild(section);
}        

async function loadSurveyStatus() {
    const response = await fetch("/api/surveys");

    if (!response.ok) {
        return;
    }

    const surveys = await response.json();
    const survey = surveys.find(
        survey => String(survey.id) === String(surveyId)
    );

    if (survey) {
      surveyStatus = survey.status;
      document.getElementById("survey-title").textContent = survey.title;
    }
}        

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}        

async function refreshSchedulingStatus(question, section) {
    let statusContainer = section.querySelector(".scheduling-status");

    if (!statusContainer) {
        statusContainer = document.createElement("div");
        statusContainer.className = "scheduling-status";
        section.appendChild(statusContainer);
    }

    statusContainer.innerHTML = "";

    const resultsHeading = document.createElement("h3");
    resultsHeading.textContent = "Results";
    statusContainer.appendChild(resultsHeading);

    const resultsResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/results`
    );

    const results = await resultsResponse.json();

    const resultsList = document.createElement("ol");

    for (const result of results) {
        const item = document.createElement("li");

        item.textContent =
            `${formatDate(result.date)} — ${result.votes} vote${result.votes === 1 ? "" : "s"}`;


        resultsList.appendChild(item);
    }

    statusContainer.appendChild(resultsList);

    const participationHeading = document.createElement("h3");
    participationHeading.textContent = "Participation";
    statusContainer.appendChild(participationHeading);

    const participationResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/participation`
    );

    const participation = await participationResponse.json();

    const participationList = document.createElement("ul");

    for (const participant of participation) {
        const item = document.createElement("li");

        item.textContent =
            `${participant.name} — ${participant.answered ? "Answered" : "Not answered"}`;

            if (participant.required && !participant.answered) {
                item.style.color = "red";
            }

        participationList.appendChild(item);
    }

    statusContainer.appendChild(participationList);
}


async function loadQuestions() {
    const container = document.getElementById("questions");

    if (!surveyId) {
        container.textContent = "No survey ID supplied.";
        return;
    }

    const response = await fetch(`/api/surveys/${surveyId}/questions`);

    if (!response.ok) {
        container.textContent = "Unable to load questions.";
        return;
    }

    const questions = await response.json();

    container.innerHTML = "";

    for (const question of questions) {
        const section = document.createElement("section");

        const heading = document.createElement("h2");
        heading.textContent = question.prompt;

        section.appendChild(heading);

        if (question.type === "scheduling") {
            const response = await fetch(
                `/api/surveys/${surveyId}/questions/${question.id}`
            );

            const detail = await response.json();
            const meResponse = await fetch("/me");
            const me = await meResponse.json();

            const answersResponse = await fetch(
                `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling`
            );

            const answers = await answersResponse.json();

            const mySelectedOptionIds = new Set(
                answers
                    .filter(answer => answer.userId === me.id)
                    .map(answer => answer.optionId)
            );                    

            for (const option of detail.options) {
              const label = document.createElement("label");

              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.value = option.id;
              checkbox.checked = mySelectedOptionIds.has(option.id);

              checkbox.disabled = surveyStatus !== "OPEN";

              label.appendChild(checkbox);
              label.append(` ${formatDate(option.date)}`);

              section.appendChild(label);
              section.appendChild(document.createElement("br"));
            }

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Submit";

            button.disabled = surveyStatus !== "OPEN";

            button.addEventListener("click", async () => {
              const selected = [
                  ...section.querySelectorAll('input[type="checkbox"]:checked')
              ].map(checkbox => Number(checkbox.value));

              const csrfResponse = await fetch("/csrf");
              const csrf = await csrfResponse.json();

              const response = await fetch(
                  `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling`,
                  {
                      method: "POST",
                      headers: {
                          "Content-Type": "application/json",
                          [csrf.headerName]: csrf.token
                      },
                      body: JSON.stringify({
                          optionIds: selected
                      })
                  }
              );

                if (response.ok) {
                    showToast("Response saved.", "success");
                    await refreshSchedulingStatus(question, section);
                } else {
                    showToast("Unable to save response.", "error");
                }
            });

            section.appendChild(button);
            
            await refreshSchedulingStatus(question, section);
        }

        container.appendChild(section);
    }
}

async function initialize() {
    await loadCurrentUser();
    await loadSurveyStatus();
    await loadQuestions();
    await loadAssignmentAdmin();
}

initialize();