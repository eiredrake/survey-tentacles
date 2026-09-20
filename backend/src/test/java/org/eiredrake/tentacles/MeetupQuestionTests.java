package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.*;
import org.eiredrake.tentacles.controller.SurveyController;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.MeetupAnswerRepository;
import org.eiredrake.tentacles.service.UserService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MeetupQuestionTests {
  @Autowired SurveyController controller;
  @Autowired EntityManager em;
  @Autowired UserService users;
  @Autowired MeetupAnswerRepository answers;
  @Autowired org.eiredrake.tentacles.service.MeetupAvailabilityService availability;
  @Autowired MockMvc mvc;
  Survey survey;
  MeetupQuestion question;
  OidcUser principal;
  User voter;

  OidcUser principal(String name) {
    return new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")),
      new OidcIdToken("test", Instant.now(), Instant.now().plusSeconds(3600),
        Map.of("sub", UUID.randomUUID().toString(), "preferred_username", name)));
  }
  @BeforeEach void setup() {
    principal = principal("first"); voter = users.findOrCreate(principal);
    survey = new Survey(); survey.setTitle("Meet up"); survey.setCreator(voter); survey.setStatus(SurveyStatus.OPEN);
    em.persist(survey);
    Long id = (Long) controller.saveMeetupQuestion(survey.getId(), null, Map.of("prompt", "When are you available?")).get("id");
    em.flush(); em.clear();
    question = em.find(MeetupQuestion.class, id); survey = question.getSurvey();
  }
  void vote(OidcUser user, List<?> dates) {
    controller.answerMeetupQuestion(survey.getId(), question.getId(), user, Map.of("dateTimes", dates));
    em.flush(); em.clear(); question = em.find(MeetupQuestion.class, question.getId()); survey = question.getSurvey();
  }
  List<Map<String, Object>> mine() {
    return controller.getMeetupAnswersForUser(survey.getId(), question.getId(), voter.getId());
  }
  @Test void savesUserEnteredTimesAndResubmissionReplacesOnlyThatUsersAvailability() {
    vote(principal, List.of("2026-10-10T19:00:00-04:00", "2026-10-10T23:00:00Z", "2026-10-11T23:00:00Z"));
    assertEquals(2, mine().size());
    OidcUser other = principal("other");
    vote(other, List.of("2026-10-12T23:00:00Z"));
    vote(principal, List.of("2026-10-13T23:00:00Z"));
    assertEquals(Instant.parse("2026-10-13T23:00:00Z"), mine().getFirst().get("dateTime"));
    vote(principal, List.of());
    assertTrue(mine().isEmpty()); assertEquals(1, answers.count());
  }
  @Test void resultsCountPeopleAcrossOffsetsAndSortPopularityThenTime() {
    vote(principal, List.of("2026-10-10T19:00:00-04:00", "2026-10-11T23:00:00Z"));
    vote(principal("other"), List.of("2026-10-10T23:00:00Z", "2026-10-12T23:00:00Z"));
    survey.setStatus(SurveyStatus.CLOSED); em.flush();
    var counts = availability.results(question.getId());
    assertEquals(List.of(2L, 1L, 1L), counts.stream().map(org.eiredrake.tentacles.service.MeetupAvailabilityService.Result::votes).toList());
    assertEquals(Instant.parse("2026-10-10T23:00:00Z"), counts.getFirst().dateTime());
    assertTrue(counts.get(1).dateTime().isBefore(counts.get(2).dateTime()));
    assertEquals(true, controller.getMeetupResults(survey.getId(), question.getId()).get("available"));
  }
  @Test void resultsWaitUntilClosedOrPublishedAndClosedSurveysRejectEdits() {
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    for (SurveyStatus status : SurveyStatus.values()) {
      survey.setStatus(status);
      var result = controller.getMeetupResults(survey.getId(), question.getId());
      boolean closed = status == SurveyStatus.CLOSED || status == SurveyStatus.PUBLISHED;
      assertEquals(closed, result.get("available"));
      assertEquals(closed ? 1 : 0, ((List<?>) result.get("results")).size());
      if (status != SurveyStatus.OPEN) assertThrows(IllegalStateException.class, () ->
        controller.answerMeetupQuestion(survey.getId(), question.getId(), principal, Map.of("dateTimes", List.of())));
    }
    assertEquals(1, mine().size());
  }
  @Test void malformedTimesCannotErasePreviousAnswers() {
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    for (Object date : List.of("2026-10-10", "2026-10-10T19:00", "2026-02-30T19:00:00Z", "bad", 42,
        "2026-10-10T19:00:01Z", "2026-10-10T19:00:00.001Z")) {
      assertThrows(IllegalArgumentException.class, () -> controller.answerMeetupQuestion(survey.getId(),
        question.getId(), principal, Map.of("dateTimes", List.of(date))));
      assertEquals(1, mine().size());
    }
  }
  @Test void requiredAndCompletionFollowExistingQuestionSemantics() {
    question.setRequired(true); em.flush();
    assertThrows(IllegalArgumentException.class, () -> controller.answerMeetupQuestion(survey.getId(),
      question.getId(), principal, Map.of("dateTimes", List.of())));
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
    question.setRequired(false); em.flush(); vote(principal, List.of());
    assertEquals(false, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void promptEditsPreserveAnswersAndCopyHasNoAvailability() {
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    controller.saveMeetupQuestion(survey.getId(), question.getId(), Map.of("prompt", "New wording", "required", true));
    assertEquals(1, mine().size());
    Long copyId = (Long) controller.copySurvey(survey.getId(), principal).get("id");
    em.flush(); em.clear();
    Question copy = em.find(Survey.class, copyId).getQuestions().getFirst();
    assertInstanceOf(MeetupQuestion.class, copy); assertEquals("New wording", copy.getPrompt());
    assertTrue(copy.isRequired()); assertTrue(copy.getAnswers().isEmpty());
  }
  @Test void validatesQuestionOwnershipAndDeletesAnswersWithQuestion() {
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    assertThrows(IllegalArgumentException.class, () -> controller.getMeetupResults(-1L, question.getId()));
    controller.deleteQuestion(survey.getId(), question.getId()); em.flush(); em.clear();
    assertEquals(0, answers.count());
  }
  Map<String, String> window(String start, String end) {
    return Map.of("dateTime", "2026-10-10T" + start + ":00Z", "endDateTime", "2026-10-10T" + end + ":00Z");
  }

  @Test void mixedAvailabilityRoundTripsAndCountsOverlappingPeople() {
    vote(principal, List.of(window("18:00", "21:00")));
    assertEquals(Instant.parse("2026-10-10T21:00:00Z"), mine().getFirst().get("endDateTime"));
    vote(principal("second"), List.of(window("19:00", "22:00")));
    vote(principal("third"), List.of("2026-10-10T20:00:00Z"));
    var results = availability.results(question.getId());
    assertEquals(3, results.getFirst().votes());
    assertEquals(Instant.parse("2026-10-10T20:00:00Z"), results.getFirst().dateTime());
    assertNull(results.getFirst().endDateTime());
    assertEquals(2, results.get(1).votes());
    assertEquals(Instant.parse("2026-10-10T19:00:00Z"), results.get(1).dateTime());
    assertEquals(Instant.parse("2026-10-10T21:00:00Z"), results.get(1).endDateTime());
  }

  @Test void overlappingOwnWindowsAndPointsNeverCountTheSamePersonTwice() {
    vote(principal, List.of(window("18:00", "20:00"), window("19:00", "21:00"),
      window("18:00", "20:00"), "2026-10-10T20:00:00Z"));
    assertEquals(3, mine().size());
    var results = availability.results(question.getId());
    assertEquals(2, results.size());
    assertTrue(results.stream().allMatch(result -> result.votes() == 1));
    assertEquals(Instant.parse("2026-10-10T18:00:00Z"), results.getFirst().dateTime());
    assertEquals(Instant.parse("2026-10-10T21:00:00Z"), results.getFirst().endDateTime());
  }

  @Test void touchingWindowsDoNotOverlapAndEquivalentOffsetsStillMatch() {
    vote(principal, List.of(window("18:00", "19:00")));
    vote(principal("second"), List.of(window("19:00", "20:00")));
    vote(principal("third"), List.of("2026-10-10T15:00:00-04:00"));
    var results = availability.results(question.getId());
    assertEquals(2, results.getFirst().votes());
    assertNull(results.getFirst().endDateTime());
    assertTrue(results.stream().filter(result -> result.endDateTime() != null).allMatch(result -> result.votes() == 1));
  }

  @Test void invalidWindowsPreserveExistingAnswerAndMixedReplacementCanBeCleared() {
    vote(principal, List.of("2026-10-10T23:00:00Z"));
    for (Object value : List.of(window("20:00", "19:00"), window("20:00", "20:00"),
        Map.of("dateTime", "2026-10-10T20:00:00Z", "endDateTime", "bad"), Map.of("endDateTime", "2026-10-10T20:00:00Z"))) {
      assertThrows(IllegalArgumentException.class, () -> controller.answerMeetupQuestion(survey.getId(),
        question.getId(), principal, Map.of("dateTimes", List.of(value))));
      assertEquals(1, mine().size());
    }
    vote(principal, List.of(window("18:00", "19:00"), "2026-10-11T20:00:00Z"));
    assertEquals(2, mine().size());
    vote(principal, List.of()); assertTrue(mine().isEmpty()); assertTrue(availability.results(question.getId()).isEmpty());
  }

  @Test void dropdownAndEndpointsExposeMeetupAndRequireAdminForDefinitions() throws Exception {
    mvc.perform(get("/api/surveys/question-types").with(user("reader")))
      .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.name == 'MEETUP')].editorTemplateId").value("meetup-question-template"));
    String create = "/api/surveys/" + survey.getId() + "/questions/meetup";
    String update = "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/meetup";
    for (String url : List.of(create, update)) {
      mvc.perform(post(url).with(user("reader")).with(csrf())).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json")
        .content("{\"prompt\":\"Availability\"}")).andExpect(status().isOk());
    }
    mvc.perform(post("/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/answers/meetup")
      .with(oidcLogin().oidcUser(principal)).with(csrf()).contentType("application/json")
      .content("{\"dateTimes\":[\"2026-10-10T23:00:00Z\"]}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.responseCount").value(1));
  }
}
