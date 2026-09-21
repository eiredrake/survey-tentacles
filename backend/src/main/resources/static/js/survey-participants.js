// Shared read path for survey View and an individual participant's answers.
async function loadSurveyParticipants(surveyId) {
  try {
    const response = await fetch(`/api/surveys/${surveyId}/participants`);
    if (!response.ok) throw new Error("Unable to load participants.");
    return await response.json();
  } catch (error) {
    showToast("Unable to load participants.", "error");
    return null;
  }
}
