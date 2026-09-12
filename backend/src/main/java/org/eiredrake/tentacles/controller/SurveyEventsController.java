package org.eiredrake.tentacles.controller;

import org.eiredrake.tentacles.model.SurveyNotificationPreference;
import org.eiredrake.tentacles.repository.SurveyNotificationPreferenceRepository;
import org.eiredrake.tentacles.service.SurveyEventService;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/surveys")
public class SurveyEventsController {
  private final SurveyService surveys;
  private final SurveyEventService events;
  private final UserService users;
  private final SurveyNotificationPreferenceRepository preferences;

  public SurveyEventsController(SurveyService surveys, SurveyEventService events, UserService users,
    SurveyNotificationPreferenceRepository preferences) {
    this.surveys = surveys;
    this.events = events;
    this.users = users;
    this.preferences = preferences;
  }

  @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public ResponseEntity<SseEmitter> subscribe(@AuthenticationPrincipal OidcUser principal,
    @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
    @RequestParam(value = "cursor", required = false) String cursor) {
    Long userId = users.findOrCreate(principal).getId();
    return ResponseEntity.ok().header("Cache-Control", "no-cache, no-store")
      .header("X-Accel-Buffering", "no").body(events.subscribe(userId, lastEventId != null ? lastEventId : cursor));
  }

  public record NotificationPreference(boolean enabled) {}

  @GetMapping("/{surveyId}/notifications")
  public NotificationPreference preference(@PathVariable Long surveyId, @AuthenticationPrincipal OidcUser principal) {
    surveys.findById(surveyId);
    return new NotificationPreference(preferences.existsBySurveyIdAndUserId(surveyId, users.findOrCreate(principal).getId()));
  }

  @PutMapping("/{surveyId}/notifications")
  @Transactional
  public NotificationPreference preference(@PathVariable Long surveyId, @AuthenticationPrincipal OidcUser principal,
    @RequestBody NotificationPreference request) {
    var survey = surveys.findById(surveyId);
    var user = users.findOrCreate(principal);
    if (request.enabled()) {
      if (!preferences.existsBySurveyIdAndUserId(surveyId, user.getId())) {
        preferences.save(new SurveyNotificationPreference(survey, user));
      }
    } else {
      preferences.deleteBySurveyIdAndUserId(surveyId, user.getId());
    }
    return request;
  }
}
