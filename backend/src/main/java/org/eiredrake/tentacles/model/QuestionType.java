package org.eiredrake.tentacles.model;

public enum QuestionType {
    SCHEDULING(
        "scheduling-question-template",
        "scheduling-participant-template"
    ),
    SINGLE_SELECT(
        "single-select-question-template",
        "single-select-participant-template"
    ),
    MULTI_SELECT(
        "multi-select-question-template",
        "multi-select-participant-template"
    ),
    SHORT_TEXT(
        "short-text-question-template",
        "short-text-participant-template"
    );

    private final String editorTemplateId;
    private final String participantTemplateId;

    QuestionType(
        String editorTemplateId,
        String participantTemplateId
    ) {
        this.editorTemplateId = editorTemplateId;
        this.participantTemplateId = participantTemplateId;
    }

    public String getEditorTemplateId() {
        return editorTemplateId;
    }

    public String getParticipantTemplateId() {
        return participantTemplateId;
    }
}