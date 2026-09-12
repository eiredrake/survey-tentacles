package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.MultiSelectAnswerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop",
  "spring.test.database.replace=NONE", "spring.datasource.url=jdbc:h2:mem:multi-select;NON_KEYWORDS=VALUE",
  "spring.datasource.username=sa", "spring.datasource.password=",
  "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"})
@Import(MultiSelectAnswerService.class)
class MultiSelectPersistenceTests {
  @Autowired EntityManager em;
  @Autowired MultiSelectAnswerService answers;

  MultiSelectQuestion createQuestion() {
    User user = new User();
    user.setOidcSubject("test-user");
    user.setUsername("test-user");
    em.persist(user);
    Survey survey = new Survey();
    survey.setTitle("Test");
    survey.setCreator(user);
    em.persist(survey);
    MultiSelectQuestion question = new MultiSelectQuestion();
    question.setSurvey(survey);
    question.setType(QuestionType.MULTI_SELECT);
    question.setPrompt("Choose");
    question.setDisplayOrder(1);
    for (String label : new String[] {"Second", "First"}) {
      MultiSelectOption option = new MultiSelectOption();
      option.setQuestion(question);
      option.setLabel(label);
      question.getOptions().add(option);
    }
    survey.getQuestions().add(question);
    em.persist(question);
    for (MultiSelectOption option : question.getOptions()) {
      MultiSelectAnswer answer = new MultiSelectAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(option);
      answers.save(answer);
    }
    em.flush();
    Long id = question.getId();
    em.clear();
    return em.find(MultiSelectQuestion.class, id);
  }

  @Test void roundTripAndOptionReplacementRespectForeignKeys() {
    MultiSelectQuestion question = createQuestion();
    assertEquals("Second", question.getOptions().getFirst().getLabel());
    assertEquals(2, answers.findByQuestionId(question.getId()).size());
    answers.deleteForQuestion(question.getId());
    question.getOptions().clear();
    MultiSelectOption replacement = new MultiSelectOption();
    replacement.setQuestion(question);
    replacement.setLabel("Replacement");
    question.getOptions().add(replacement);
    em.flush();
    em.clear();
    assertEquals(0, answers.findByQuestionId(question.getId()).size());
    assertEquals(1L, em.createQuery("select count(o) from MultiSelectOption o", Long.class).getSingleResult());
  }

  @Test void resubmissionReplacesTheEntireSelectionAndCanBeCleared() {
    MultiSelectQuestion question = createQuestion();
    User user = question.getSurvey().getCreator();
    Long questionId = question.getId();
    Long userId = user.getId();
    assertEquals(2, answers.findByQuestionIdAndUserId(questionId, userId).size());
    answers.deleteForUserAndQuestion(questionId, userId);
    MultiSelectAnswer answer = new MultiSelectAnswer();
    answer.setQuestion(question);
    answer.setUser(user);
    answer.setOption(question.getOptions().getLast());
    answers.save(answer);
    em.flush();
    em.clear();
    assertEquals(1, answers.findByQuestionIdAndUserId(questionId, userId).size());
    assertEquals("First", answers.findByQuestionIdAndUserId(questionId, userId).getFirst().getOption().getLabel());
    answers.deleteForUserAndQuestion(questionId, userId);
    em.clear();
    assertFalse(answers.hasAnswered(questionId, userId));
    assertEquals(2L, em.createQuery("select count(o) from MultiSelectOption o", Long.class).getSingleResult());
  }

  @Test void deletingSurveyCascadesAnswersAndOptions() {
    MultiSelectQuestion question = createQuestion();
    em.remove(question.getSurvey());
    em.flush();
    em.clear();
    assertEquals(0L, em.createQuery("select count(a) from MultiSelectAnswer a", Long.class).getSingleResult());
    assertEquals(0L, em.createQuery("select count(o) from MultiSelectOption o", Long.class).getSingleResult());
  }
}
