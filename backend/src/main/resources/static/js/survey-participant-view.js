const params = new URLSearchParams(window.location.search);

const surveyId = params.get("id");
const userId = params.get("userId");

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

  document.getElementById("survey-title").textContent = survey.title;

  document.getElementById("back-to-survey-link").href =
    `/survey-view.html?id=${surveyId}`;

  if (survey.imageFilename) {
    const preview = document.getElementById("survey-image-preview");
    const image = document.getElementById("survey-image");

    image.src = `/api/surveys/${surveyId}/image`;
    preview.hidden = false;
  }
}

async function renderShortTextAnswer(question, container) {
  const response = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text/${userId}`
  );

  if (!response.ok) {
    showToast("Unable to load short text answer.", "error");
    return;
  }

  const answers = await response.json();

  container.replaceChildren();

  if (answers.length === 0) {
    container.textContent = "—";
    return;
  }

  const answer = answers[0];

  const paragraph = document.createElement("p");

  paragraph.textContent =
    answer.value || answer.answer || answer.text || "—";

  container.appendChild(paragraph);
}

async function loadParticipant() {
  const response = await fetch(
    `/api/surveys/${surveyId}/assignments`
  );

  if (!response.ok) {
    showToast("Unable to load participant.", "error");
    return;
  }

  const participants = await response.json();

  const participant = participants.find(
    participant => String(participant.userId) === String(userId)
  );

  if (!participant) {
    showToast("Participant not found.", "error");
    return;
  }

  const participantName =
    participant.name || participant.username;

  document.getElementById("participant-heading").textContent =
    `${participantName}'s Answers`;
}

async function renderSchedulingAnswers(question, container) {
  const response = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling/${userId}`
  );

  if (!response.ok) {
    showToast("Unable to load scheduling answers.", "error");
    return;
  }

  const answers = await response.json();

  container.replaceChildren();

  if (answers.length === 0) {
    container.textContent = "—";
    return;
  }

  const list = document.createElement("ul");

  for (const answer of answers) {
    const item = document.createElement("li");

    if (answer.dateTime) {
      item.textContent = formatDateTime(answer.dateTime);
    } else if (answer.date) {
      item.textContent = formatDate(answer.date);
    } else {
      item.textContent = "—";
    }

    list.appendChild(item);
  }

  container.appendChild(list);
}

async function renderSchedulingAnswers(question, container) {
  const response = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling/${userId}`
  );

  if (!response.ok) {
    showToast("Unable to load scheduling answers.", "error");
    return;
  }

  const answers = await response.json();

  container.replaceChildren();

  if (answers.length === 0) {
    container.textContent = "—";
    return;
  }

  const list = document.createElement("ul");

  for (const answer of answers) {
    const item = document.createElement("li");

    item.textContent =
      formatSchedulingDate(
        answer.date,
        answer.dateTime
      );

    list.appendChild(item);
  }

  container.appendChild(list);
}

async function loadQuestions() {
  const questionList = document.getElementById("question-list");

  const response = await fetch(
    `/api/surveys/${surveyId}/questions`
  );

  if (!response.ok) {
    showToast("Unable to load questions.", "error");
    return;
  }

  const questions = await response.json();

  questionList.replaceChildren();

  for (const question of questions) {
    const row = document.createElement("tr");

    const questionCell = document.createElement("td");

    questionCell.textContent = question.prompt;

    const typeCell = document.createElement("td");

    typeCell.textContent = question.type;

    const requiredCell = document.createElement("td");

    if (question.required) {
      requiredCell.innerHTML =
        '<i class="fa-solid fa-check" title="Required"></i>';
    }

    const actionsCell = document.createElement("td");

    actionsCell.className = "actions-column";

    const viewButton = document.createElement("button");

    viewButton.type = "button";
    viewButton.className = "icon-button";
    viewButton.title = "View question";
    viewButton.setAttribute(
      "aria-label",
      "View question"
    );

    viewButton.innerHTML =
      '<i class="fa-solid fa-eye"></i>';

    actionsCell.appendChild(viewButton);

    row.appendChild(questionCell);
    row.appendChild(typeCell);
    row.appendChild(requiredCell);
    row.appendChild(actionsCell);

    questionList.appendChild(row);

    const detailRow = document.createElement("tr");

    detailRow.className = "question-detail-row";
    detailRow.hidden = true;
    
    const detailCell = document.createElement("td");
    
    detailCell.colSpan = 4;
    
    const template = document.getElementById(
      question.viewTemplateId
    );
    
    if (template) {
      detailCell.appendChild(
        template.content.cloneNode(true)
      );
    }
    
    detailRow.appendChild(detailCell);
    
    questionList.appendChild(detailRow);
    
    let answersLoaded = false;

    viewButton.addEventListener("click", async () => {
      detailRow.hidden = !detailRow.hidden;
    
      if (!detailRow.hidden && !answersLoaded) {
        if (question.type ===  "RELATIONSHIP") {
          const container = detailRow.querySelector(
            ".relationship-view-results"
          );
      
          await renderRelationshipAnswers(
            question,
            container
          );
        }
      
        if (question.type === "SINGLE_SELECT") {
          await renderSingleSelectAnswer(question, detailRow.querySelector(".single-select-view-results"));
        }

        if (question.type === "SHORT_TEXT") {
          const container = detailRow.querySelector(
            ".short-text-view-answers"
          );
      
          await renderShortTextAnswer(
            question,
            container
          );
        }

        if (question.type === "SCHEDULING") {
          const container = detailRow.querySelector(
            ".scheduling-view-results"
          );
        
          await renderSchedulingAnswers(
            question,
            container
          );
        }        
      
        answersLoaded = true;
      }

    });   
  }
}

async function renderSingleSelectAnswer(question, container) {
  const response = await fetch(`/api/surveys/${surveyId}/questions/${question.id}/answers/single-select/${userId}`);
  if (!response.ok) {
    showToast("Unable to load Single Select answer.", "error");
    return;
  }
  const answers = await response.json();
  const value = document.createElement("p");
  value.textContent = answers.length ? answers[0].label : "No answer provided.";
  container.replaceChildren(value);
}

async function renderRelationshipAnswers(question, container) {
  const questionResponse = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}`
  );

  if (!questionResponse.ok) {
    showToast("Unable to load relationship question.", "error");
    return;
  }

  const questionDetail = await questionResponse.json();

  const answerResponse = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/relationship/${userId}`
  );

  if (!answerResponse.ok) {
    showToast("Unable to load relationship answers.", "error");
    return;
  }

  const answers = await answerResponse.json();

  container.replaceChildren();

  for (const subject of questionDetail.subjects || []) {
    const answer = answers.find(
      answer =>
        String(answer.subjectId) === String(subject.id)
    );

    const row = document.createElement("tr");

    const characterCell = document.createElement("td");
    characterCell.textContent = subject.name;

    const likeCell = document.createElement("td");
    likeCell.textContent =
      answer?.likeScore ?? "—";

    const trustCell = document.createElement("td");
    trustCell.textContent =
      answer?.trustScore ?? "—";

    const commentCell = document.createElement("td");
    commentCell.textContent =
      answer?.comment || "—";

    row.appendChild(characterCell);
    row.appendChild(likeCell);
    row.appendChild(trustCell);
    row.appendChild(commentCell);

    container.appendChild(row);
  }
}

async function initialize() {
  await loadSurvey();
  await loadParticipant();
  await loadQuestions();
}

initialize();
