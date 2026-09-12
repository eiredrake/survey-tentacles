package org.eiredrake.tentacles.event;

import java.time.Instant;
import java.util.Map;

public record SurveyAdminEvent(String id, Long surveyId, String type, Instant occurredAt, Map<String, Object> data) {
  public SurveyAdminEvent {
    data = Map.copyOf(data);
  }
}
