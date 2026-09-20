package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.*;
import org.eiredrake.tentacles.controller.SurveyController;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.PointAllocationAnswerRepository;
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
class PointAllocationQuestionTests {
  @Autowired SurveyController controller;
  @Autowired EntityManager em;
  @Autowired UserService users;
  @Autowired PointAllocationAnswerRepository answers;
  @Autowired MockMvc mvc;
  Survey survey;
  PointAllocationQuestion question;
  OidcUser principal;
  User voter;

  OidcUser principal(String name) {
    return new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")),
      new OidcIdToken("test", Instant.now(), Instant.now().plusSeconds(3600),
        Map.of("sub", UUID.randomUUID().toString(), "preferred_username", name)));
  }
  @BeforeEach void setup() {
    principal = principal("voter"); voter = users.findOrCreate(principal);
    survey = new Survey(); survey.setTitle("Adventure"); survey.setCreator(voter); survey.setStatus(SurveyStatus.OPEN); em.persist(survey);
    Long id = (Long) controller.savePointAllocationQuestion(survey.getId(), null, settings(10)).get("id");
    em.flush(); em.clear(); question = em.find(PointAllocationQuestion.class, id); survey = question.getSurvey();
  }
  Map<String, Object> settings(int budget) {
    return Map.of("prompt", "What would you like?", "pointBudget", budget, "options", List.of("Combat", "Exploration", "Puzzles"));
  }
  List<Map<String, Object>> allocations(int... points) {
    List<Map<String, Object>> values = new ArrayList<>();
    for (int i = 0; i < points.length; i++) values.add(Map.of("optionId", question.getOptions().get(i).getId(), "points", points[i]));
    return values;
  }
  void vote(OidcUser who, List<?> values) {
    controller.answerPointAllocationQuestion(survey.getId(), question.getId(), who, Map.of("allocations", values));
    em.flush(); em.clear(); question = em.find(PointAllocationQuestion.class, question.getId()); survey = question.getSurvey();
  }
  List<Map<String, Object>> mine() {
    return controller.getPointAllocationAnswersForUser(survey.getId(), question.getId(), voter.getId());
  }
  List<Integer> points() { return mine().stream().map(answer -> (Integer) answer.get("points")).toList(); }

  @Test void permitsUnassignedPointsAndPersistsZeroForOmittedCategories() {
    vote(principal, allocations(2, 3));
    assertEquals(List.of(2, 3, 0), points());
    assertEquals(10, controller.getQuestion(survey.getId(), question.getId()).get("pointBudget"));
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void resubmissionReplacesOnlyThisParticipantsAllocationAndCanClear() {
    vote(principal, allocations(2, 3, 5));
    vote(principal("other"), allocations(4, 0, 0));
    vote(principal, allocations(1, 0, 0)); assertEquals(List.of(1, 0, 0), points());
    vote(principal, allocations(0, 0, 0)); assertTrue(mine().isEmpty()); assertEquals(3, answers.count());
    assertEquals(false, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void overspendingAndMalformedAllocationsDoNotEraseSavedAnswers() {
    vote(principal, allocations(1));
    Long optionId = question.getOptions().getFirst().getId();
    List<List<?>> invalid = List.of(allocations(6, 5), allocations(-1),
      List.of(Map.of("optionId", optionId, "points", 1.5)),
      List.of(Map.of("optionId", optionId, "points", "2")),
      List.of(Map.of("optionId", -1, "points", 1)),
      List.of(Map.of("optionId", optionId, "points", 1), Map.of("optionId", optionId, "points", 2)),
      List.of(Map.of("optionId", optionId)), List.of("invalid"));
    for (List<?> values : invalid) {
      assertThrows(IllegalArgumentException.class, () -> controller.answerPointAllocationQuestion(survey.getId(),
        question.getId(), principal, Map.of("allocations", values)));
      assertEquals(List.of(1, 0, 0), points());
    }
  }
  @Test void requiredNeedsAtLeastOnePointButNotTheFullBudget() {
    question.setRequired(true); em.flush();
    assertThrows(IllegalArgumentException.class, () -> controller.answerPointAllocationQuestion(survey.getId(),
      question.getId(), principal, Map.of("allocations", allocations(0, 0, 0))));
    vote(principal, allocations(1));
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void promptOnlyEditPreservesAnswersAndCategoryIds() {
    vote(principal, allocations(2));
    List<Long> ids = question.getOptions().stream().map(PointAllocationOption::getId).toList();
    Map<String, Object> request = new HashMap<>(settings(10)); request.put("prompt", "Updated");
    assertEquals(false, controller.savePointAllocationQuestion(survey.getId(), question.getId(), request).get("responsesCleared"));
    em.flush(); em.clear(); question = em.find(PointAllocationQuestion.class, question.getId());
    assertEquals(ids, question.getOptions().stream().map(PointAllocationOption::getId).toList());
    assertEquals(List.of(2, 0, 0), points());
  }
  @Test void changingBudgetOrCategoriesClearsAnswersWithoutForeignKeyErrors() {
    vote(principal, allocations(2));
    assertEquals(true, controller.savePointAllocationQuestion(survey.getId(), question.getId(), settings(5)).get("responsesCleared"));
    em.flush(); em.clear(); question = em.find(PointAllocationQuestion.class, question.getId());
    assertTrue(mine().isEmpty()); assertEquals(5, question.getPointBudget());
    vote(principal, allocations(1));
    Map<String, Object> request = new HashMap<>(settings(5)); request.put("options", List.of("New category"));
    controller.savePointAllocationQuestion(survey.getId(), question.getId(), request); em.flush(); em.clear();
    assertTrue(mine().isEmpty());
    assertEquals(1L, em.createQuery("select count(o) from PointAllocationOption o", Long.class).getSingleResult());
  }
  @Test void rejectsInvalidBudgetsBeforeMutatingAnswersAndAvoidsIntegerOverflow() {
    vote(principal, allocations(1));
    for (Object budget : List.of(0, -1, 1.5, "10", 2147483648L)) {
      Map<String, Object> request = new HashMap<>(settings(10)); request.put("pointBudget", budget);
      assertThrows(IllegalArgumentException.class, () -> controller.savePointAllocationQuestion(survey.getId(), question.getId(), request));
      assertEquals(List.of(1, 0, 0), points());
    }
    controller.savePointAllocationQuestion(survey.getId(), question.getId(), settings(Integer.MAX_VALUE));
    assertThrows(IllegalArgumentException.class, () -> controller.answerPointAllocationQuestion(survey.getId(), question.getId(),
      principal, Map.of("allocations", allocations(Integer.MAX_VALUE, Integer.MAX_VALUE))));
  }
  @Test void rejectsWrongSurveyAndClosedResponses() {
    assertThrows(IllegalArgumentException.class, () -> controller.getPointAllocationAnswers(-1L, question.getId()));
    for (SurveyStatus status : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      survey.setStatus(status);
      assertThrows(IllegalStateException.class, () -> controller.answerPointAllocationQuestion(survey.getId(), question.getId(),
        principal, Map.of("allocations", allocations(1))));
    }
    assertTrue(mine().isEmpty());
  }
  @Test void copyKeepsBudgetAndFreshCategoriesWithoutResponses() {
    vote(principal, allocations(1));
    Long copyId = (Long) controller.copySurvey(survey.getId(), principal).get("id"); em.flush(); em.clear();
    PointAllocationQuestion copy = (PointAllocationQuestion) em.find(Survey.class, copyId).getQuestions().getFirst();
    assertEquals(10, copy.getPointBudget()); assertEquals("Combat", copy.getOptions().getFirst().getLabel());
    assertNotEquals(question.getOptions().getFirst().getId(), copy.getOptions().getFirst().getId());
    assertTrue(copy.getAnswers().isEmpty());
  }
  @Test void deletingQuestionCascadesAnswersAndCategories() {
    vote(principal, allocations(1)); controller.deleteQuestion(survey.getId(), question.getId()); em.flush(); em.clear();
    assertEquals(0, answers.count());
    assertEquals(0L, em.createQuery("select count(o) from PointAllocationOption o", Long.class).getSingleResult());
  }
  @Test void typePickerAndRoutesRespectAuthenticationAndCsrf() throws Exception {
    mvc.perform(get("/api/surveys/question-types").with(user("reader"))).andExpect(status().isOk())
      .andExpect(jsonPath("$[?(@.name == 'POINT_ALLOCATION')].editorTemplateId").value("point-allocation-question-template"));
    for (String url : List.of("/api/surveys/" + survey.getId() + "/questions/point-allocation",
        "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/point-allocation")) {
      mvc.perform(post(url).with(user("reader")).with(csrf())).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json")
        .content("{\"prompt\":\"Allocate\",\"pointBudget\":10,\"options\":[\"Combat\",\"Exploration\",\"Puzzles\"]}"))
        .andExpect(status().isOk());
    }
    mvc.perform(post("/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/answers/point-allocation")
      .with(oidcLogin().oidcUser(principal)).with(csrf()).contentType("application/json")
      .content("{\"allocations\":[{\"optionId\":" + question.getOptions().getFirst().getId() + ",\"points\":2}]}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.pointsAssigned").value(2));
  }
}
