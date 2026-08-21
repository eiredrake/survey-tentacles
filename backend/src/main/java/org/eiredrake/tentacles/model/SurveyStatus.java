package org.eiredrake.tentacles.model;

public enum SurveyStatus {
    DEVELOPMENT("fa-file-pen"),
    OPEN("fa-lock-open"),
    CLOSED("fa-unlock"),
    PUBLISHED("fa-book");

    private final String icon;

    SurveyStatus(String icon) {
        this.icon = icon;
    }

    public String getIcon() {
        return icon;
    }
}