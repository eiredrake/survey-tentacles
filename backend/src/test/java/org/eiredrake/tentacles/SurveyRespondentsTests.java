package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.util.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.SurveyParticipantService;
import org.eiredrake.tentacles.service.SurveyParticipantService.ParticipantView;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SurveyRespondentsTests {
    @Autowired EntityManager em;
    @Autowired SurveyParticipantService participants;
    @Autowired MockMvc mvc;
    Survey survey;
    ShortTextQuestion question;
    User assigned, unassigned, incomplete;

    @BeforeEach void setup() {
        assigned = userRecord("Assigned"); unassigned = userRecord("Respondent"); incomplete = userRecord("Incomplete");
        survey = new Survey(); survey.setCreator(assigned); survey.setTitle("Feedback"); survey.setStatus(SurveyStatus.OPEN);
        em.persist(survey); question = question(survey);
    }
    User userRecord(String name) {
        User value = new User(); value.setOidcSubject(UUID.randomUUID().toString()); value.setUsername(name);
        value.setDisplayName(name); em.persist(value); return value;
    }
    ShortTextQuestion question(Survey owner) {
        ShortTextQuestion value = new ShortTextQuestion(); value.setSurvey(owner); value.setType(QuestionType.SHORT_TEXT);
        value.setPrompt("Feedback"); value.setDisplayOrder(owner.getQuestions().size()); value.setRequired(true);
        em.persist(value); owner.getQuestions().add(value); return value;
    }
    void answer(Question item, User user) {
        ShortTextAnswer value = new ShortTextAnswer(); value.setQuestion(item); value.setUser(user); value.setValue("Response");
        em.persist(value);
    }
    SurveyAssignment assign(User user, boolean required) {
        SurveyAssignment value = new SurveyAssignment(); value.setSurvey(survey); value.setUser(user); value.setRequired(required);
        em.persist(value); return value;
    }
    List<ParticipantView> result() { em.flush(); em.clear(); return participants.findForView(survey.getId()); }
    ParticipantView entry(List<ParticipantView> values, User user) {
        return values.stream().filter(value -> value.userId().equals(user.getId())).findFirst().orElseThrow();
    }

    @Test void combinesAllSourcesOnceAndPreservesAssignmentMetadata() {
        var assignment = assign(assigned, true); assign(incomplete, false);
        answer(question, assigned); participants.add(survey, assigned);
        answer(question, unassigned); participants.add(survey, unassigned);
        var values = result(); assertEquals(3, values.size());
        var expected = entry(values, assigned);
        assertEquals(assignment.getId(), expected.id()); assertTrue(expected.required());
        assertTrue(expected.completed()); assertTrue(expected.responded());
        var missing = entry(values, incomplete);
        assertFalse(missing.required()); assertFalse(missing.completed()); assertFalse(missing.responded());
        assertNull(entry(values, unassigned).id()); assertFalse(entry(values, unassigned).required());
        assertTrue(entry(values, unassigned).completed());
    }
    @Test void zeroAssignmentsIncludesAnswerOnlyAndParticipationOnlyUsers() {
        answer(question, unassigned); participants.add(survey, incomplete);
        var values = result(); assertEquals(2, values.size());
        assertTrue(entry(values, unassigned).completed()); assertTrue(entry(values, unassigned).responded());
        assertTrue(entry(values, incomplete).responded()); assertFalse(entry(values, incomplete).completed());
    }
    @Test void multipleAnswersDeduplicateAndOtherSurveyRespondentsStayExcluded() {
        answer(question, unassigned); answer(question(survey), unassigned);
        Survey other = new Survey(); other.setTitle("Other"); other.setCreator(assigned); em.persist(other);
        answer(question(other), incomplete); participants.add(other, incomplete);
        var values = result(); assertEquals(1, values.size()); assertEquals(unassigned.getId(), values.getFirst().userId());
    }
    @Test void partialRespondentRetainsIncompleteStatusAndRequiredAssignment() {
        assign(assigned, true); answer(question, assigned); question(survey);
        var value = result().getFirst(); assertTrue(value.required()); assertTrue(value.responded()); assertFalse(value.completed());
    }
    @Test void emptySurveyReturnsEmptyCollection() { assertTrue(result().isEmpty()); }
    @Test void participantApiAcceptsMissingDisplayNameAndLeavesAssignmentApiUnchanged() throws Exception {
        assign(assigned, true); unassigned.setDisplayName(null); answer(question, unassigned); em.flush();
        mvc.perform(get("/api/surveys/{id}/participants", survey.getId()).with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].required").value(true)).andExpect(jsonPath("$[0].completed").value(false))
            .andExpect(jsonPath("$[1].username").value("Respondent")).andExpect(jsonPath("$[1].responded").value(true));
        mvc.perform(get("/api/surveys/{id}/assignments", survey.getId()).with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].userId").value(assigned.getId())).andExpect(jsonPath("$[0].required").value(true));
    }
}
