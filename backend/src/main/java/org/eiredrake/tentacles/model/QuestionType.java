package org.eiredrake.tentacles.model;

public enum QuestionType {
    SCHEDULING("scheduling-question-template"),
    SINGLE_SELECT("single-select-question-template"),
    MULTI_SELECT("multi-select-question-template"),
    SHORT_TEXT("short-text-question-template");

    private final String editorTemplateId;

    QuestionType(String editorTemplateId) {
        this.editorTemplateId = editorTemplateId;
    }

    public String getEditorTemplateId() {
        return editorTemplateId;
    }
}