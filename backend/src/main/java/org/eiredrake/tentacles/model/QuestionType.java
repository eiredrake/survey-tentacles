package org.eiredrake.tentacles.model;

public enum QuestionType {
    SCHEDULING(
        "scheduling-question-template",
        "scheduling-participant-template",
        "scheduling-view-template"
    ),
    SINGLE_SELECT(
        "single-select-question-template",
        "single-select-participant-template",
        "single-select-view-template"
    ),
    MULTI_SELECT(
        "multi-select-question-template",
        "multi-select-participant-template",
        "multi-select-view-template"
    ),
    SHORT_TEXT(
        "short-text-question-template",
        "short-text-participant-template",
        "short-text-view-template"
    );

    private final String editorTemplateId;
    private final String participantTemplateId;
    private final String viewTemplateId;

    QuestionType(
        String editorTemplateId,
        String participantTemplateId,
        String viewTemplateId
    ) {
        this.editorTemplateId = editorTemplateId;
        this.participantTemplateId = participantTemplateId;
        this.viewTemplateId = viewTemplateId;
    }

    public String getEditorTemplateId() {
        return editorTemplateId;
    }

    public String getParticipantTemplateId() {
        return participantTemplateId;
    }

    public String getViewTemplateId() {
        return viewTemplateId;
    }    
}