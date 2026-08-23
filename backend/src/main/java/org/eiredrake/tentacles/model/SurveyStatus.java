package org.eiredrake.tentacles.model;

public enum SurveyStatus {
    DEVELOPMENT("fa-file-pen", false),
    OPEN("fa-lock-open", true),
    CLOSED("fa-unlock", false),
    PUBLISHED("fa-book", false);

    private final String icon;
    private final boolean acceptingResponses;

    SurveyStatus(
        String icon,
        boolean acceptingResponses
    ) {
        this.icon = icon;
        this.acceptingResponses = acceptingResponses;
    }

    public String getIcon() {
        return icon;
    }

    public boolean isAcceptingResponses() {
        return acceptingResponses;
    }
}