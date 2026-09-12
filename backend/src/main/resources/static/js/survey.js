const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

let surveyStatus = null;
let currentUser = null;
let surveyAcceptingResponses = false;

let hasUnsavedChanges = false;
let isSubmittingSurvey = false;
let pendingSubmissionId = null;

const questionHandlers = [];

function markSurveyDirty() {
    pendingSubmissionId = null;
    hasUnsavedChanges = true;
}

window.addEventListener("beforeunload", event => {
    if (!hasUnsavedChanges || isSubmittingSurvey) {
        return;
    }

    event.preventDefault();
});

async function loadCurrentUser() {
    const response = await fetch("/me");

    if (!response.ok) {
        return;
    }

    currentUser = await response.json();

    const userElement = document.getElementById("user");

    if (userElement) {
        userElement.textContent = currentUser.name;
    }
}

async function loadSurveyStatus() {
    const response = await fetch("/api/surveys");

    if (!response.ok) {
        return;
    }

    const surveys = await response.json();

    const survey = surveys.find(survey =>
        String(survey.id) === String(surveyId)
    );

    if (survey) {
        surveyStatus = survey.status;
        surveyAcceptingResponses = survey.acceptingResponses;

        const developmentBanner = document.getElementById("development-mode-banner");

        if ( developmentBanner && surveyStatus === "DEVELOPMENT" && currentUser?.authorities?.includes("ROLE_ADMIN") ) { 
            developmentBanner.hidden = false; 
        }        

        document.getElementById("survey-title").textContent = survey.title;

        const preview = document.getElementById("survey-image-preview");
        const image = document.getElementById("survey-image");

        if (preview && image && survey.imageFilename) {
            image.src = `/api/surveys/${surveyId}/image`;
            preview.hidden = false;
        }
    }
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

    if (!resultsResponse.ok) {
        showToast("Unable to load results.", "error");
        return;
    }

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
        date.textContent = formatSchedulingDate(
            result.date,
            result.dateTime
        );

        const votes = document.createElement("span");
        votes.textContent = `${result.votes} vote${result.votes === 1 ? "" : "s"}`;

        header.appendChild(date);
        header.appendChild(votes);

        const barTrack = document.createElement("div");
        barTrack.className = "scheduling-result-track";

        const bar = document.createElement("div");
        bar.className = "scheduling-result-bar";

        const percentage = maxVotes > 0
            ? (result.votes / maxVotes) * 100
            : 0;

        bar.style.width = `${percentage}%`;

        barTrack.appendChild(bar);

        item.appendChild(header);
        item.appendChild(barTrack);

        resultsList.appendChild(item);
    }

    statusContainer.appendChild(resultsList);
}

async function refreshShortTextStatus(question, section) {
    if (!currentUser?.authorities?.includes("ROLE_ADMIN")) {
        return;
    }

    const statusContainer = section.querySelector(".short-text-status");

    if (!statusContainer) {
        return;
    }

    const response = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`
    );

    if (!response.ok) {
        showToast("Unable to load short text answers.", "error");
        return;
    }

    const answers = await response.json();

    statusContainer.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Answers";

    statusContainer.appendChild(heading);

    if (!answers.length) {
        const empty = document.createElement("p");
        empty.textContent = "No answers yet.";

        statusContainer.appendChild(empty);
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

        statusContainer.appendChild(answerBlock);
    }
}

function createRelationshipScoreControl(className, subjectId, scoreType, onChange) {
    const control = document.createElement("div");

    control.className = `relationship-score-control ${className}`;
    control.dataset.subjectId = subjectId;

    let score = 0;

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.className = "relationship-score-button";
    decreaseButton.title = "Decrease";
    decreaseButton.setAttribute("aria-label", "Decrease score");
    decreaseButton.innerHTML = '<i class="fa-solid fa-minus"></i>';

    const display = document.createElement("span");
    display.className = "relationship-score-display";

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.className = "relationship-score-button";
    increaseButton.title = "Increase";
    increaseButton.setAttribute("aria-label", "Increase score");
    increaseButton.innerHTML = '<i class="fa-solid fa-plus"></i>';

    const updateDisplay = () => {
        display.replaceChildren();

        if (score < 0) {
            for (let i = 0; i < Math.abs(score); i++) {
                const icon = document.createElement("i");

                icon.className = scoreType === "trust"
                    ? "fa-solid fa-shield-halved relationship-score-trust-negative"
                    : "fa-solid fa-heart-crack relationship-score-like-negative";

                display.appendChild(icon);
            }

            const value = document.createElement("span");
            value.className = "relationship-score-value";
            value.textContent = String(score);

            display.appendChild(value);
        } else if (score > 0) {
            for (let i = 0; i < score; i++) {
                const icon = document.createElement("i");

                icon.className = scoreType === "trust"
                    ? "fa-solid fa-shield relationship-score-trust-positive"
                    : "fa-solid fa-heart relationship-score-like-positive";

                display.appendChild(icon);
            }

            const value = document.createElement("span");
            value.className = "relationship-score-value";
            value.textContent = `+${score}`;

            display.appendChild(value);
        } else {
            display.textContent = "— No opinion";
        }

        decreaseButton.disabled = score <= -5;
        increaseButton.disabled = score >= 5;

        display.setAttribute(
            "aria-label",
            score === 0 ? "No opinion" : `Score ${score}`
        );
    };

    Object.defineProperty(control, "value", {
        get() {
            return String(score);
        },

        set(value) {
            const parsed = Number(value);

            score = Number.isFinite(parsed)
                ? Math.max(-5, Math.min(5, parsed))
                : 0;

            updateDisplay();
        }
    });

    decreaseButton.addEventListener("click", () => {
        if (score > -5) {
            score--;
            updateDisplay();
            onChange?.();
        }
    });

    increaseButton.addEventListener("click", () => {
        if (score < 5) {
            score++;
            updateDisplay();
            onChange?.();
        }
    });

    control.appendChild(decreaseButton);
    control.appendChild(display);
    control.appendChild(increaseButton);

    updateDisplay();

    return control;
}

function showRequiredError(section, message) {
    section.classList.add("question-required-error");

    showToast(message, "error");

    section.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    setTimeout(() => {
        section.classList.remove("question-required-error");
    }, 1200);
}

function setupRelationshipSorting(section, relationshipSubjects) {
    const sortHeaders = [
        ...section.querySelectorAll("[data-sort-key]")
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
                "sort-descending"
            );

            if (header.dataset.sortKey === currentSortKey) {
                header.classList.add(
                    currentSortAscending
                        ? "sort-ascending"
                        : "sort-descending"
                );
            }
        }
    };

    const sortRelationshipRows = (sortKey, ascending) => {
        const rows = [
            ...relationshipSubjects.querySelectorAll("tr")
        ];

        rows.sort((a, b) => {
            let comparison = 0;

            if (sortKey === "character") {
                const aValue = a.cells[0].textContent.trim();
                const bValue = b.cells[0].textContent.trim();

                comparison = aValue.localeCompare(
                    bValue,
                    undefined,
                    {
                        sensitivity: "base"
                    }
                );
            } else if (sortKey === "like") {
                const aValue = Number(
                    a.querySelector(".relationship-like").value
                );

                const bValue = Number(
                    b.querySelector(".relationship-like").value
                );

                comparison = aValue - bValue;
            } else if (sortKey === "trust") {
                const aValue = Number(
                    a.querySelector(".relationship-trust").value
                );

                const bValue = Number(
                    b.querySelector(".relationship-trust").value
                );

                comparison = aValue - bValue;
            } else if (sortKey === "comments") {
                const aValue = a
                    .querySelector(".relationship-comment")
                    .value
                    .trim();

                const bValue = b
                    .querySelector(".relationship-comment")
                    .value
                    .trim();

                comparison = aValue.localeCompare(
                    bValue,
                    undefined,
                    {
                        sensitivity: "base"
                    }
                );
            }

            return ascending
                ? comparison
                : -comparison;
        });

        for (const row of rows) {
            relationshipSubjects.appendChild(row);
        }
    };

    updateSortIndicators();

    for (const header of sortHeaders) {
        header.addEventListener("click", () => {
            const sortKey = header.dataset.sortKey;

            if (sortKey === currentSortKey) {
                currentSortAscending = !currentSortAscending;
            } else {
                currentSortKey = sortKey;
                currentSortAscending = true;
            }

            sortRelationshipRows(
                currentSortKey,
                currentSortAscending
            );

            updateSortIndicators();
        });
    }
}

async function loadRelationshipQuestion(
    question,
    section,
    relationshipSubjects
) {
    section.classList.add("relationship-question");

    const detailResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}`
    );

    if (!detailResponse.ok) {
        showToast(
            "Unable to load relationship question.",
            "error"
        );

        return;
    }

    const detail = await detailResponse.json();

    const answersResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/answers/relationship`
    );

    if (!answersResponse.ok) {
        showToast(
            "Unable to load existing relationship answers.",
            "error"
        );

        return;
    }

    const answers = await answersResponse.json();

    const myAnswers = new Map(
        answers
            .filter(answer => answer.userId === currentUser.id)
            .map(answer => [
                answer.subjectId,
                answer
            ])
    );

    relationshipSubjects.replaceChildren();

    const sortedSubjects = [...detail.subjects].sort((a, b) =>
        a.name.localeCompare(
            b.name,
            undefined,
            {
                sensitivity: "base"
            }
        )
    );

    for (const subject of sortedSubjects) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = subject.name;

        if (subject.description) {
            nameCell.title = subject.description;
        }

        const likeCell = document.createElement("td");

        const likeInput = createRelationshipScoreControl(
            "relationship-like",
            subject.id,
            "like",
            markSurveyDirty
        );

        likeCell.appendChild(likeInput);

        const trustCell = document.createElement("td");

        const trustInput = createRelationshipScoreControl(
            "relationship-trust",
            subject.id,
            "trust",
            markSurveyDirty
        );

        trustCell.appendChild(trustInput);

        const commentCell = document.createElement("td");

        const commentInput = document.createElement("textarea");

        commentInput.maxLength = 500;
        commentInput.rows = 2;
        commentInput.className = "relationship-comment";
        commentInput.dataset.subjectId = subject.id;

        commentInput.addEventListener(
            "input",
            markSurveyDirty
        );

        const existingAnswer = myAnswers.get(subject.id);

        if (existingAnswer) {
            likeInput.value = String(
                existingAnswer.likeScore ?? 0
            );

            trustInput.value = String(
                existingAnswer.trustScore ?? 0
            );

            commentInput.value =
                existingAnswer.comment ?? "";
        }

        commentCell.appendChild(commentInput);

        row.appendChild(nameCell);
        row.appendChild(likeCell);
        row.appendChild(trustCell);
        row.appendChild(commentCell);

        relationshipSubjects.appendChild(row);
    }

    setupRelationshipSorting(
        section,
        relationshipSubjects
    );

    const getResponses = () => {
        const rows = [
            ...relationshipSubjects.querySelectorAll("tr")
        ];

        return rows.map(row => {
            const likeInput =
                row.querySelector(".relationship-like");

            const trustInput =
                row.querySelector(".relationship-trust");

            const commentInput =
                row.querySelector(".relationship-comment");

            return {
                subjectId:
                    Number(
                        likeInput.dataset.subjectId
                    ),

                likeScore:
                    Number(likeInput.value),

                trustScore:
                    Number(trustInput.value),

                comment:
                    commentInput.value.trim()
            };
        });
    };

    questionHandlers.push({
        section,

        validate() {
            const responses = getResponses();

            const hasRating = responses.some(
                response =>
                    response.likeScore !== 0 ||
                    response.trustScore !== 0
            );

            if (question.required && !hasRating) {
                showRequiredError(
                    section,
                    "This question is required. Please provide at least one Like or Trust rating."
                );

                return false;
            }

            return true;
        },

        async save(csrf) {
            const response = await fetch(
                `/api/surveys/${surveyId}/questions/${question.id}/answers/relationship`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        [csrf.headerName]:
                            csrf.token
                    },

                    body: JSON.stringify({
                        responses: getResponses()
                    })
                }
            );

            return response.ok;
        }
    });
}

async function loadShortTextQuestion(
    question,
    section,
    shortTextInput,
    shortTextCharacterCount
) {
    const answersResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`
    );

    if (!answersResponse.ok) {
        showToast(
            "Unable to load existing answer.",
            "error"
        );

        return;
    }

    const answers = await answersResponse.json();

    const existingAnswer = answers.find(
        answer =>
            answer.userId === currentUser.id
    );

    if (existingAnswer) {
        shortTextInput.value =
            existingAnswer.value;
    }

    shortTextInput.disabled =
        !surveyAcceptingResponses;

    const updateCharacterCount = () => {
        shortTextCharacterCount.textContent =
            `${shortTextInput.value.length} / 500`;
    };

    updateCharacterCount();

    shortTextInput.addEventListener("input", () => {
        updateCharacterCount();
        markSurveyDirty();
    });

    questionHandlers.push({
        section,

        validate() {
            const value =
                shortTextInput.value.trim();

            if (
                question.required &&
                value.length === 0
            ) {
                showRequiredError(
                    section,
                    "This question is required. Please enter a response."
                );

                return false;
            }

            return true;
        },

        async save(csrf) {
            const response = await fetch(
                `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        [csrf.headerName]:
                            csrf.token
                    },

                    body: JSON.stringify({
                        value:
                            shortTextInput.value.trim()
                    })
                }
            );

            return response.ok;
        }
    });
}

async function loadSchedulingQuestion(
    question,
    section,
    optionsContainer,
    selectAllButton,
    clearAllButton
) {
    const detailResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}`
    );

    if (!detailResponse.ok) {
        showToast(
            "Unable to load question details.",
            "error"
        );

        return;
    }

    const detail = await detailResponse.json();

    const answersResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/answers/scheduling`
    );

    if (!answersResponse.ok) {
        showToast(
            "Unable to load existing answers.",
            "error"
        );

        return;
    }

    const answers =
        await answersResponse.json();

    const mySelectedOptionIds =
        new Set(
            answers
                .filter(
                    answer =>
                        answer.userId ===
                        currentUser.id
                )
                .map(
                    answer =>
                        answer.optionId
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
            mySelectedOptionIds.has(
                option.id
            );

        checkbox.disabled =
            !surveyAcceptingResponses;

        checkbox.addEventListener(
            "change",
            markSurveyDirty
        );

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

    if (selectAllButton) {
        selectAllButton.disabled =
            !surveyAcceptingResponses;

        selectAllButton.addEventListener(
            "click",
            () => {
                optionsContainer
                    .querySelectorAll(
                        'input[type="checkbox"]:not(:disabled)'
                    )
                    .forEach(
                        checkbox => {
                            checkbox.checked = true;
                        }
                    );

                markSurveyDirty();
            }
        );
    }

    if (clearAllButton) {
        clearAllButton.disabled =
            !surveyAcceptingResponses;

        clearAllButton.addEventListener(
            "click",
            () => {
                optionsContainer
                    .querySelectorAll(
                        'input[type="checkbox"]:not(:disabled)'
                    )
                    .forEach(
                        checkbox => {
                            checkbox.checked = false;
                        }
                    );

                markSurveyDirty();
            }
        );
    }

    const getSelectedOptionIds = () =>
        [
            ...optionsContainer.querySelectorAll(
                'input[type="checkbox"]:checked'
            )
        ].map(
            checkbox =>
                Number(checkbox.value)
        );

    questionHandlers.push({
        section,

        validate() {
            const selected =
                getSelectedOptionIds();

            if (
                question.required &&
                selected.length === 0
            ) {
                showRequiredError(
                    section,
                    "This question is required. Please select at least one option."
                );

                return false;
            }

            return true;
        },

        async save(csrf) {
            const response = await fetch(
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
                        optionIds:
                            getSelectedOptionIds()
                    })
                }
            );

            return response.ok;
        }
    });
}

async function loadSelectQuestion(question, section) {
    const multiple = question.type === "MULTI_SELECT";
    const type = multiple ? "multi-select" : "single-select";
    const detailResponse = await fetch(`/api/surveys/${surveyId}/questions/${question.id}`);
    const answersResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/answers/${type}/${currentUser.id}`);
    if (!detailResponse.ok || !answersResponse.ok) {
        throw new Error("Unable to load selection question.");
    }
    const detail = await detailResponse.json();
    const answers = await answersResponse.json();
    const options = section.querySelector(`.${type}-options`);
    options.setAttribute("aria-label", question.prompt);
    if (!multiple) options.setAttribute("aria-required", String(question.required));
    for (const option of detail.options) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = multiple ? "checkbox" : "radio";
        input.name = `${type}-${question.id}`;
        input.value = option.id;
        input.checked = answers.some(answer => answer.optionId === option.id);
        input.disabled = !surveyAcceptingResponses;
        input.addEventListener("change", markSurveyDirty);
        label.append(input, document.createTextNode(` ${option.label}`));
        options.append(label, document.createElement("br"));
    }
    const clearButton = section.querySelector(`.${type}-clear`);
    clearButton.disabled = !surveyAcceptingResponses;
    clearButton.addEventListener("click", () => {
        options.querySelectorAll("input").forEach(input => { input.checked = false; });
        markSurveyDirty();
    });
    const selectedIds = () => [...options.querySelectorAll("input:checked")].map(input => Number(input.value));
    questionHandlers.push({
        section,
        validate() {
            if (question.required && selectedIds().length === 0) {
                showRequiredError(section, multiple
                    ? "This question is required. Please choose at least one option."
                    : "This question is required. Please choose one option.");
                return false;
            }
            return true;
        },
        async save(csrf) {
            const response = await fetch(`/api/surveys/${surveyId}/questions/${question.id}/answers/${type}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
                body: JSON.stringify(multiple ? { optionIds: selectedIds() } : { optionId: selectedIds()[0] ?? null })
            });
            return response.ok;
        }
    });
}

async function loadQuestions() {
    const container =
        document.getElementById("questions");

    if (!surveyId) {
        container.textContent =
            "No survey ID supplied.";

        return;
    }

    const response = await fetch(
        `/api/surveys/${surveyId}/questions`
    );

    if (!response.ok) {
        container.textContent =
            "Unable to load questions.";

        return;
    }

    const questions =
        await response.json();

    container.replaceChildren();

    questionHandlers.length = 0;
    hasUnsavedChanges = false;

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
            fragment.querySelector(
                ".survey-question"
            );

        if (question.required) {
            section.classList.add(
                "required-question-highlight"
            );
        }

        section.querySelector(
            ".question-prompt"
        ).textContent = question.prompt;

        const optionsContainer =
            section.querySelector(
                ".scheduling-options"
            );

        const shortTextInput =
            section.querySelector(
                ".short-text-input"
            );

        const shortTextCharacterCount =
            section.querySelector(
                ".short-text-character-count"
            );

        const selectAllButton =
            section.querySelector(
                ".select-all-button"
            );

        const clearAllButton =
            section.querySelector(
                ".select-none-button"
            );

        const relationshipSubjects =
            section.querySelector(
                ".relationship-subjects"
            );

        if (question.type === "SINGLE_SELECT" || question.type === "MULTI_SELECT") {
            await loadSelectQuestion(question, section);
        } else if (relationshipSubjects) {
            await loadRelationshipQuestion(
                question,
                section,
                relationshipSubjects
            );
        } else if (shortTextInput) {
            await loadShortTextQuestion(
                question,
                section,
                shortTextInput,
                shortTextCharacterCount
            );
        } else if (optionsContainer) {
            await loadSchedulingQuestion(
                question,
                section,
                optionsContainer,
                selectAllButton,
                clearAllButton
            );
        }

        container.appendChild(fragment);
    }
}

function initializeSurveySubmit() {
    const submitButton =
        document.getElementById(
            "submit-survey-button"
        );

    if (!submitButton) {
        return;
    }

    submitButton.disabled =
        !surveyAcceptingResponses;

    submitButton.addEventListener(
        "click",
        async () => {
            if (isSubmittingSurvey) return;
            for (const handler of questionHandlers) {
                if (!handler.validate()) {
                    return;
                }
            }

            submitButton.disabled = true;
            isSubmittingSurvey = true;
            pendingSubmissionId ??= crypto.randomUUID();
            const submissionId = pendingSubmissionId;
            let answersSaved = false;

            try {
                const csrfResponse =
                    await fetch("/csrf");

                if (!csrfResponse.ok) {
                    throw new Error(
                        "Unable to load CSRF token."
                    );
                }

                const csrf =
                    await csrfResponse.json();

                for (const handler of questionHandlers) {
                    const saved =
                        await handler.save(csrf);

                    if (!saved) {
                        throw new Error(
                            "Unable to save one or more survey responses."
                        );
                    }
                }

                answersSaved = true;
                // Each answer request has committed before this single survey-level notice.
                if (questionHandlers.length) {
                    const notice = await fetch(`/api/surveys/${surveyId}/submitted`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
                        body: JSON.stringify({ submissionId })
                    });
                    if (!notice.ok) throw new Error("Unable to confirm survey submission.");
                }
                pendingSubmissionId = null;
                hasUnsavedChanges = false;

                showToast(
                    "Survey responses saved.",
                    "success"
                );
            } catch (error) {
                console.error(error);

                showToast(
                    answersSaved ? "Your responses were saved, but submission confirmation failed. Please submit again."
                        : "Unable to save all survey responses.",
                    "error"
                );
            } finally {
                isSubmittingSurvey = false;

                submitButton.disabled =
                    !surveyAcceptingResponses;
            }
        }
    );
}

async function initialize() {
    await loadCurrentUser();
    await loadSurveyStatus();
    await loadQuestions();
    initializeSurveySubmit();
}

initialize();
