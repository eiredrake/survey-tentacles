package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import jakarta.servlet.ServletException;
import java.time.Instant;
import java.util.UUID;
import org.eiredrake.tentacles.model.QuestionType;
import org.eiredrake.tentacles.model.ShortTextQuestion;
import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyStatus;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.repository.AnswerRepository;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SurveyAutoCloseTests {
  @Autowired EntityManager em;
  @Autowired MockMvc mvc;
  @Autowired SurveyService surveys;
  @Autowired AnswerRepository answers;
  @MockitoBean UserService users;
  Survey survey;
  ShortTextQuestion question;
  User alice, bob, carol;

  @BeforeEach void setup() {
    alice = user("alice"); bob = user("bob"); carol = user("carol");
    survey = new Survey(); survey.setTitle("Close test"); survey.setCreator(alice); survey.setStatus(SurveyStatus.OPEN);
    em.persist(survey);
    question = new ShortTextQuestion(); question.setSurvey(survey); question.setType(QuestionType.SHORT_TEXT);
    question.setPrompt("Response"); question.setDisplayOrder(1); em.persist(question); survey.getQuestions().add(question);
    when(users.findOrCreate(any())).thenAnswer(invocation -> userFor((OidcUser) invocation.getArgument(0)));
  }

  @Test void futureDeadlineLeavesResponsesOpenAndPastDeadlineRejectsThem() throws Exception {
    survey.setAutoCloseAt(Instant.now().plusSeconds(60));
    submit("alice", "First").andExpect(status().isOk());
    survey.setAutoCloseAt(Instant.now().minusSeconds(60)); em.flush();
    assertClosed("bob", "Second");
  }

  @Test void thresholdCountsDistinctRespondentsAndAcceptsTheBoundaryParticipant() throws Exception {
    survey.setAutoCloseParticipantCount(2);
    submit("alice", "First").andExpect(status().isOk());
    submit("alice", "Updated").andExpect(status().isOk());
    assertEquals(1, answers.countRespondentsBySurveyId(survey.getId()));
    submit("bob", "Second").andExpect(status().isOk());
    assertEquals(2, answers.countRespondentsBySurveyId(survey.getId()));
    assertClosed("carol", "Third");
  }

  @Test void manualClosureStillOverridesAutomaticSettings() throws Exception {
    survey.setAutoCloseAt(Instant.now().plusSeconds(60));
    survey.setAutoCloseParticipantCount(10);
    survey.setStatus(SurveyStatus.CLOSED); em.flush();
    assertFalse(surveys.isAcceptingResponses(survey));
    assertClosed("alice", "Blocked");
  }

  @Test void automaticSettingsRequireAdminAndCanBeCleared() throws Exception {
    String path = "/api/surveys/" + survey.getId() + "/auto-close";
    String settings = "{\"closeAt\":\"2030-01-02T03:04:00Z\",\"participantCount\":2}";
    mvc.perform(post(path).with(oidcLogin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(settings))
      .andExpect(status().isForbidden());
    mvc.perform(post(path).with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(settings))
      .andExpect(status().isOk()).andExpect(jsonPath("$.autoCloseParticipantCount").value(2));
    mvc.perform(post(path).with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.autoCloseAt").doesNotExist())
      .andExpect(jsonPath("$.autoCloseParticipantCount").doesNotExist());
  }

  @Test void invalidParticipantThresholdIsRejected() throws Exception {
    String path = "/api/surveys/" + survey.getId() + "/auto-close";
    for (String count : new String[] { "0", "-1", "1.5", "many" }) {
      mvc.perform(post(path).with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content("{\"participantCount\":\"" + count + "\"}")).andExpect(status().is4xxClientError());
    }
  }

  @Test void listRepresentsManualAndAutomaticClosureUsingEffectiveStatus() throws Exception {
    survey.setStatus(SurveyStatus.CLOSED); em.flush();
    assertListStatus("MANUAL");

    survey.setStatus(SurveyStatus.OPEN); survey.setAutoCloseAt(Instant.now().minusSeconds(60)); em.flush();
    assertListStatus("DEADLINE");

    survey.setAutoCloseAt(null); survey.setAutoCloseParticipantCount(1); em.flush();
    submit("alice", "First").andExpect(status().isOk());
    assertListStatus("PARTICIPANT_LIMIT");
  }

  @Test void futureDeadlineRemainsOpenInTheSurveyList() throws Exception {
    survey.setAutoCloseAt(Instant.now().plusSeconds(60)); em.flush();
    mvc.perform(get("/api/surveys").with(admin())).andExpect(status().isOk())
      .andExpect(jsonPath("$[0].status").value("OPEN"))
      .andExpect(jsonPath("$[0].statusIcon").value("fa-lock-open"))
      .andExpect(jsonPath("$[0].active").value(true))
      .andExpect(jsonPath("$[0].acceptingResponses").value(true));
  }

  private void assertListStatus(String reason) throws Exception {
    mvc.perform(get("/api/surveys").with(admin())).andExpect(status().isOk())
      .andExpect(jsonPath("$[0].status").value("CLOSED"))
      .andExpect(jsonPath("$[0].statusIcon").value("fa-lock"))
      .andExpect(jsonPath("$[0].active").value(false))
      .andExpect(jsonPath("$[0].acceptingResponses").value(false))
      .andExpect(jsonPath("$[0].closureReason").value(reason));
  }
  private User user(String username) {
    User user = new User(); user.setOidcSubject(UUID.randomUUID().toString());
    user.setUsername(username); user.setDisplayName(username); em.persist(user); return user;
  }

  private User userFor(OidcUser oidcUser) {
    return switch (oidcUser.getSubject()) { case "bob" -> bob; case "carol" -> carol; default -> alice; };
  }

  private void assertClosed(String subject, String value) {
    assertThrows(ServletException.class, () -> submit(subject, value));
  }
  private ResultActions submit(String subject, String value) throws Exception {
    String path = "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/answers/short-text";
    return mvc.perform(post(path).with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"" + value + "\"}"));
  }

  private org.springframework.test.web.servlet.request.RequestPostProcessor admin() {
    return oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
  }
}