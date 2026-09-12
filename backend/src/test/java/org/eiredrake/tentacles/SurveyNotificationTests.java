package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.eiredrake.tentacles.event.SurveyAdminEvent;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.SurveyEventService;
import org.eiredrake.tentacles.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SurveyNotificationTests {
  @Autowired MockMvc mvc;
  @Autowired EntityManager em;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired ApplicationEventPublisher publisher;
  @MockitoBean UserService users;
  @MockitoSpyBean SurveyEventService events;
  final List<MvcResult> streams = new ArrayList<>();
  final List<org.springframework.web.servlet.mvc.method.annotation.SseEmitter> emitters = new ArrayList<>();
  TransactionTemplate transaction;
  Survey survey;
  User participant, admin, otherAdmin;
  Long answerId;

  @BeforeEach void setup() {
    doAnswer(invocation -> {
      var emitter = (org.springframework.web.servlet.mvc.method.annotation.SseEmitter) invocation.callRealMethod();
      emitters.add(emitter);
      return emitter;
    }).when(events).subscribe(anyLong(), nullable(String.class));
    transaction = new TransactionTemplate(transactionManager);
    transaction.executeWithoutResult(status -> {
      participant = new User();
      participant.setOidcSubject(UUID.randomUUID().toString());
      participant.setUsername("arlo");
      participant.setDisplayName("Arlo");
      em.persist(participant);
      admin = new User();
      admin.setOidcSubject("admin-" + UUID.randomUUID());
      admin.setUsername("admin");
      em.persist(admin);
      otherAdmin = new User();
      otherAdmin.setOidcSubject("other-admin-" + UUID.randomUUID());
      otherAdmin.setUsername("other-admin");
      em.persist(otherAdmin);
      survey = new Survey();
      survey.setTitle("Foundations Survey");
      survey.setCreator(participant);
      survey.setStatus(SurveyStatus.OPEN);
      em.persist(survey);
      em.persist(new SurveyNotificationPreference(survey, admin));
      SingleSelectQuestion question = new SingleSelectQuestion();
      question.setSurvey(survey);
      question.setType(QuestionType.SINGLE_SELECT);
      question.setPrompt("Choose");
      question.setRequired(true);
      question.setDisplayOrder(1);
      em.persist(question);
      SingleSelectOption option = new SingleSelectOption();
      option.setQuestion(question);
      option.setLabel("Yes");
      em.persist(option);
      SingleSelectAnswer answer = new SingleSelectAnswer();
      answer.setQuestion(question);
      answer.setOption(option);
      answer.setUser(participant);
      em.persist(answer);
      answerId = answer.getId();
      SurveyParticipant entry = new SurveyParticipant();
      entry.setSurvey(survey);
      entry.setUser(participant);
      em.persist(entry);
    });
    when(users.findOrCreate(any())).thenAnswer(invocation -> {
      org.springframework.security.oauth2.core.oidc.user.OidcUser principal = invocation.getArgument(0);
      return principal.getSubject().equals(admin.getOidcSubject()) ? admin
        : principal.getSubject().equals(otherAdmin.getOidcSubject()) ? otherAdmin : participant;
    });
  }

  @AfterEach void closeStreams() throws Exception {
    emitters.forEach(org.springframework.web.servlet.mvc.method.annotation.SseEmitter::complete);
    for (MvcResult stream : streams) mvc.perform(asyncDispatch(stream));
  }

  MvcResult subscribe(Long userId, String cursor) throws Exception {
    User actor = userId.equals(admin.getId()) ? admin : otherAdmin;
    var request = get("/api/surveys/events").with(oidcLogin().idToken(token -> token.subject(actor.getOidcSubject()))
      .authorities(new SimpleGrantedAuthority("ROLE_ADMIN")));
    if (cursor != null) request.header("Last-Event-ID", cursor);
    MvcResult result = mvc.perform(request).andExpect(status().isOk()).andExpect(request().asyncStarted())
      .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
      .andExpect(header().string("X-Accel-Buffering", "no")).andReturn();
    streams.add(result);
    return result;
  }

  void submit(UUID id) throws Exception {
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + id + "\"}"))
      .andExpect(status().isOk());
  }

  SurveyAdminEvent event(String id, Long surveyId) {
    return new SurveyAdminEvent(id, surveyId, "submission.saved", Instant.now(),
      Map.of("userId", participant.getId(), "userName", "Arlo", "surveyTitle", "Foundations Survey"));
  }

  void awaitText(MvcResult stream, String text) {
    assertTimeoutPreemptively(Duration.ofSeconds(3), () -> {
      while (!stream.getResponse().getContentAsString().contains(text)) Thread.sleep(10);
    });
  }

  @Test void onlyAdminsCanSubscribe() throws Exception {
    mvc.perform(get("/api/surveys/events")).andExpect(status().is3xxRedirection());
    mvc.perform(get("/api/surveys/events").with(user("participant").roles("USER")))
      .andExpect(status().isForbidden());
    subscribe(admin.getId(), null);
  }

  @Test void publishedOncePerSubmissionAndOnlyToOptedInAdmins() throws Exception {
    MvcResult stream = subscribe(admin.getId(), null);
    MvcResult otherStream = subscribe(otherAdmin.getId(), null);
    UUID first = UUID.randomUUID();
    submit(first);
    awaitText(stream, first.toString());
    submit(first);
    assertEquals(1, stream.getResponse().getContentAsString().split("event:survey-event", -1).length - 1);
    assertFalse(otherStream.getResponse().getContentAsString().contains("submission.saved"));
    UUID updated = UUID.randomUUID();
    submit(updated);
    awaitText(stream, updated.toString());
    assertEquals(2, stream.getResponse().getContentAsString().split("event:survey-event", -1).length - 1);
    assertTrue(stream.getResponse().getContentAsString().contains("Arlo"));
  }

  @Test void eventIsDeliveredOnlyAfterCommitAndNeverAfterRollback() throws Exception {
    MvcResult stream = subscribe(admin.getId(), null);
    SurveyAdminEvent committed = event(UUID.randomUUID().toString(), survey.getId());
    transaction.executeWithoutResult(status -> {
      publisher.publishEvent(committed);
      verify(events, never()).afterSubmission(committed);
    });
    awaitText(stream, committed.id());
    SurveyAdminEvent rolledBack = event(UUID.randomUUID().toString(), survey.getId());
    transaction.executeWithoutResult(status -> { publisher.publishEvent(rolledBack); status.setRollbackOnly(); });
    verify(events, never()).afterSubmission(rolledBack);
    assertFalse(stream.getResponse().getContentAsString().contains(rolledBack.id()));
  }

  @Test void reconnectRecoversMissedEventsButFreshPagesDoNotReplayHistory() throws Exception {
    MvcResult first = subscribe(admin.getId(), null);
    var cursor = Pattern.compile("(?m)^id:([^\r\n]+)").matcher(first.getResponse().getContentAsString());
    assertTrue(cursor.find());
    UUID id = UUID.randomUUID();
    submit(id);
    awaitText(first, id.toString());
    MvcResult reconnected = subscribe(admin.getId(), cursor.group(1).trim());
    assertTrue(reconnected.getResponse().getContentAsString().contains(id.toString()));
    MvcResult fresh = subscribe(admin.getId(), null);
    assertFalse(fresh.getResponse().getContentAsString().contains(id.toString()));
  }

  void preference(User actor, boolean enabled) throws Exception {
    mvc.perform(put("/api/surveys/{id}/notifications", survey.getId())
      .with(oidcLogin().idToken(token -> token.subject(actor.getOidcSubject()))
        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":" + enabled + "}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(enabled));
  }

  @Test void preferencesDefaultOffArePersonalAndApplyToExistingStreams() throws Exception {
    mvc.perform(get("/api/surveys/{id}/notifications", survey.getId())
      .with(oidcLogin().idToken(token -> token.subject(otherAdmin.getOidcSubject()))
        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
    MvcResult stream = subscribe(otherAdmin.getId(), null);
    MvcResult originalAdmin = subscribe(admin.getId(), null);
    UUID before = UUID.randomUUID();
    submit(before);
    awaitText(originalAdmin, before.toString());
    assertFalse(stream.getResponse().getContentAsString().contains(before.toString()));
    preference(otherAdmin, true);
    preference(otherAdmin, true);
    UUID enabled = UUID.randomUUID();
    submit(enabled);
    awaitText(stream, enabled.toString());
    preference(otherAdmin, false);
    UUID disabled = UUID.randomUUID();
    submit(disabled);
    awaitText(originalAdmin, disabled.toString());
    assertFalse(stream.getResponse().getContentAsString().contains(disabled.toString()));
  }

  @Test void preferenceChangesRequireAdminAndCsrf() throws Exception {
    mvc.perform(get("/api/surveys/{id}/notifications", survey.getId()).with(oidcLogin()))
      .andExpect(status().isForbidden());
    mvc.perform(put("/api/surveys/{id}/notifications", survey.getId()).with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
      .andExpect(status().isForbidden());
    mvc.perform(put("/api/surveys/{id}/notifications", survey.getId())
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
      .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
      .andExpect(status().isForbidden());
  }

  @Test void globalStreamIncludesOtherSubscribedSurveysAndFiltersReplay() throws Exception {
    MvcResult stream = subscribe(admin.getId(), null);
    var cursor = Pattern.compile("(?m)^id:([^\r\n]+)").matcher(stream.getResponse().getContentAsString());
    assertTrue(cursor.find());
    Long otherId = transaction.execute(status -> {
      Survey other = new Survey();
      other.setTitle("Second survey");
      other.setCreator(em.find(User.class, participant.getId()));
      em.persist(other);
      em.persist(new SurveyNotificationPreference(other, em.find(User.class, admin.getId())));
      return other.getId();
    });
    SurveyAdminEvent other = event(UUID.randomUUID().toString(), otherId);
    transaction.executeWithoutResult(status -> publisher.publishEvent(other));
    awaitText(stream, other.id());
    UUID firstSurvey = UUID.randomUUID();
    submit(firstSurvey);
    awaitText(stream, firstSurvey.toString());
    preference(admin, false);
    MvcResult replay = subscribe(admin.getId(), cursor.group(1).trim());
    assertTrue(replay.getResponse().getContentAsString().contains(other.id()));
    assertFalse(replay.getResponse().getContentAsString().contains(firstSurvey.toString()));
  }

  @Test void optingInDoesNotReplayEarlierSubmissions() throws Exception {
    MvcResult stream = subscribe(otherAdmin.getId(), null);
    var cursor = Pattern.compile("(?m)^id:([^\r\n]+)").matcher(stream.getResponse().getContentAsString());
    assertTrue(cursor.find());
    UUID earlier = UUID.randomUUID();
    submit(earlier);
    preference(otherAdmin, true);
    MvcResult replay = subscribe(otherAdmin.getId(), cursor.group(1).trim());
    assertFalse(replay.getResponse().getContentAsString().contains(earlier.toString()));
    UUID later = UUID.randomUUID();
    submit(later);
    awaitText(replay, later.toString());
  }

  @Test void incompleteResponsesDoNotGenerateNotification() throws Exception {
    transaction.executeWithoutResult(status -> em.remove(em.find(SingleSelectAnswer.class, answerId)));
    MvcResult stream = subscribe(admin.getId(), null);
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().is4xxClientError());
    assertFalse(stream.getResponse().getContentAsString().contains("submission.saved"));
  }

  @Test void noticeRequiresCsrfAndAssignedParticipantButPreservesAdminAccess() throws Exception {
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().isForbidden());
    transaction.executeWithoutResult(status -> {
      User other = new User();
      other.setOidcSubject(UUID.randomUUID().toString());
      other.setUsername("other");
      em.persist(other);
      SurveyAssignment assignment = new SurveyAssignment();
      assignment.setSurvey(em.find(Survey.class, survey.getId()));
      assignment.setUser(other);
      em.persist(assignment);
    });
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().isForbidden());
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId())
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().isOk());
  }
}
