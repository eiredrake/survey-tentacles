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
    (survey) => String(survey.id) === String(surveyId),
  );

  if (!survey) {
    showToast("Survey not found.", "error");
    return;
  }

  document.getElementById("survey-title").textContent = survey.title;

  document.getElementById("edit-survey-link").href = `/survey-edit.html?id=${survey.id}`;

      const preview =
      document.getElementById(
        "survey-image-preview"
      );
    
    const image =
      document.getElementById(
        "survey-image"
      );
    
    if (
      preview &&
      image &&
      survey.imageFilename
    ) {
      image.src =
        `/api/surveys/${surveyId}/image`;
    
      preview.hidden = false;
    }    
}

async function renderRelationshipResults(question, container) {
  const detailResponse = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}`,
  );

  if (!detailResponse.ok) {
    showToast("Unable to load relationship question.", "error");
    return;
  }

  const detail = await detailResponse.json();

  const answersResponse = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/relationship`,
  );

  if (!answersResponse.ok) {
    showToast("Unable to load relationship results.", "error");
    return;
  }

  const answers = await answersResponse.json();

  container.replaceChildren();

  const average = (scores) => {
    if (!scores.length) {
      return null;
    }

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  };

  const formatAverage = (value) => {
    if (value === null) {
      return "—";
    }

    const rounded = value.toFixed(1);

    return value > 0 ? `+${rounded}` : rounded;
  };

  const subjects = [...detail.subjects]
    .map((subject) => {
      const subjectAnswers = answers.filter(
        (answer) => answer.subjectId === subject.id,
      );

      const comments = subjectAnswers.filter(
        (answer) => answer.comment && answer.comment.trim().length > 0,
      );

      const likeScores = subjectAnswers
        .map((answer) => answer.likeScore)
        .filter((score) => score !== null && score !== 0);

      const trustScores = subjectAnswers
        .map((answer) => answer.trustScore)
        .filter((score) => score !== null && score !== 0);

      return {
        subject,
        subjectAnswers,
        comments,
        averageLike: average(likeScores),
        averageTrust: average(trustScores),
      };
    })
    .sort((a, b) =>
      a.subject.name.localeCompare(
        b.subject.name,
        undefined,
        { sensitivity: "base" },
      ),
    );

  for (const result of subjects) {
    const {
      subject,
      subjectAnswers,
      comments,
      averageLike,
      averageTrust,
    } = result;

    const row = document.createElement("tr");

    row.dataset.character = subject.name;
    row.dataset.like =
      averageLike === null ? "" : String(averageLike);
    row.dataset.trust =
      averageTrust === null ? "" : String(averageTrust);
    row.dataset.responses =
      String(subjectAnswers.length);

    const nameCell = document.createElement("td");

    const nameText = document.createElement("span");

    nameText.textContent = subject.name;

    nameCell.appendChild(nameText);

    if (comments.length > 0) {
      const chevron = document.createElement("i");

      chevron.className = "fa-solid fa-chevron-right";
      chevron.style.marginLeft = "0.5rem";

      nameCell.appendChild(chevron);
    }

    if (subject.description) {
      nameCell.title = subject.description;
    }

    const likeCell = document.createElement("td");

    likeCell.textContent = formatAverage(averageLike);

    const trustCell = document.createElement("td");

    trustCell.textContent = formatAverage(averageTrust);

    const responsesCell = document.createElement("td");

    responsesCell.textContent = subjectAnswers.length;

    row.appendChild(nameCell);
    row.appendChild(likeCell);
    row.appendChild(trustCell);
    row.appendChild(responsesCell);

    container.appendChild(row);

    let detailRow = null;

    if (comments.length > 0) {
      row.classList.add("relationship-comment-toggle");
      row.style.cursor = "pointer";

      detailRow = document.createElement("tr");

      detailRow.hidden = true;

      const detailCell = document.createElement("td");

      detailCell.colSpan = 4;

      const commentsTable = document.createElement("table");

      commentsTable.className =
        "survey-table relationship-comments-table";

      const commentsHead = document.createElement("thead");

      const commentsHeaderRow = document.createElement("tr");

      const participantHeading = document.createElement("th");

      participantHeading.textContent = "Participant";

      const commentHeading = document.createElement("th");

      commentHeading.textContent = "Comment";

      commentsHeaderRow.appendChild(participantHeading);
      commentsHeaderRow.appendChild(commentHeading);

      commentsHead.appendChild(commentsHeaderRow);

      commentsTable.appendChild(commentsHead);

      const commentsBody = document.createElement("tbody");

      for (const answer of comments) {
        const commentRow = document.createElement("tr");

        const participantCell = document.createElement("td");

        participantCell.textContent =
          answer.name ||
          answer.username ||
          "Unknown";

        const commentCell = document.createElement("td");

        commentCell.textContent = answer.comment;

        commentRow.appendChild(participantCell);
        commentRow.appendChild(commentCell);

        commentsBody.appendChild(commentRow);
      }

      commentsTable.appendChild(commentsBody);

      detailCell.appendChild(commentsTable);
      detailRow.appendChild(detailCell);

      container.appendChild(detailRow);

      row.addEventListener("click", () => {
        detailRow.hidden = !detailRow.hidden;

        const chevron = nameCell.querySelector("i");

        if (chevron) {
          chevron.className = detailRow.hidden
            ? "fa-solid fa-chevron-right"
            : "fa-solid fa-chevron-down";
        }
      });
    }

    row._relationshipDetailRow = detailRow;
  }

  const section = container.closest(".survey-question");

  const sortHeaders = [
    ...section.querySelectorAll("[data-sort-key]"),
  ];

  for (const header of sortHeaders) {
    header.classList.add("sortable-header");
  }

  let currentSortKey = "character";
  let currentSortAscending = true;

  const updateSortIndicators = () => {
    for (const header of sortHeaders) {
      header.classList.remove(
        "sort-ascending",
        "sort-descending",
      );

      if (
        header.dataset.sortKey ===
        currentSortKey
      ) {
        header.classList.add(
          currentSortAscending
            ? "sort-ascending"
            : "sort-descending",
        );
      }
    }
  };

  const sortRelationshipRows = (
    sortKey,
    ascending,
  ) => {
    const rows = [
      ...container.querySelectorAll(
        ":scope > tr:not([hidden])",
      ),
    ].filter(
      (row) =>
        !row.classList.contains(
          "relationship-comment-toggle",
        ) ||
        row.dataset.character,
    );

    /*
     * Only sort the actual subject rows.
     * Detail/comment rows stay attached to
     * their subject row.
     */
    const subjectRows = rows.filter(
      (row) => row.dataset.character !== undefined,
    );

    subjectRows.sort((a, b) => {
      let comparison = 0;

      if (sortKey === "character") {
        comparison =
          a.dataset.character.localeCompare(
            b.dataset.character,
            undefined,
            { sensitivity: "base" },
          );
      } else if (sortKey === "like") {
        const aValue =
          a.dataset.like === ""
            ? Number.NEGATIVE_INFINITY
            : Number(a.dataset.like);

        const bValue =
          b.dataset.like === ""
            ? Number.NEGATIVE_INFINITY
            : Number(b.dataset.like);

        comparison = aValue - bValue;
      } else if (sortKey === "trust") {
        const aValue =
          a.dataset.trust === ""
            ? Number.NEGATIVE_INFINITY
            : Number(a.dataset.trust);

        const bValue =
          b.dataset.trust === ""
            ? Number.NEGATIVE_INFINITY
            : Number(b.dataset.trust);

        comparison = aValue - bValue;
      } else if (sortKey === "responses") {
        comparison =
          Number(a.dataset.responses) -
          Number(b.dataset.responses);
      }

      return ascending
        ? comparison
        : -comparison;
    });

    for (const row of subjectRows) {
      container.appendChild(row);

      if (row._relationshipDetailRow) {
        container.appendChild(
          row._relationshipDetailRow,
        );
      }
    }
  };

  for (const header of sortHeaders) {
    header.addEventListener(
      "click",
      () => {
        const sortKey =
          header.dataset.sortKey;

        if (sortKey === currentSortKey) {
          currentSortAscending =
            !currentSortAscending;
        } else {
          currentSortKey = sortKey;
          currentSortAscending = true;
        }

        sortRelationshipRows(
          currentSortKey,
          currentSortAscending,
        );

        updateSortIndicators();
      },
    );
  }

  updateSortIndicators();
}

async function renderSchedulingResults(question, section) {
  const resultsResponse = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/results`,
  );

  if (!resultsResponse.ok) {
    showToast("Unable to load scheduling results.", "error");
    return;
  }

  const results = await resultsResponse.json();

  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "Results";

  section.appendChild(resultsHeading);

  const maxVotes = Math.max(0, ...results.map((result) => result.votes));

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
    date.textContent = formatSchedulingDate(result.date, result.dateTime);

    const votes = document.createElement("span");
    votes.textContent = `${result.votes} vote${result.votes === 1 ? "" : "s"}`;

    header.appendChild(date);
    header.appendChild(votes);

    const barTrack = document.createElement("div");
    barTrack.className = "scheduling-result-track";

    const bar = document.createElement("div");
    bar.className = "scheduling-result-bar";

    const percentage = maxVotes > 0 ? (result.votes / maxVotes) * 100 : 0;

    bar.style.width = `${percentage}%`;

    barTrack.appendChild(bar);

    item.appendChild(header);
    item.appendChild(barTrack);

    resultsList.appendChild(item);
  }

  section.appendChild(resultsList);
}

async function loadQuestions() {
  const questionList = document.getElementById("question-list");

  if (!surveyId) {
    return;
  }

  const response = await fetch(`/api/surveys/${surveyId}/questions`);

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
    viewButton.addEventListener("click", async () => {
      const existingDetailRow = row.nextElementSibling;

      if (existingDetailRow?.classList.contains("question-detail-row")) {
        existingDetailRow.remove();
        return;
      }

      const template = document.getElementById(question.viewTemplateId);

      if (!template) {
        showToast(
          `View template not found for question ${question.id}.`,
          "error",
        );
        return;
      }

      const detailRow = document.createElement("tr");

      detailRow.className = "question-detail-row";

      const detailCell = document.createElement("td");

      detailCell.colSpan = 4;

      const fragment = template.content.cloneNode(true);

      const section = fragment.querySelector(".survey-question");

      const resultsContainer = section.querySelector(
        ".scheduling-view-results",
      );

      if (resultsContainer) {
        await renderSchedulingResults(question, resultsContainer);
      }

      const answersContainer = section.querySelector(
        ".short-text-view-answers",
      );

      if (answersContainer) {
        await renderShortTextAnswers(question, answersContainer);
      }

      const singleSelectContainer = section.querySelector(".single-select-view-results");
      if (singleSelectContainer) await renderSingleSelectResults(question, singleSelectContainer);

      const relationshipContainer = section.querySelector(
        ".relationship-view-results",
      );

      if (relationshipContainer) {
        await renderRelationshipResults(question, relationshipContainer);
      }

      detailCell.appendChild(fragment);
      detailRow.appendChild(detailCell);

      row.after(detailRow);
    });

    viewButton.type = "button";
    viewButton.className = "icon-button";
    viewButton.title = "View question";
    viewButton.setAttribute("aria-label", "View question");

    viewButton.innerHTML = '<i class="fa-solid fa-eye"></i>';

    actionsCell.appendChild(viewButton);

    row.appendChild(questionCell);

    row.appendChild(typeCell);

    row.appendChild(requiredCell);

    row.appendChild(actionsCell);

    questionList.appendChild(row);
  }
}

async function renderSingleSelectResults(question, container) {
  const detailResponse = await fetch(`/api/surveys/${surveyId}/questions/${question.id}`);
  const answersResponse = await fetch(`/api/surveys/${surveyId}/questions/${question.id}/answers/single-select`);
  if (!detailResponse.ok || !answersResponse.ok) {
    showToast("Unable to load Single Select results.", "error");
    return;
  }
  const detail = await detailResponse.json();
  const answers = await answersResponse.json();
  const heading = document.createElement("h3");
  heading.textContent = "Results";
  container.appendChild(heading);
  for (const option of detail.options) {
    const voters = answers.filter(answer => answer.optionId === option.id);
    const row = document.createElement("p");
    const label = document.createElement("strong");
    label.textContent = `${option.label}: ${voters.length} vote${voters.length === 1 ? "" : "s"}`;
    row.appendChild(label);
    if (voters.length) row.append(document.createElement("br"),
      document.createTextNode(voters.map(answer => answer.name || answer.username).join(", ")));
    container.appendChild(row);
  }
  if (!answers.length) {
    const empty = document.createElement("p");
    empty.textContent = "No answers yet.";
    container.appendChild(empty);
  }
}

async function renderShortTextAnswers(question, container) {
  const response = await fetch(
    `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`,
  );

  if (!response.ok) {
    showToast("Unable to load short text answers.", "error");
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
    const answerBlock = document.createElement("div");

    answerBlock.className = "short-text-response";

    const name = document.createElement("strong");

    name.textContent = answer.name || answer.username;

    const value = document.createElement("p");

    value.textContent = answer.value;

    answerBlock.appendChild(name);
    answerBlock.appendChild(value);

    container.appendChild(answerBlock);
  }
}

async function loadParticipants() {
  const container = document.getElementById("participants-view");

  const response = await fetch(`/api/surveys/${surveyId}/assignments`);

  if (!response.ok) {
    showToast("Unable to load participants.", "error");
    return;
  }

  const participants = await response.json();
  participants.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? -1 : 1;
    }
  
    const nameA = (a.name || a.username || "").toLowerCase();
    const nameB = (b.name || b.username || "").toLowerCase();
  
    return nameA.localeCompare(nameB);
  });  

  const table = document.createElement("table");

  table.className = "survey-table participants-table";

  const thead = document.createElement("thead");

  const headerRow = document.createElement("tr");

  for (const headingText of ["Name", "Required", "Status"]) {
    const th = document.createElement("th");

    th.textContent = headingText;

    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const participant of participants) {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");

    const participantName =
    participant.name || participant.username;
  
    if (participant.completed) {
      const participantLink = document.createElement("a");
      row.classList.add("participant-completed");
    
      participantLink.href =
        `/survey-participant-view.html?id=${surveyId}&userId=${participant.userId}`;
    
      participantLink.textContent = participantName;
    
      nameCell.appendChild(participantLink);
    } else {
      nameCell.textContent = participantName;
    }

    const requiredCell = document.createElement("td");

    const statusCell = document.createElement("td");

    statusCell.textContent = participant.completed ? "Completed" : "Incomplete";

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
