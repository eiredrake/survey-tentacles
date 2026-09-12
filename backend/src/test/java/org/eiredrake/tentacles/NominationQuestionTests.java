package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.NominationAnswerService;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class NominationQuestionTests {
  @Autowired MockMvc mvc;
  @Autowired EntityManager em;
  @Autowired NominationAnswerService answers;
  @MockitoBean UserService users;
  Survey survey;
  NominationQuestion question;
  User participant, other;

  @BeforeEach void setup() {
    participant = user("first");
    other = user("other");
    survey = new Survey();
    survey.setTitle("Movie night");
    survey.setCreator(participant);
    survey.setStatus(SurveyStatus.OPEN);
    em.persist(survey);
    question = new NominationQuestion();
    question.setSurvey(survey);
    question.setType(QuestionType.NOMINATION);
    question.setPrompt("Nominate movies");
    question.setDisplayOrder(1);
    question.setMaxNominations(2);
    survey.getQuestions().add(question);
    em.persist(question);
    when(users.findOrCreate(any())).thenAnswer(invocation ->
      ((OidcUser) invocation.getArgument(0)).getSubject().equals("other") ? other : participant);
  }

  User user(String name) {
    User user = new User();
    user.setOidcSubject(UUID.randomUUID().toString());
    user.setUsername(name);
    user.setDisplayName(name);
    em.persist(user);
    return user;
  }

  RequestPostProcessor admin() { return oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")); }
  String path() { return "/api/surveys/" + survey.getId() + "/questions/" + question.getId(); }
  ResultActions submit(String body) throws Exception {
    return mvc.perform(post(path() + "/answers/nomination").with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content(body));
  }
  List<String> saved(User user) {
    return answers.findByQuestionIdAndUserId(question.getId(), user.getId()).stream().map(NominationAnswer::getNomination).toList();
  }

  @Test void savesAndReplacesOnlyTheCurrentParticipantsNominations() throws Exception {
    submit("{\"nominations\":[\" Alien \" ,\"Arrival\"],\"userId\":" + other.getId() + "}").andExpect(status().isOk());
    mvc.perform(post(path() + "/answers/nomination").with(oidcLogin().idToken(token -> token.subject("other"))).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"nominations\":[\"Alien\"]}")).andExpect(status().isOk());
    submit("{\"nominations\":[\"Dune\"]}").andExpect(status().isOk());
    em.flush();
    em.clear();
    assertEquals(List.of("Dune"), saved(participant));
    assertEquals(List.of("Alien"), saved(other));
    mvc.perform(get(path() + "/answers/nomination").with(admin())).andExpect(status().isOk())
      .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].name").isString());
    mvc.perform(get(path() + "/answers/nomination/" + other.getId()).with(admin())).andExpect(status().isOk())
      .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].value").value("Alien"));
  }

  @Test void invalidSubmissionsPreservePreviousNominations() throws Exception {
    submit("{\"nominations\":[\"Alien\"]}").andExpect(status().isOk());
    for (String body : List.of("{}", "{\"nominations\":null}", "{\"nominations\":[null]}",
      "{\"nominations\":[1]}", "{\"nominations\":[\" \"]}", "{\"nominations\":[\"Alien\",\" Alien \"]}",
      "{\"nominations\":[\"One\",\"Two\",\"Three\"]}", "{\"nominations\":[\"" + "x".repeat(256) + "\"]}")) {
      submit(body).andExpect(status().is4xxClientError());
      assertEquals(List.of("Alien"), saved(participant));
    }
  }

  @Test void zeroIsUnlimitedAndOptionalListsCanBeCleared() throws Exception {
    question.setMaxNominations(0);
    submit("{\"nominations\":[\"One\",\"Two\",\"Three\"]}").andExpect(status().isOk());
    assertEquals(3, saved(participant).size());
    submit("{\"nominations\":[]}").andExpect(status().isOk());
    assertFalse(answers.hasAnswered(question.getId(), participant.getId()));
    question.setRequired(true);
    submit("{\"nominations\":[]}").andExpect(status().is4xxClientError());
  }

  @Test void closedAndForeignQuestionsCannotBeAnswered() throws Exception {
    for (SurveyStatus state : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      question.getSurvey().setStatus(state);
      submit("{\"nominations\":[\"Alien\"]}").andExpect(status().is4xxClientError());
    }
    mvc.perform(post("/api/surveys/999999/questions/" + question.getId() + "/answers/nomination")
      .with(oidcLogin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"nominations\":[\"Alien\"]}"))
      .andExpect(status().is4xxClientError());
    assertTrue(saved(participant).isEmpty());
  }

  @Test void creationAndSettingsEditsRequireAdminAndCsrf() throws Exception {
    String create = "/api/surveys/" + survey.getId() + "/questions/nomination";
    String body = "{\"prompt\":\"Favorite films\",\"required\":true,\"maxNominations\":3}";
    mvc.perform(post(create).with(oidcLogin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isForbidden());
    mvc.perform(post(create).with(admin()).contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isForbidden());
    mvc.perform(post(path() + "/nomination").with(oidcLogin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isForbidden());
    mvc.perform(post(create).with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isOk());
    NominationQuestion created = em.createQuery("select q from NominationQuestion q where q.prompt = 'Favorite films'", NominationQuestion.class).getSingleResult();
    assertEquals(3, created.getMaxNominations());
    assertTrue(created.isRequired());
    mvc.perform(get("/api/surveys/question-types").with(admin())).andExpect(status().isOk())
      .andExpect(jsonPath("$[?(@.name == 'NOMINATION')].editorTemplateId").value(org.hamcrest.Matchers.contains("nomination-question-template")));
  }

  @Test void editingThePromptAndLimitPreservesSavedNominations() throws Exception {
    submit("{\"nominations\":[\"Alien\",\"Arrival\"]}").andExpect(status().isOk());
    mvc.perform(post(path() + "/nomination").with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
      .content("{\"prompt\":\"Choose a movie\",\"required\":true,\"maxNominations\":1}")).andExpect(status().isOk());
    assertEquals(List.of("Alien", "Arrival"), saved(participant));
    mvc.perform(get(path()).with(admin())).andExpect(status().isOk()).andExpect(jsonPath("$.maxNominations").value(1));
    submit("{\"nominations\":[\"Alien\",\"Arrival\"]}").andExpect(status().is4xxClientError());
    submit("{\"nominations\":[\"Alien\"]}").andExpect(status().isOk());
  }

  @Test void rejectsInvalidSettings() throws Exception {
    for (String maximum : List.of("-1", "1.5", "null", "\"two\"", "2147483648")) {
      mvc.perform(post(path() + "/nomination").with(admin()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content("{\"prompt\":\"Movies\",\"maxNominations\":" + maximum + "}"))
        .andExpect(status().is4xxClientError());
    }
    assertEquals(2, question.getMaxNominations());
  }

  @Test void nominationCountsTowardCompletionAndSubmissionConfirmation() throws Exception {
    question.setRequired(true);
    mvc.perform(post("/api/surveys/" + survey.getId() + "/submitted").with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().is4xxClientError());
    submit("{\"nominations\":[\"Alien\"]}").andExpect(status().isOk());
    mvc.perform(post("/api/surveys/" + survey.getId() + "/submitted").with(oidcLogin()).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}"))
      .andExpect(status().isOk());
    mvc.perform(get("/api/surveys").with(oidcLogin())).andExpect(status().isOk())
      .andExpect(jsonPath("$[?(@.id == " + survey.getId() + ")].completed").value(org.hamcrest.Matchers.contains(true)));
  }

  @Test void copyPreservesConfigurationWithoutCopyingNominationsAndDeleteCascades() throws Exception {
    submit("{\"nominations\":[\"Alien\"]}").andExpect(status().isOk());
    mvc.perform(post("/api/surveys/" + survey.getId() + "/copy").with(admin()).with(csrf())).andExpect(status().isOk());
    NominationQuestion copied = em.createQuery("select q from NominationQuestion q where q.survey.title = 'Copy of Movie night'", NominationQuestion.class).getSingleResult();
    assertEquals(2, copied.getMaxNominations());
    assertTrue(answers.findByQuestionId(copied.getId()).isEmpty());
    em.flush();
    em.clear();
    mvc.perform(delete("/api/surveys/" + survey.getId()).with(admin()).with(csrf())).andExpect(status().isOk());
    em.flush();
    em.clear();
    assertTrue(answers.findByQuestionId(question.getId()).isEmpty());
    assertNull(em.find(NominationQuestion.class, question.getId()));
  }

  @Test void assignedSurveyRejectsUnassignedVotersAndSubmissionRequiresCsrf() throws Exception {
    mvc.perform(post(path() + "/answers/nomination").with(oidcLogin()).contentType(MediaType.APPLICATION_JSON)
      .content("{\"nominations\":[\"Alien\"]}")).andExpect(status().isForbidden());
    SurveyAssignment assignment = new SurveyAssignment();
    assignment.setSurvey(survey);
    assignment.setUser(other);
    em.persist(assignment);
    submit("{\"nominations\":[\"Alien\"]}").andExpect(status().isForbidden());
    assertTrue(saved(participant).isEmpty());
  }
}
