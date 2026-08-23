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

  const userElement =
      document.getElementById("user");

  if (userElement) {
      userElement.textContent =
          currentUser.name;
  }
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

function formatSchedulingDate(date, dateTime) {
  if (dateTime) {
      return new Date(dateTime).toLocaleString(
          undefined,
          {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit"
          }
      );
  }

  return formatDate(date);
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

    const maxVotes = Math.max(
      0,
      ...results.map(result => result.votes)
  );
  
  const resultsList = document.createElement("div");
  resultsList.className = "scheduling-results";
  
  for (const result of results) {
      const item = document.createElement("div");
      item.className = "scheduling-result";
  
      if (maxVotes > 0 && result.votes === maxVotes) {
          item.classList.add("scheduling-result-leading");
      }
  
      const header = document.createElement("div");
      header.className = "scheduling-result-header";
  
      const date = document.createElement("span");
      date.textContent =
          formatSchedulingDate(
              result.date,
              result.dateTime
          );
  
      const votes = document.createElement("span");
      votes.textContent =
          `${result.votes} vote${result.votes === 1 ? "" : "s"}`;
  
      header.appendChild(date);
      header.appendChild(votes);
  
      const barTrack = document.createElement("div");
      barTrack.className = "scheduling-result-track";
  
      const bar = document.createElement("div");
      bar.className = "scheduling-result-bar";
  
      const percentage =
          maxVotes > 0
              ? (result.votes / maxVotes) * 100
              : 0;
  
      bar.style.width = `${percentage}%`;
  
      barTrack.appendChild(bar);
  
      item.appendChild(header);
      item.appendChild(barTrack);
  
      resultsList.appendChild(item);
  }
  
    statusContainer.appendChild(resultsList);

    if (currentUser?.authorities?.includes("ROLE_ADMIN")) {
      const participationResponse = await fetch(
          `/api/surveys/${surveyId}/questions/${question.id}/participation`
      );
  
      if (!participationResponse.ok) {
          showToast("Unable to load participants.", "error");
          return;
      }
  
      const participation = await participationResponse.json();
  
      const assignmentsResponse = await fetch(
          `/api/surveys/${surveyId}/assignments`
      );
  
      if (!assignmentsResponse.ok) {
          showToast("Unable to load assignments.", "error");
          return;
      }
  
      const assignments = await assignmentsResponse.json();
  
      const participantsSection = document.createElement("div");
      participantsSection.className = "participants-section";
  
      const heading = document.createElement("div");
      heading.className = "section-heading";
  
      const headingText = document.createElement("h3");
      headingText.textContent = "Participants";
  
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "icon-button";
      addButton.title = "Add participant";
      addButton.setAttribute("aria-label", "Add participant");
  
      const addIcon = document.createElement("i");
      addIcon.className = "fa-solid fa-plus";
  
      addButton.appendChild(addIcon);
  
      heading.appendChild(headingText);
      heading.appendChild(addButton);
  
      participantsSection.appendChild(heading);
  
      const addControls = document.createElement("div");
      addControls.className = "participant-add-controls";
      addControls.hidden = true;
  
      const usersResponse = await fetch("/api/users");
  
      if (!usersResponse.ok) {
          showToast("Unable to load users.", "error");
          return;
      }
  
      const users = await usersResponse.json();
  
      const assignedUserIds = new Set(
          assignments.map(assignment => assignment.userId)
      );
  
      const userSelect = document.createElement("select");
  
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select user...";
      userSelect.appendChild(placeholder);
  
      for (const user of users) {
          if (assignedUserIds.has(user.userId)) {
              continue;
          }
  
          const option = document.createElement("option");
          option.value = user.username;
          option.textContent = user.name || user.username;
  
          userSelect.appendChild(option);
      }
  
      addControls.appendChild(userSelect);
      participantsSection.appendChild(addControls);
  
      addButton.addEventListener("click", event => {
        event.stopPropagation();
    
        addControls.hidden = false;
        userSelect.focus();
    });
    
    addControls.addEventListener("click", event => {
        event.stopPropagation();
    });
    
    document.addEventListener("click", () => {
        addControls.hidden = true;
    });

    userSelect.addEventListener("change", async () => {
      if (!userSelect.value) {
          return;
      }
  
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
                  required: true
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
  
      addControls.hidden = true;
  
      await refreshSchedulingStatus(
          question,
          section
      );
  
      showToast(
          "Participant added.",
          "success"
      );
  });    
  

    const participationByUserId = new Map(
      participation.map(participant => [
          participant.userId,
          participant
      ])
  );
  
  const table = document.createElement("table");
  table.className = "survey-table participants-table";
  
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  for (const headingText of [
      "Name",
      "Required",
      "Status",
      "Actions"
  ]) {
      const th = document.createElement("th");
      th.textContent = headingText;
      headerRow.appendChild(th);
  }
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement("tbody");
  
  for (const assignment of assignments) {
      const participant =
          participationByUserId.get(assignment.userId);
  
      const row = document.createElement("tr");
  
      const nameCell = document.createElement("td");
      nameCell.textContent =
          assignment.name || assignment.username;
  
      const requiredCell = document.createElement("td");
  
      const requiredToggle = document.createElement("input");
      requiredToggle.type = "checkbox";
      requiredToggle.checked = assignment.required;

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
    });      
  
      requiredCell.appendChild(requiredToggle);
  
      const statusCell = document.createElement("td");
  
      statusCell.textContent =
          participant?.answered
              ? "Answered"
              : "Not answered";
  
      const actionsCell = document.createElement("td");
      actionsCell.className = "actions-column";
  
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button";
      removeButton.title = "Remove participant";
      removeButton.setAttribute(
          "aria-label",
          "Remove participant"
      );

      removeButton.addEventListener("click", async () => {
        const confirmed = confirm(
            `Remove ${assignment.name || assignment.username} from this survey?`
        );
    
        if (!confirmed) {
            return;
        }
    
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
            showToast(
                "Unable to remove participant.",
                "error"
            );
            return;
        }
    
        await refreshSchedulingStatus(
            question,
            section
        );
    
        showToast(
            "Participant removed.",
            "success"
        );
    });      
  
      const removeIcon = document.createElement("i");
      removeIcon.className = "fa-solid fa-xmark";
  
      removeButton.appendChild(removeIcon);
      actionsCell.appendChild(removeButton);
  
      row.appendChild(nameCell);
      row.appendChild(requiredCell);
      row.appendChild(statusCell);
      row.appendChild(actionsCell);
  
      tbody.appendChild(row);
  }
  
  table.appendChild(tbody);
  participantsSection.appendChild(table);

      statusContainer.appendChild(participantsSection);
  }
}


async function loadQuestions() {
  const container = document.getElementById("questions");

  if (!surveyId) {
      container.textContent = "No survey ID supplied.";
      return;
  }

  const response = await fetch(
      `/api/surveys/${surveyId}/questions`
  );

  if (!response.ok) {
      container.textContent = "Unable to load questions.";
      return;
  }

  const questions = await response.json();

  container.replaceChildren();

  for (const question of questions) {
      const template =
          document.getElementById(
              question.participantTemplateId
          );

      if (!template) {
          showToast(
              `Participant template not found for question ${question.id}.`,
              "error"
          );
          continue;
      }

      const fragment =
          template.content.cloneNode(true);

      const section =
          fragment.querySelector(".survey-question");

      const heading =
          section.querySelector(".question-prompt");

      heading.textContent = question.prompt;

      /*
       * The scheduling template contains these controls.
       * This lets the HTML template determine which behavior
       * is appropriate instead of comparing against a
       * hard-coded Java enum value.
       */
      const optionsContainer = section.querySelector(".scheduling-options");

      const submitButton = section.querySelector(".submit-answer-button");

      const selectAllButton = section.querySelector(".select-all-button");
      
      const clearAllButton = section.querySelector(".select-none-button");          

      if (optionsContainer && submitButton) {
          selectAllButton?.addEventListener("click", () => {
            optionsContainer
                .querySelectorAll('input[type="checkbox"]:not(:disabled)')
                .forEach(checkbox => {
                    checkbox.checked = true;
                });
        });
        
        clearAllButton?.addEventListener("click", () => {
            optionsContainer
                .querySelectorAll('input[type="checkbox"]:not(:disabled)')
                .forEach(checkbox => {
                    checkbox.checked = false;
                });
        });




          const detailResponse = await fetch(
              `/api/surveys/${surveyId}/questions/${question.id}`
          );

          if (!detailResponse.ok) {
              showToast(
                  "Unable to load question details.",
                  "error"
              );
              continue;
          }

          const detail =
              await detailResponse.json();

          const answersResponse = await fetch(
              `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling`
          );

          if (!answersResponse.ok) {
              showToast(
                  "Unable to load existing answers.",
                  "error"
              );
              continue;
          }

          const answers =
              await answersResponse.json();

          const mySelectedOptionIds =
              new Set(
                  answers
                      .filter(
                          answer =>
                              answer.userId === currentUser.id
                      )
                      .map(
                          answer => answer.optionId
                      )
              );

          for (const option of detail.options) {
              const label =
                  document.createElement("label");

              const checkbox =
                  document.createElement("input");

              checkbox.type = "checkbox";
              checkbox.value = option.id;

              checkbox.checked =
                  mySelectedOptionIds.has(option.id);

              checkbox.disabled =
                  surveyStatus !== "OPEN";

              const text =
                  document.createElement("span");

              if (option.dateTime) {
                  const localDateTime =
                      new Date(option.dateTime);

                  text.textContent =
                      localDateTime.toLocaleString(
                          undefined,
                          {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit"
                          }
                      );
              } else {
                  text.textContent =
                      formatDate(option.date);
              }

              label.appendChild(checkbox);
              label.append(" ");
              label.appendChild(text);

              optionsContainer.appendChild(label);
              optionsContainer.appendChild(
                  document.createElement("br")
              );
          }

          submitButton.disabled = surveyStatus !== "OPEN";
          if (selectAllButton) {
              selectAllButton.disabled =
                  surveyStatus !== "OPEN";
          }
          
          if (clearAllButton) {
              clearAllButton.disabled =
                  surveyStatus !== "OPEN";
          }


          submitButton.addEventListener(
              "click",
              async () => {
                  const selected = [
                      ...optionsContainer.querySelectorAll(
                          'input[type="checkbox"]:checked'
                      )
                  ].map(
                      checkbox =>
                          Number(checkbox.value)
                  );

                  const csrfResponse =
                      await fetch("/csrf");

                  const csrf =
                      await csrfResponse.json();

                  const saveResponse = await fetch(
                      `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling`,
                      {
                          method: "POST",
                          headers: {
                              "Content-Type":
                                  "application/json",
                              [csrf.headerName]:
                                  csrf.token
                          },
                          body: JSON.stringify({
                              optionIds: selected
                          })
                      }
                  );

                  if (saveResponse.ok) {
                      showToast(
                          "Response saved.",
                          "success"
                      );

                      await refreshSchedulingStatus(
                          question,
                          section
                      );
                  } else {
                      showToast(
                          "Unable to save response.",
                          "error"
                      );
                  }
              }
          );

          await refreshSchedulingStatus(
              question,
              section
          );
      }

      container.appendChild(fragment);
  }
}

async function initialize() {
    await loadCurrentUser();
    await loadSurveyStatus();
    await loadQuestions();
}

initialize();