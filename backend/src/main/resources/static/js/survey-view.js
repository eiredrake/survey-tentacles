const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

async function loadSurvey() {
    const response = await fetch("/api/surveys");

    if (!response.ok) {
        showToast("Unable to load survey.", "error");
        return;
    }

    const surveys = await response.json();

    const survey = surveys.find(
        survey => String(survey.id) === String(surveyId)
    );

    if (!survey) {
        showToast("Survey not found.", "error");
        return;
    }

    document.getElementById("survey-title").textContent =
        survey.title;

    document.getElementById("edit-survey-link").href =
        `/survey-edit.html?id=${survey.id}`;
}

async function renderSchedulingResults(question, section) {
  const resultsResponse = await fetch(
      `/api/surveys/${surveyId}/questions/${question.id}/results`
  );

  if (!resultsResponse.ok) {
      showToast("Unable to load scheduling results.", "error");
      return;
  }

  const results = await resultsResponse.json();

  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "Results";

  section.appendChild(resultsHeading);

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
      date.textContent = formatSchedulingDate(
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

  section.appendChild(resultsList);
}

async function loadQuestions() {
  const questionList =
      document.getElementById("question-list");

  if (!surveyId) {
      return;
  }

  const response = await fetch(
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

  questionList.replaceChildren();

  for (const question of questions) {
      const row =
          document.createElement("tr");

      const questionCell =
          document.createElement("td");

      questionCell.textContent =
          question.prompt;

      const typeCell =
          document.createElement("td");

      typeCell.textContent =
          question.type;

      const requiredCell =
          document.createElement("td");

      if (question.required) {
          requiredCell.innerHTML =
              '<i class="fa-solid fa-check" title="Required"></i>';
      }

      const actionsCell =
          document.createElement("td");

      actionsCell.className =
          "actions-column";

      const viewButton = document.createElement("button");
      viewButton.addEventListener(
        "click",
        async () => {
            const existingDetailRow = row.nextElementSibling;
    
            if (
                existingDetailRow?.classList.contains(
                    "question-detail-row"
                )
            ) {
                existingDetailRow.remove();
                return;
            }
    
            const template =
                document.getElementById(
                    question.viewTemplateId
                );
    
            if (!template) {
                showToast(
                    `View template not found for question ${question.id}.`,
                    "error"
                );
                return;
            }
    
            const detailRow =
                document.createElement("tr");
    
            detailRow.className =
                "question-detail-row";
    
            const detailCell =
                document.createElement("td");
    
            detailCell.colSpan = 4;
    
            const fragment =
                template.content.cloneNode(true);
    
            const section =
                fragment.querySelector(
                    ".survey-question"
                );
        
            const resultsContainer = section.querySelector(".scheduling-view-results" );
    
            if (resultsContainer) {
                await renderSchedulingResults(
                    question,
                    resultsContainer
                );
            }

            const answersContainer =
            section.querySelector(
                ".short-text-view-answers"
            );
        
            if (answersContainer) {
                await renderShortTextAnswers(
                    question,
                    answersContainer
                );
            }            
    
            detailCell.appendChild(fragment);
            detailRow.appendChild(detailCell);
    
            row.after(detailRow);
        }
    );

      viewButton.type = "button";
      viewButton.className = "icon-button";
      viewButton.title = "View question";
      viewButton.setAttribute(
          "aria-label",
          "View question"
      );

      viewButton.innerHTML =
          '<i class="fa-solid fa-eye"></i>';

      actionsCell.appendChild(
          viewButton
      );

      row.appendChild(
          questionCell
      );

      row.appendChild(
          typeCell
      );

      row.appendChild(
          requiredCell
      );

      row.appendChild(
          actionsCell
      );

      questionList.appendChild(
          row
      );
  }
}

async function renderShortTextAnswers(question, container) {
  const response = await fetch(
      `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`
  );

  if (!response.ok) {
      showToast(
          "Unable to load short text answers.",
          "error"
      );
      return;
  }

  const answers = await response.json();

  const heading = document.createElement("h3");
  heading.textContent = "Answers";

  container.appendChild(heading);

  if (!answers.length) {
      const empty = document.createElement("p");
      empty.textContent = "No answers yet.";

      container.appendChild(empty);
      return;
  }

  for (const answer of answers) {
      const answerBlock =
          document.createElement("div");

      answerBlock.className =
          "short-text-response";

      const name =
          document.createElement("strong");

      name.textContent =
          answer.name || answer.username;

      const value =
          document.createElement("p");

      value.textContent =
          answer.value;

      answerBlock.appendChild(name);
      answerBlock.appendChild(value);

      container.appendChild(answerBlock);
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

  const participants = await response.json();

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
      "Status"
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

      const requiredCell = document.createElement("td");

      const statusCell = document.createElement("td");
  
      statusCell.textContent =
          participant.completed
              ? "Completed"
              : "Incomplete";      

      if (participant.required) {
          requiredCell.innerHTML =
              '<i class="fa-solid fa-check" title="Required"></i>';
      }

      row.appendChild(nameCell);
      row.appendChild(requiredCell);
      row.appendChild(statusCell);

      tbody.appendChild(row);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

async function initialize() {

    await loadSurvey();
    await loadQuestions();
    await loadParticipants();
}

initialize();