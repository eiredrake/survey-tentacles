package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.util.*;
import org.eiredrake.tentacles.controller.SurveyController;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.RankedChoiceAnswerRepository;
import org.eiredrake.tentacles.service.UserService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RankedChoiceQuestionTests {
  @Autowired SurveyController controller;
  @Autowired EntityManager em;
  @Autowired UserService users;
  @Autowired RankedChoiceAnswerRepository answers;
  @Autowired MockMvc mvc;
  Survey survey;
  RankedChoiceQuestion question;
  OidcUser principal;
  User voter;

  @BeforeEach void setup() {
    principal = mock(OidcUser.class);
    when(principal.getSubject()).thenReturn(UUID.randomUUID().toString());
    when(principal.getPreferredUsername()).thenReturn("ranked-voter");
    when(principal.getName()).thenReturn("ranked-voter");
    voter = users.findOrCreate(principal);
    survey = new Survey();
    survey.setTitle("Election"); survey.setCreator(voter); survey.setStatus(SurveyStatus.OPEN);
    em.persist(survey);
    Long id = (Long) controller.createRankedChoiceQuestion(survey.getId(), Map.of("prompt", "Rank candidates",
      "options", List.of(Map.of("name", "Alpha", "description", "First candidate"),
        Map.of("name", "Beta", "description", "Second candidate"), Map.of("name", "Gamma")))).get("id");
    em.flush(); em.clear();
    question = em.find(RankedChoiceQuestion.class, id);
    survey = question.getSurvey();
  }

  List<Long> ids() { return question.getOptions().stream().map(RankedChoiceOption::getId).toList(); }
  void vote(List<?> ids) {
    controller.answerRankedChoiceQuestion(survey.getId(), question.getId(), principal, Map.of("optionIds", ids));
    em.flush(); em.clear();
    question = em.find(RankedChoiceQuestion.class, question.getId());
    survey = question.getSurvey();
  }
  List<Map<String, Object>> ballot() {
    return controller.getRankedChoiceAnswersForUser(survey.getId(), question.getId(), voter.getId());
  }
  List<Map<String, Object>> definition() {
    return question.getOptions().stream().map(o -> Map.<String, Object>of("id", o.getId(),
      "name", o.getName(), "description", o.getDescription())).toList();
  }

  @Test void partialRankingRoundTripsInPreferenceOrderAndResubmissionReplacesIt() {
    List<Long> ids = ids();
    vote(List.of(ids.get(2), ids.get(0)));
    assertEquals(List.of(ids.get(2), ids.get(0)), ballot().stream().map(a -> a.get("optionId")).toList());
    assertEquals(List.of(1, 2), ballot().stream().map(a -> a.get("rank")).toList());
    vote(List.of(ids.get(1)));
    assertEquals(List.of(ids.get(1)), ballot().stream().map(a -> a.get("optionId")).toList());
    vote(List.of());
    assertTrue(ballot().isEmpty());
    assertEquals(3, question.getOptions().size());
  }

  @Test void invalidBallotsPreservePreviousRanking() {
    Long id = ids().getFirst();
    vote(List.of(id));
    for (List<?> invalid : List.of(List.of(id, id), List.of(-1L), List.of("1"), List.of(1.5))) {
      assertThrows(IllegalArgumentException.class, () -> controller.answerRankedChoiceQuestion(
        survey.getId(), question.getId(), principal, Map.of("optionIds", invalid)));
      assertEquals(List.of(id), ballot().stream().map(a -> a.get("optionId")).toList());
    }
  }

  @Test void requiredNeedsOnlyOneCandidateAndParticipatesInCompletion() {
    question.setRequired(true); em.flush();
    assertThrows(IllegalArgumentException.class, () -> controller.answerRankedChoiceQuestion(
      survey.getId(), question.getId(), principal, Map.of("optionIds", List.of())));
    vote(List.of(ids().getLast()));
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }

  @Test void nameDescriptionAndDefaultOrderChangesPreserveIdsAndBallot() {
    List<Long> original = ids();
    vote(List.of(original.get(2), original.get(0)));
    List<Map<String, Object>> options = new ArrayList<>(definition());
    Collections.reverse(options);
    options.set(0, Map.of("id", original.get(2), "name", "Corrected", "description", "Updated description"));
    Map<String, Object> result = controller.updateRankedChoiceQuestion(survey.getId(), question.getId(),
      Map.of("prompt", "Updated", "options", options));
    em.flush(); em.clear();
    question = em.find(RankedChoiceQuestion.class, question.getId());
    assertEquals(false, result.get("responsesCleared"));
    assertEquals(List.of(original.get(2), original.get(1), original.get(0)), ids());
    assertEquals("Corrected", question.getOptions().getFirst().getName());
    assertEquals(List.of(original.get(2), original.get(0)), ballot().stream().map(a -> a.get("optionId")).toList());
  }

  @Test void replacingCandidatesClearsBallotsBeforeRemovingOptions() {
    vote(ids());
    Map<String, Object> result = controller.updateRankedChoiceQuestion(survey.getId(), question.getId(),
      Map.of("prompt", "Updated", "options", List.of(Map.of("name", "Replacement"))));
    em.flush(); em.clear();
    assertEquals(true, result.get("responsesCleared"));
    assertTrue(ballot().isEmpty());
    assertEquals(1L, em.createQuery("select count(o) from RankedChoiceOption o", Long.class).getSingleResult());
  }

  @Test void rejectsForeignQuestionsAndClosedSurveys() {
    assertThrows(IllegalArgumentException.class, () -> controller.answerRankedChoiceQuestion(
      -1L, question.getId(), principal, Map.of("optionIds", ids())));
    for (SurveyStatus status : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      survey.setStatus(status);
      assertThrows(IllegalStateException.class, () -> controller.answerRankedChoiceQuestion(
        survey.getId(), question.getId(), principal, Map.of("optionIds", ids())));
    }
    assertTrue(ballot().isEmpty());
  }

  @Test void copyKeepsCandidateOrderAndDescriptionsWithoutAnswers() {
    vote(ids());
    Long copyId = (Long) controller.copySurvey(survey.getId(), principal).get("id");
    em.flush(); em.clear();
    RankedChoiceQuestion copy = (RankedChoiceQuestion) em.find(Survey.class, copyId).getQuestions().getFirst();
    assertEquals("First candidate", copy.getOptions().getFirst().getDescription());
    assertEquals(List.of("Alpha", "Beta", "Gamma"), copy.getOptions().stream().map(RankedChoiceOption::getName).toList());
    assertTrue(copy.getAnswers().isEmpty());
    assertNotEquals(question.getId(), copy.getId());
    assertTrue(copy.getOptions().stream().noneMatch(o -> ids().contains(o.getId())));
  }

  @Test void surveyDeletionCascadesRankedAnswersAndCandidates() {
    vote(ids());
    var admin = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("admin", "unused",
      List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN")));
    controller.deleteSurvey(survey.getId(), admin); em.flush(); em.clear();
    assertEquals(0, answers.count());
    assertEquals(0L, em.createQuery("select count(o) from RankedChoiceOption o", Long.class).getSingleResult());
  }

  @Test void invalidCandidateDefinitionCannotRemoveSavedResponses() {
    vote(List.of(ids().getFirst()));
    for (List<?> invalid : List.of(List.of(Map.of("name", "")), List.of(Map.of("id", -1, "name", "Foreign")),
        List.of(Map.of("name", "Valid"), Map.of("name", "x".repeat(256))))) {
      assertThrows(IllegalArgumentException.class, () -> controller.updateRankedChoiceQuestion(
        survey.getId(), question.getId(), Map.of("prompt", "Rank", "options", invalid)));
      assertEquals(1, ballot().size());
      assertEquals(3, question.getOptions().size());
    }
  }

  @Test void votingEndpointAcceptsAnAuthenticatedPartialBallot() throws Exception {
    String url = "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/answers/ranked-choice";
    mvc.perform(post(url).with(oidcLogin().oidcUser(principal)).with(csrf())
      .contentType("application/json").content("{\"optionIds\":[" + ids().getLast() + "]}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.responseCount").value(1));
    mvc.perform(get(url + "/" + voter.getId()).with(oidcLogin().oidcUser(principal)))
      .andExpect(status().isOk()).andExpect(jsonPath("$[0].rank").value(1))
      .andExpect(jsonPath("$[0].optionId").value(ids().getLast()));
  }

  @Test void definitionEndpointsRequireAdminAndCsrf() throws Exception {
    String create = "/api/surveys/" + survey.getId() + "/questions/ranked-choice";
    String update = "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/ranked-choice";
    for (String url : List.of(create, update)) {
      mvc.perform(post(url).with(user("voter")).with(csrf())).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
    }
  }
}
