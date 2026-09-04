const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

let surveyStatus = null;
let currentUser = null;
let surveyAcceptingResponses = false;

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
      surveyAcceptingResponses = survey.acceptingResponses;
      document.getElementById("survey-title").textContent = survey.title;
    }
}        



async function refreshSchedulingStatus(question, section) {
    let statusContainer =
        section.querySelector(".scheduling-status");

    if (!statusContainer) {
        statusContainer =
            document.createElement("div");

        statusContainer.className =
            "scheduling-status";

        section.appendChild(
            statusContainer
        );
    }

    statusContainer.innerHTML = "";

    const resultsHeading =
        document.createElement("h3");

    resultsHeading.textContent =
        "Results";

    statusContainer.appendChild(
        resultsHeading
    );

    const resultsResponse = await fetch(
        `/api/surveys/${surveyId}/questions/${question.id}/results`
    );

    if (!resultsResponse.ok) {
        showToast(
            "Unable to load results.",
            "error"
        );
        return;
    }

    const results =
        await resultsResponse.json();

    const maxVotes = Math.max(
        0,
        ...results.map(
            result => result.votes
        )
    );

    const resultsList =
        document.createElement("div");

    resultsList.className =
        "scheduling-results";

    for (const result of results) {
        const item =
            document.createElement("div");

        item.className =
            "scheduling-result";

        if (
            maxVotes > 0 &&
            result.votes === maxVotes
        ) {
            item.classList.add(
                "scheduling-result-leading"
            );
        }

        const header =
            document.createElement("div");

        header.className =
            "scheduling-result-header";

        const date =
            document.createElement("span");

        date.textContent =
            formatSchedulingDate(
                result.date,
                result.dateTime
            );

        const votes =
            document.createElement("span");

        votes.textContent =
            `${result.votes} vote${result.votes === 1 ? "" : "s"}`;

        header.appendChild(date);
        header.appendChild(votes);

        const barTrack =
            document.createElement("div");

        barTrack.className =
            "scheduling-result-track";

        const bar =
            document.createElement("div");

        bar.className =
            "scheduling-result-bar";

        const percentage =
            maxVotes > 0
                ? (result.votes / maxVotes) * 100
                : 0;

        bar.style.width =
            `${percentage}%`;

        barTrack.appendChild(bar);

        item.appendChild(header);
        item.appendChild(barTrack);

        resultsList.appendChild(item);
    }

    statusContainer.appendChild(
        resultsList
    );
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
        showToast(
            "Unable to load short text answers.",
            "error"
        );
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

        name.textContent = answer.name ||  answer.username;

        const value = document.createElement("p");

        value.textContent = answer.value;

        answerBlock.appendChild(name);
        answerBlock.appendChild(value);

        statusContainer.appendChild(answerBlock);
    }
}

function createRelationshipScoreControl(className, subjectId) {
    const control = document.createElement("div");

    control.className = `relationship-score-control ${className}`;
    control.dataset.subjectId = subjectId;

    let score = 0;

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.className = "relationship-score-button";
    decreaseButton.title = "Decrease";
    decreaseButton.setAttribute("aria-label", "Decrease score");
    decreaseButton.innerHTML =
        '<i class="fa-solid fa-minus"></i>';

    const display = document.createElement("span");
    display.className = "relationship-score-display";

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.className = "relationship-score-button";
    increaseButton.title = "Increase";
    increaseButton.setAttribute("aria-label", "Increase score");
    increaseButton.innerHTML =
        '<i class="fa-solid fa-plus"></i>';

    const updateDisplay = () => {
        display.replaceChildren();

        if (score < 0) {
            for (let i = 0; i < Math.abs(score); i++) {
                const icon = document.createElement("span");
        
                icon.className = "fa-solid fa-heart-crack relationship-score-dagger";
                //icon.textContent = "🗡︎";
        
                display.appendChild(icon);
            }
        
            const value = document.createElement("span");
            value.className = "relationship-score-value";
            value.textContent = String(score);
        
            display.appendChild(value);
        } else if (score > 0) {
            for (let i = 0; i < score; i++) {
                const icon = document.createElement("i");
                icon.className = "fa-solid fa-heart relationship-score-heart";

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
            score === 0
                ? "No opinion"
                : `Score ${score}`
        );
    };

    /*
     * Preserve the old .value interface so the existing
     * Relationship save/reload code can continue using it.
     */
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
        }
    });

    increaseButton.addEventListener("click", () => {
        if (score < 5) {
            score++;
            updateDisplay();
        }
    });

    control.appendChild(decreaseButton);
    control.appendChild(display);
    control.appendChild(increaseButton);

    updateDisplay();

    return control;
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

      const section = fragment.querySelector(".survey-question");

      if (question.required) {
        section.classList.add("required-question-highlight");
    }

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

      const shortTextInput = section.querySelector(".short-text-input");
  
      const shortTextCharacterCount = section.querySelector(".short-text-character-count");

      const selectAllButton = section.querySelector(".select-all-button");
      
      const clearAllButton = section.querySelector(".select-none-button");          

      const relationshipSubjects =
      section.querySelector(".relationship-subjects");
  
        if (relationshipSubjects && submitButton) {
            const detailResponse = await fetch(`/api/surveys/${surveyId}/questions/${question.id}`);
        
            if (!detailResponse.ok) {
                showToast(
                    "Unable to load relationship question.",
                    "error"
                );
                continue;
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
                continue;
            }
            
            const answers = await answersResponse.json();
            
            const myAnswers = new Map(
                answers
                    .filter(
                        answer => answer.userId === currentUser.id
                    )
                    .map(
                        answer => [
                            answer.subjectId,
                            answer
                        ]
                    )
            );
        
            relationshipSubjects.replaceChildren();
        
            for (const subject of detail.subjects) {
                const row = document.createElement("tr");
        
                const nameCell = document.createElement("td");
        
                nameCell.textContent = subject.name;
        
                if (subject.description) {
                    nameCell.title = subject.description;
                }
        
                const likeCell = document.createElement("td");
        
                const likeInput = createRelationshipScoreControl(
                    "relationship-like",
                    subject.id
                );
        
       
                likeCell.appendChild(likeInput);
        
                const trustCell = document.createElement("td");
        
                const trustInput = createRelationshipScoreControl(
                    "relationship-trust",
                    subject.id
                );
        
       
                trustCell.appendChild(trustInput);
                
        
                const commentCell = document.createElement("td");
        
                const commentInput = document.createElement("textarea");
        
                commentInput.maxLength = 500;
                commentInput.rows = 2;
                commentInput.className = "relationship-comment";
                commentInput.dataset.subjectId = subject.id;

                const existingAnswer = myAnswers.get(subject.id);

                if (existingAnswer) {
                    likeInput.value = String(existingAnswer.likeScore ?? 0);
                    trustInput.value = String(existingAnswer.trustScore ?? 0);
                    commentInput.value = existingAnswer.comment ?? "";
                }                
        
                commentCell.appendChild(commentInput);
        
                row.appendChild(nameCell);
                row.appendChild(likeCell);
                row.appendChild(trustCell);
                row.appendChild(commentCell);
        
                relationshipSubjects.appendChild(row);
            }
        
            submitButton.disabled = !surveyAcceptingResponses;

            submitButton.addEventListener(
                "click",
                async () => {
                    const rows = [
                        ...relationshipSubjects.querySelectorAll("tr")
                    ];
            
                    const responses = rows.map(row => {
                        const likeSelect =
                            row.querySelector(".relationship-like");
            
                        const trustSelect =
                            row.querySelector(".relationship-trust");
            
                        const commentInput =
                            row.querySelector(".relationship-comment");
            
                        return {
                            subjectId:
                                Number(likeSelect.dataset.subjectId),
            
                            likeScore:
                                likeSelect.value === ""
                                    ? null
                                    : Number(likeSelect.value),
            
                            trustScore:
                                trustSelect.value === ""
                                    ? null
                                    : Number(trustSelect.value),
            
                            comment:
                                commentInput.value.trim()
                        };
                    });
            
                    const hasRating = responses.some(
                        response =>
                            response.likeScore !== 0 ||
                            response.trustScore !== 0
                    );
            
                    if (question.required && !hasRating) {
                        section.classList.add(
                            "question-required-error"
                        );
            
                        showToast(
                            "This question is required. Please provide at least one Like or Trust rating.",
                            "error"
                        );
            
                        setTimeout(() => {
                            section.classList.remove(
                                "question-required-error"
                            );
                        }, 1200);
            
                        return;
                    }
            
                    const csrfResponse =
                        await fetch("/csrf");
            
                    const csrf =
                        await csrfResponse.json();
            
                    const saveResponse = await fetch(
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
                                responses: responses
                            })
                        }
                    );
            
                    if (!saveResponse.ok) {
                        showToast(
                            "Unable to save response.",
                            "error"
                        );
                        return;
                    }
            
                    showToast(
                        "Response saved.",
                        "success"
                    );
                }
            );            
        }

      if (shortTextInput && submitButton) {
        shortTextInput.disabled = !surveyAcceptingResponses;
    
        submitButton.disabled = !surveyAcceptingResponses;
    
        const answersResponse = await fetch(
            `/api/surveys/${surveyId}/questions/${question.id}/answers/short-text`
        );
    
        if (!answersResponse.ok) {
            showToast(
                "Unable to load existing answer.",
                "error"
            );
            continue;
        }
    
        const answers =
            await answersResponse.json();
    
        const existingAnswer = answers.find(
            answer => answer.userId === currentUser.id
        );
    
        if (existingAnswer) {
            shortTextInput.value =
                existingAnswer.value;
        }
    
        const updateCharacterCount = () => {
            shortTextCharacterCount.textContent =
                `${shortTextInput.value.length} / 500`;
        };
    
        updateCharacterCount();
    
        shortTextInput.addEventListener(
            "input",
            updateCharacterCount
        );
    
        submitButton.addEventListener(
            "click",
            async () => {
                const value =
                    shortTextInput.value.trim();
    
                if (
                    question.required &&
                    value.length === 0
                ) {
                    section.classList.add(
                        "question-required-error"
                    );
    
                    showToast(
                        "This question is required. Please enter a response.",
                        "error"
                    );
    
                    setTimeout(() => {
                        section.classList.remove(
                            "question-required-error"
                        );
                    }, 1200);
    
                    return;
                }
    
                const csrfResponse =
                    await fetch("/csrf");
    
                const csrf =
                    await csrfResponse.json();
    
                const saveResponse = await fetch(
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
                            value: value
                        })
                    }
                );
    
                if (!saveResponse.ok) {
                    showToast(
                        "Unable to save response.",
                        "error"
                    );
                    return;
                }
    
                showToast(
                    "Response saved.",
                    "success"
                );

               // await refreshShortTextStatus(
               //     question,
               //     section
               // );                
            }
        );

        //await refreshShortTextStatus(
        //    question,
        //    section
        //);
    }      

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

              checkbox.disabled = !surveyAcceptingResponses;

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

          submitButton.disabled = !surveyAcceptingResponses;
          if (selectAllButton) {
              selectAllButton.disabled = !surveyAcceptingResponses;
          }
          
          if (clearAllButton) {
              clearAllButton.disabled = !surveyAcceptingResponses;
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

                  if (question.required && selected.length === 0) {
                    section.classList.add("question-required-error");
                
                    showToast(
                        "This question is required. Please select at least one option.",
                        "error"
                    );
                
                    setTimeout(() => {
                        section.classList.remove("question-required-error");
                    }, 1200);
                
                    return;
                }                  

                  const csrfResponse = await fetch("/csrf");

                  const csrf = await csrfResponse.json();

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

                      //await refreshSchedulingStatus(
                      //    question,
                      //    section
                      //);
                  } else {
                      showToast(
                          "Unable to save response.",
                          "error"
                      );
                  }
              }
          );

          //await refreshSchedulingStatus(
          //    question,
          //    section
          //);
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