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
        document.getElementById("user").textContent = "Unable to load user.";
        return;
    }

    const user = await response.json();

    currentUser = user;

    document.getElementById("user").textContent = `${user.name}`;
}

async function loadSurveys() {
  const response = await fetch("/api/surveys");

  if (!response.ok) {
      document.getElementById("active-surveys").innerHTML =
          '<tr><td colspan="4">Unable to load surveys.</td></tr>';

      document.getElementById("inactive-surveys").innerHTML = "";

      return;
  }

  const surveys = await response.json();

  const activeContainer =
      document.getElementById("active-surveys");

  const inactiveContainer =
      document.getElementById("inactive-surveys");

  const isAdmin =
      currentUser.authorities?.includes("ROLE_ADMIN");

  document
      .querySelectorAll(".status-heading")
      .forEach(heading => {
          heading.textContent =
              isAdmin ? "Status" : "Completed";
      });

  document
      .querySelectorAll(".actions-column")
      .forEach(element => {
          element.style.display =
              isAdmin ? "" : "none";
      });      

  activeContainer.replaceChildren();
  inactiveContainer.replaceChildren();

  for (const survey of surveys) {
      const item = document.createElement("tr");

      const nameCell = document.createElement("td");

      const link = document.createElement("a");
      link.href = `/survey.html?id=${survey.id}`;
      link.textContent = survey.title;

      nameCell.appendChild(link);

      const requiredCell = document.createElement("td");

      if (survey.required) {
        requiredCell.innerHTML = '<i class="fa-solid fa-check" title="Required"></i>';
    
        if (!isAdmin && !survey.completed) {
            item.classList.add("required-highlight");
        }
    }

      const statusCell = document.createElement("td");

      if (!isAdmin && survey.completed) {
          statusCell.innerHTML =
              '<i class="fa-solid fa-check" title="Completed"></i>';
      }

      const actionsCell = document.createElement("td");
      actionsCell.className = "actions-column";

      if (!isAdmin) {
        actionsCell.style.display = "none";
      }

      item.appendChild(nameCell);
      item.appendChild(requiredCell);
      item.appendChild(statusCell);
      item.appendChild(actionsCell);

      if (isAdmin) {
        const shareButton = document.createElement("button");

        shareButton.type = "button";
        shareButton.className = "icon-button";
        shareButton.title = "Copy survey link";
        
        shareButton.setAttribute(
            "aria-label",
            "Copy survey link"
        );
        
        shareButton.innerHTML =
            '<i class="fa-solid fa-share-nodes"></i>';
        
        shareButton.addEventListener(
            "click",
            async () => {
                const shareUrl =
                    `${window.location.origin}/s/${survey.id}`;
        
                try {
                    await navigator.clipboard.writeText(
                        shareUrl
                    );
        
                    showToast(
                        "Survey link copied.",
                        "success"
                    );
                } catch {
                    showToast(
                        "Unable to copy survey link.",
                        "error"
                    );
                }
            }
        );
        
        actionsCell.appendChild(shareButton);

        const viewLink = document.createElement("a");
        viewLink.href =
            `/survey-view.html?id=${survey.id}`;
        viewLink.className = "icon-button";
        viewLink.title = "View survey";
        viewLink.setAttribute(
            "aria-label",
            "View survey"
        );
        viewLink.innerHTML =
            '<i class="fa-solid fa-eye"></i>';
        
        actionsCell.appendChild(viewLink);

        const copyButton = document.createElement("button");

        copyButton.type = "button";
        copyButton.className = "icon-button";
        copyButton.title = "Copy survey";

        copyButton.setAttribute(
            "aria-label",
            "Copy survey"
        );

        copyButton.innerHTML =
            '<i class="fa-solid fa-copy"></i>';

        copyButton.addEventListener(
            "click",
            async () => {
                const csrfResponse =
                    await fetch("/csrf");

                const csrf =
                    await csrfResponse.json();

                const copyResponse = await fetch(
                    `/api/surveys/${survey.id}/copy`,
                    {
                        method: "POST",
                        headers: {
                            [csrf.headerName]:
                                csrf.token
                        }
                    }
                );

                if (!copyResponse.ok) {
                    showToast(
                        "Unable to copy survey.",
                        "error"
                    );
                    return;
                }

                const copiedSurvey =
                    await copyResponse.json();

                window.location.href =
                    `/survey-edit.html?id=${copiedSurvey.id}`;
            }
        );

        actionsCell.appendChild(copyButton);


          const editLink = document.createElement("a");
          editLink.href =
              `/survey-edit.html?id=${survey.id}`;
          editLink.className = "icon-button";
          editLink.title = "Edit survey";
          editLink.setAttribute(
              "aria-label",
              "Edit survey"
          );
          editLink.innerHTML =
              '<i class="fa-solid fa-pen-to-square"></i>';

          actionsCell.appendChild(editLink);

          const deleteButton = document.createElement("button");
      
            deleteButton.type = "button";
            deleteButton.className = "icon-button";
            deleteButton.innerHTML =
                '<i class="fa-solid fa-xmark"></i>';
            
            deleteButton.title = "Delete survey";
            
            deleteButton.setAttribute(
                "aria-label",
                "Delete survey"
            );
            
            deleteButton.addEventListener(
                "click",
                async () => {
            
                    if (survey.everPublished) {
                        const confirmation = prompt(
                            `PERMANENTLY DELETE "${survey.title}"?\n\n` +
                            "This survey has been published before and may contain real response data.\n\n" +
                            "This cannot be undone.\n\n" +
                            "Type DELETE to continue:"
                        );
            
                        if (confirmation !== "DELETE") {
                            return;
                        }
                    } else {
                        const confirmed = confirm(
                            `Delete "${survey.title}"? This cannot be undone.`
                        );
            
                        if (!confirmed) {
                            return;
                        }
                    }
            
                    const csrfResponse =
                        await fetch("/csrf");
            
                    const csrf =
                        await csrfResponse.json();
            
                    const deleteResponse = await fetch(
                        `/api/surveys/${survey.id}`,
                        {
                            method: "DELETE",
                            headers: {
                                [csrf.headerName]:
                                    csrf.token
                            }
                        }
                    );
            
                    if (!deleteResponse.ok) {
                        showToast(
                            "Unable to delete survey.",
                            "error"
                        );
                        return;
                    }
            
                    showToast(
                        "Survey deleted.",
                        "success"
                    );
            
                    await loadSurveys();
                }
            );
            
            actionsCell.appendChild(
                deleteButton
            );

          const statusSelect =
              document.createElement("select");

          statusSelect.hidden = true;

          const statusButton =
              document.createElement("button");

          statusButton.type = "button";
          statusButton.className = "icon-button";
          statusButton.title = survey.status;

          statusButton.setAttribute(
              "aria-label",
              `Change survey status: ${survey.status}`
          );

          statusButton.innerHTML =
              `<i class="fa-solid ${survey.statusIcon}"></i>`;

          statusCell.appendChild(statusButton);

          for (const status of surveyStatuses) {
              const option =
                  document.createElement("option");

              option.value = status;

              option.textContent =
                  status.charAt(0) +
                  status.slice(1).toLowerCase();

              if (status === survey.status) {
                  option.selected = true;
              }

              statusSelect.appendChild(option);
          }

          statusButton.addEventListener(
              "click",
              () => {
                  statusButton.hidden = true;
                  statusSelect.hidden = false;
                  statusSelect.focus();
              }
          );

          statusSelect.addEventListener(
              "change",
              async () => {
                  const previousStatus =
                      survey.status;

                  const csrfResponse =
                      await fetch("/csrf");

                  const csrf =
                      await csrfResponse.json();

                  const statusResponse = await fetch(
                      `/api/surveys/${survey.id}/status`,
                      {
                          method: "POST",
                          headers: {
                              "Content-Type":
                                  "application/json",
                              [csrf.headerName]:
                                  csrf.token
                          },
                          body: JSON.stringify({
                              status:
                                  statusSelect.value
                          })
                      }
                  );

                  if (statusResponse.ok) {
                      const updatedSurvey =
                          await statusResponse.json();

                      survey.status =
                          updatedSurvey.status;

                      survey.statusIcon =
                          updatedSurvey.statusIcon;

                      statusButton.title =
                          survey.status;

                      statusButton.setAttribute(
                          "aria-label",
                          `Change survey status: ${survey.status}`
                      );

                      statusButton.innerHTML =
                          `<i class="fa-solid ${survey.statusIcon}"></i>`;

                      statusSelect.hidden = true;
                      statusButton.hidden = false;
                      
                      await loadSurveys();
                  } else {
                      statusSelect.value =
                          previousStatus;

                      showToast(
                          "Unable to update survey status",
                          "error"
                      );
                  }
              }
          );

          statusCell.appendChild(statusSelect);
      }

      if (survey.active) {
          activeContainer.appendChild(item);
      } else {
          inactiveContainer.appendChild(item);
      }
  }
}

function setupCreateSurveyButton() {
    const button = document.getElementById("create-survey-button");

    const isAdmin =
    currentUser.authorities?.includes("ROLE_ADMIN");

    if (!isAdmin) {
    button.hidden = true;
    return;
    }  

  button.addEventListener("click", async () => {
      const csrfResponse = await fetch("/csrf");
      const csrf = await csrfResponse.json();

      const response = await fetch("/api/surveys", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              [csrf.headerName]: csrf.token
          },
          body: JSON.stringify({
              title: "New Survey"
          })
      });

      if (!response.ok) {
          alert("Unable to create survey.");
          return;
      }

      const survey = await response.json();

      window.location.href = `/survey-edit.html?id=${survey.id}`;
  });
}

async function initialize() {
  await loadUser();
  await loadSurveyStatuses();
  await loadSurveys();
  setupCreateSurveyButton();
}

initialize();