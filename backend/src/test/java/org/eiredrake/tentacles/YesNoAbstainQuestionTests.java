package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.*;
import org.eiredrake.tentacles.controller.SurveyController;
import org.eiredrake.tentacles.model.*;
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
class YesNoAbstainQuestionTests {
  @Autowired SurveyController controller;
  @Autowired EntityManager em;
  @Autowired UserService users;
  @Autowired MockMvc mvc;
  Survey survey;
  SingleSelectQuestion question;
  OidcUser principal;
  User voter;

  @BeforeEach void setup() {
    principal = new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")),
      new OidcIdToken("test", Instant.now(), Instant.now().plusSeconds(3600),
        Map.of("sub", UUID.randomUUID().toString(), "preferred_username", "voter", "name", "Voter")));
    voter = users.findOrCreate(principal);
    survey = new Survey(); survey.setTitle("Quick vote"); survey.setCreator(voter); survey.setStatus(SurveyStatus.OPEN);
    em.persist(survey);
    Long id = (Long) controller.createYesNoAbstainQuestion(survey.getId(),
      Map.of("prompt", "Do you like pizza?", "options", List.of("Forged option"))).get("id");
    em.flush(); em.clear(); question = em.find(SingleSelectQuestion.class, id); survey = question.getSurvey();
  }
  List<Map<String, Object>> mine() {
    return controller.getSingleSelectAnswersForUser(survey.getId(), question.getId(), voter.getId());
  }
  void vote(Map<String, Object> request) {
    controller.answerSingleSelectQuestion(survey.getId(), question.getId(), principal, request);
    em.flush(); em.clear(); question = em.find(SingleSelectQuestion.class, question.getId()); survey = question.getSurvey();
  }

  @Test void createsFixedChoicesAndExposesDefaultWithoutSavingAnAnswer() {
    assertEquals(QuestionType.YES_NO_ABSTAIN, question.getType());
    assertEquals(List.of("Yes", "No", "Abstain"), question.getOptions().stream().map(SingleSelectOption::getLabel).toList());
    assertEquals(question.getDefaultOption().getId(), controller.getQuestion(survey.getId(), question.getId()).get("defaultOptionId"));
    assertTrue(mine().isEmpty());
    assertEquals(false, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void submittedAbstentionCountsAsAnAnswerIncludingOnRequiredQuestions() {
    question.setRequired(true); em.flush();
    vote(Map.of());
    assertEquals("Abstain", mine().getFirst().get("label"));
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, voter));
  }
  @Test void choicesReplaceEachOtherAndNullResetsToAbstain() {
    for (SingleSelectOption option : List.copyOf(question.getOptions())) {
      vote(Map.of("optionId", option.getId()));
      assertEquals(1, mine().size()); assertEquals(option.getLabel(), mine().getFirst().get("label"));
    }
    Map<String, Object> clear = new HashMap<>(); clear.put("optionId", null);
    vote(clear); assertEquals("Abstain", mine().getFirst().get("label"));
  }
  @Test void promptEditPreservesOptionsAndVotesAndAlternativeEndpointCannotChangeChoices() {
    vote(Map.of("optionId", question.getOptions().getFirst().getId()));
    List<Long> ids = question.getOptions().stream().map(SingleSelectOption::getId).toList();
    controller.updateYesNoAbstainQuestion(survey.getId(), question.getId(), Map.of("prompt", "Updated", "required", true));
    em.flush(); em.clear(); question = em.find(SingleSelectQuestion.class, question.getId());
    assertEquals(ids, question.getOptions().stream().map(SingleSelectOption::getId).toList());
    assertEquals("Yes", mine().getFirst().get("label"));
    assertThrows(IllegalArgumentException.class, () -> controller.updateSingleSelectQuestion(survey.getId(), question.getId(),
      Map.of("prompt", "Tampered", "options", List.of("Other"))));
    assertEquals("Updated", question.getPrompt()); assertEquals("Yes", mine().getFirst().get("label"));
  }
  @Test void invalidOptionAndClosedSurveyCannotEraseAVote() {
    vote(Map.of());
    assertThrows(IllegalArgumentException.class, () -> controller.answerSingleSelectQuestion(survey.getId(), question.getId(),
      principal, Map.of("optionId", -1)));
    assertThrows(IllegalArgumentException.class, () -> controller.answerSingleSelectQuestion(-1L, question.getId(), principal, Map.of()));
    for (SurveyStatus status : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      survey.setStatus(status);
      assertThrows(IllegalStateException.class, () -> controller.answerSingleSelectQuestion(survey.getId(), question.getId(), principal, Map.of()));
    }
    assertEquals("Abstain", mine().getFirst().get("label"));
  }
  @Test void copyPreservesQuickVoteTypeAndDefaultWithFreshIdsAndNoAnswers() {
    vote(Map.of());
    Long id = (Long) controller.copySurvey(survey.getId(), principal).get("id"); em.flush(); em.clear();
    SingleSelectQuestion copy = (SingleSelectQuestion) em.find(Survey.class, id).getQuestions().getFirst();
    assertEquals(QuestionType.YES_NO_ABSTAIN, copy.getType());
    assertEquals("Abstain", copy.getDefaultOption().getLabel());
    assertNotEquals(question.getDefaultOption().getId(), copy.getDefaultOption().getId());
    assertTrue(copy.getAnswers().isEmpty());
  }
  @Test void deletingQuestionRemovesSharedSingleSelectAnswers() {
    vote(Map.of()); controller.deleteQuestion(survey.getId(), question.getId()); em.flush(); em.clear();
    assertEquals(0L, em.createQuery("select count(a) from SingleSelectAnswer a", Long.class).getSingleResult());
    assertEquals(0L, em.createQuery("select count(o) from SingleSelectOption o", Long.class).getSingleResult());
  }
  @Test void dropdownAndEditorRoutesUseExistingAuthorizationAndTemplates() throws Exception {
    mvc.perform(get("/api/surveys/question-types").with(user("reader"))).andExpect(status().isOk())
      .andExpect(jsonPath("$[?(@.name == 'YES_NO_ABSTAIN')].editorTemplateId").value("yes-no-abstain-question-template"));
    for (String url : List.of("/api/surveys/" + survey.getId() + "/questions/yes-no-abstain",
        "/api/surveys/" + survey.getId() + "/questions/" + question.getId() + "/yes-no-abstain")) {
      mvc.perform(post(url).with(user("reader")).with(csrf())).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
      mvc.perform(post(url).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json")
        .content("{\"prompt\":\"Quick vote\"}")).andExpect(status().isOk());
    }
  }
}
