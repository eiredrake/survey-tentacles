package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.SingleSelectAnswerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop",
  "spring.test.database.replace=NONE", "spring.datasource.url=jdbc:h2:mem:single-select;NON_KEYWORDS=VALUE",
  "spring.datasource.username=sa", "spring.datasource.password=",
  "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"})
@Import(SingleSelectAnswerService.class)
class SingleSelectPersistenceTests {
  @Autowired EntityManager em;
  @Autowired SingleSelectAnswerService answers;

  SingleSelectQuestion createQuestion() {
    User user = new User();
    user.setOidcSubject("test-user");
    user.setUsername("test-user");
    em.persist(user);
    Survey survey = new Survey();
    survey.setTitle("Test");
    survey.setCreator(user);
    em.persist(survey);
    SingleSelectQuestion question = new SingleSelectQuestion();
    question.setSurvey(survey);
    question.setType(QuestionType.SINGLE_SELECT);
    question.setPrompt("Choose");
    question.setDisplayOrder(1);
    for (String label : new String[] {"Second", "First"}) {
      SingleSelectOption option = new SingleSelectOption();
      option.setQuestion(question);
      option.setLabel(label);
      question.getOptions().add(option);
    }
    survey.getQuestions().add(question);
    em.persist(question);
    SingleSelectAnswer answer = new SingleSelectAnswer();
    answer.setQuestion(question);
    answer.setUser(user);
    answer.setOption(question.getOptions().getFirst());
    answers.save(answer);
    em.flush();
    Long id = question.getId();
    em.clear();
    return em.find(SingleSelectQuestion.class, id);
  }

  @Test void roundTripAndOptionReplacementRespectForeignKeys() {
    SingleSelectQuestion question = createQuestion();
    assertEquals("Second", question.getOptions().getFirst().getLabel());
    assertEquals(1, answers.findByQuestionId(question.getId()).size());
    answers.deleteForQuestion(question.getId());
    question.getOptions().clear();
    SingleSelectOption replacement = new SingleSelectOption();
    replacement.setQuestion(question);
    replacement.setLabel("Replacement");
    question.getOptions().add(replacement);
    em.flush();
    em.clear();
    assertEquals(0, answers.findByQuestionId(question.getId()).size());
    assertEquals(1L, em.createQuery("select count(o) from SingleSelectOption o", Long.class).getSingleResult());
  }

  @Test void deletingSurveyCascadesAnswersAndOptions() {
    SingleSelectQuestion question = createQuestion();
    em.remove(question.getSurvey());
    em.flush();
    em.clear();
    assertEquals(0L, em.createQuery("select count(a) from SingleSelectAnswer a", Long.class).getSingleResult());
    assertEquals(0L, em.createQuery("select count(o) from SingleSelectOption o", Long.class).getSingleResult());
  }
}
