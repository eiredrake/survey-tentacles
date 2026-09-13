package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.util.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.*;
import org.eiredrake.tentacles.service.*;
import org.eiredrake.tentacles.service.ParticipantGroupService.GroupRequest;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:participantgroups;NON_KEYWORDS=VALUE")
@AutoConfigureMockMvc
@Transactional
class ParticipantGroupTests {
  @Autowired MockMvc mvc;
  @Autowired EntityManager em;
  @Autowired ParticipantGroupService groups;
  @Autowired SurveyAssignmentService assignments;
  @Autowired UserRepository users;
  User alice, bob, charlie;
  Survey survey;

  @BeforeEach void setup() {
    alice = knownUser("Alice"); bob = knownUser("Bob"); charlie = knownUser("Charlie");
    survey = new Survey(); survey.setTitle("Movie Night"); survey.setCreator(alice); em.persist(survey); em.flush();
  }
  User knownUser(String name) {
    User user = new User(); user.setOidcSubject(UUID.randomUUID().toString());
    user.setUsername(name); user.setDisplayName(name); em.persist(user); return user;
  }
  Long group(String name, User... members) {
    return groups.save(null, new GroupRequest(name, new HashSet<>(Arrays.stream(members).map(User::getId).toList()))).id();
  }
  String batchUrl() { return "/api/surveys/" + survey.getId() + "/assignments/batch"; }

  @Test void groupsCanBeRenamedAndMembershipChangedWithoutChangingUsers() {
    Long id = group("  Movie Night  ", alice, bob);
    assertEquals("Movie Night", groups.list().getFirst().name());
    groups.save(id, new GroupRequest("Weekends", Set.of(bob.getId(), charlie.getId())));
    em.flush(); em.clear();
    var updated = groups.list().getFirst();
    assertEquals("Weekends", updated.name());
    assertEquals(Set.of(bob.getId(), charlie.getId()), new HashSet<>(updated.userIds()));
    groups.delete(id); em.flush(); em.clear();
    assertTrue(groups.list().isEmpty());
    assertTrue(users.existsById(alice.getId())); assertTrue(users.existsById(bob.getId()));
  }

  @Test void overlappingGroupsAndIndividualsExpandOnceAndRemainSnapshots() throws Exception {
    ShortTextQuestion question = new ShortTextQuestion();
    question.setSurvey(survey); question.setType(QuestionType.SHORT_TEXT); question.setPrompt("Favourite movie?");
    question.setDisplayOrder(1); question.setRequired(true); survey.getQuestions().add(question); em.persist(question);
    ShortTextAnswer answer = new ShortTextAnswer(); answer.setQuestion(question); answer.setUser(alice); answer.setValue("Alien"); em.persist(answer);
    Long movies = group("Movies", alice, bob), friends = group("Friends", bob, charlie);
    var original = assignments.addSelection(survey.getId(), Set.of(alice.getId()), Set.of(), true).getFirst();
    Long originalId = original.getId();
    String body = "{\"userIds\":[" + bob.getId() + "],\"groupIds\":[" + movies + "," + friends + "],\"required\":false}";
    for (int i = 0; i < 2; i++) mvc.perform(post(batchUrl()).with(user("admin").roles("ADMIN")).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
    var result = assignments.findBySurveyId(survey.getId());
    assertEquals(3, result.size());
    var retained = result.stream().filter(a -> a.getUser().getId().equals(alice.getId())).findFirst().orElseThrow();
    assertEquals(originalId, retained.getId()); assertTrue(retained.isRequired());
    groups.save(movies, new GroupRequest("Changed", Set.of())); groups.delete(friends);
    em.flush(); em.clear();
    assertEquals(3, assignments.findBySurveyId(survey.getId()).size());
    mvc.perform(get("/api/surveys/" + survey.getId() + "/assignments").with(user("reader")))
      .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3))
      .andExpect(jsonPath("$[0].userId").isNumber())
      .andExpect(jsonPath("$[?(@.userId == " + alice.getId() + ")].completed").value(org.hamcrest.Matchers.contains(true)))
      .andExpect(jsonPath("$[?(@.userId == " + bob.getId() + ")].completed").value(org.hamcrest.Matchers.contains(false)));
    assertEquals("Alien", em.find(ShortTextAnswer.class, answer.getId()).getValue());
  }

  @Test void legacyIndividualAssignmentIsCompatibleAndIdempotent() throws Exception {
    String url = "/api/surveys/" + survey.getId() + "/assignments";
    for (int i = 0; i < 2; i++) mvc.perform(post(url).with(user("admin").roles("ADMIN")).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"Alice\",\"required\":true}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.userId").value(alice.getId()));
    assertEquals(1, assignments.findBySurveyId(survey.getId()).size());
  }

  @Test void invalidSelectionsDoNotPartiallyAssignUsers() {
    assertThrows(ResponseStatusException.class, () -> assignments.addSelection(survey.getId(), Set.of(alice.getId()), Set.of(-1L), false));
    assertTrue(assignments.findBySurveyId(survey.getId()).isEmpty());
  }

  @Test void emptyGroupsAreValidAndDoNotCreateAssignments() {
    Long id = group("Empty");
    assertTrue(assignments.addSelection(survey.getId(), Set.of(), Set.of(id), false).isEmpty());
    assertTrue(assignments.findBySurveyId(survey.getId()).isEmpty());
  }

  @Test void groupNamesAndMemberIdsAreValidated() throws Exception {
    group("Movies", alice);
    for (String body : List.of("{\"name\":\"  \",\"userIds\":[]}", "{\"name\":\"Missing user\",\"userIds\":[-1]}")) {
      mvc.perform(post("/api/participant-groups").with(user("admin").roles("ADMIN")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
    }
    mvc.perform(post("/api/participant-groups").with(user("admin").roles("ADMIN")).with(csrf())
      .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"MOVIES\",\"userIds\":[]}"))
      .andExpect(status().isConflict());
  }

  @Test void onlyAdminsCanManageGroupsOrAssignThemAndWritesRequireCsrf() throws Exception {
    Long id = group("Movie Night", alice);
    mvc.perform(get("/api/participant-groups").with(user("reader"))).andExpect(status().isForbidden());
    mvc.perform(get("/participant-groups.html").with(user("reader"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/participant-groups").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
    for (var request : List.of(post("/api/participant-groups"), put("/api/participant-groups/" + id),
      delete("/api/participant-groups/" + id), post(batchUrl()))) {
      mvc.perform(request.with(user("reader")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isForbidden());
    }
    mvc.perform(post("/api/participant-groups").with(user("admin").roles("ADMIN"))
      .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Test\",\"userIds\":[]}"))
      .andExpect(status().isForbidden());
    mvc.perform(post(batchUrl()).with(user("admin").roles("ADMIN"))
      .contentType(MediaType.APPLICATION_JSON).content("{\"userIds\":[],\"groupIds\":[]}"))
      .andExpect(status().isForbidden());
  }
}
