package org.eiredrake.tentacles;

import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.controller.SurveyController;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SingleSelectQuestionTests {
  @Mock SurveyService surveys;
  @Mock UserService users;
  @Mock QuestionService questions;
  @Mock SingleSelectAnswerService answers;
  @Mock SurveyParticipantService participants;
  @Mock SurveyAssignmentService assignments;
  @Mock SchedulingAnswerService scheduling;
  @Mock ShortTextAnswerService shortText;
  @Mock RelationshipAnswerService relationships;
  @Mock SurveyImageService images;
  @InjectMocks SurveyController controller;
  SingleSelectQuestion question;
  Survey survey;
  User user;

  @BeforeEach void setup() {
    survey = new Survey();
    ReflectionTestUtils.setField(survey, "id", 1L);
    survey.setTitle("Survey");
    survey.setStatus(SurveyStatus.OPEN);
    question = new SingleSelectQuestion();
    ReflectionTestUtils.setField(question, "id", 2L);
    question.setSurvey(survey);
    question.setType(QuestionType.SINGLE_SELECT);
    question.setPrompt("Choose");
    question.setDisplayOrder(1);
    SingleSelectOption option = new SingleSelectOption();
    ReflectionTestUtils.setField(option, "id", 3L);
    option.setLabel("First");
    option.setQuestion(question);
    question.getOptions().add(option);
    user = new User();
    ReflectionTestUtils.setField(user, "id", 4L);
  }

  @Test void savesExactlyOneSelection() {
    when(questions.findById(2L)).thenReturn(question);
    when(users.findOrCreate(null)).thenReturn(user);
    controller.answerSingleSelectQuestion(1L, 2L, null, Map.of("optionId", 3));
    ArgumentCaptor<SingleSelectAnswer> saved = ArgumentCaptor.forClass(SingleSelectAnswer.class);
    verify(answers).deleteForUserAndQuestion(2L, 4L);
    verify(answers).save(saved.capture());
    assertSame(question.getOptions().getFirst(), saved.getValue().getOption());
    assertSame(user, saved.getValue().getUser());
  }

  @Test void rejectsForeignAndMalformedOptionsBeforeDeletingAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    for (Object option : List.of(99, 3.5, "3", List.of(3, 4))) {
      assertThrows(IllegalArgumentException.class,
        () -> controller.answerSingleSelectQuestion(1L, 2L, null, Map.of("optionId", option)));
    }
    verifyNoInteractions(answers, participants);
  }

  @Test void requiredQuestionRejectsEmptyAnswer() {
    when(questions.findById(2L)).thenReturn(question);
    question.setRequired(true);
    assertThrows(IllegalArgumentException.class,
      () -> controller.answerSingleSelectQuestion(1L, 2L, null, Map.of()));
    verifyNoInteractions(answers);
  }

  @Test void optionalQuestionCanClearPreviousAnswer() {
    when(questions.findById(2L)).thenReturn(question);
    when(users.findOrCreate(null)).thenReturn(user);
    controller.answerSingleSelectQuestion(1L, 2L, null, Map.of());
    verify(answers).deleteForUserAndQuestion(2L, 4L);
    verify(answers, never()).save(any());
  }

  @Test void refusesResponsesOutsideOpenMode() {
    when(questions.findById(2L)).thenReturn(question);
    for (SurveyStatus status : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      survey.setStatus(status);
      assertThrows(IllegalStateException.class,
        () -> controller.answerSingleSelectQuestion(1L, 2L, null, Map.of("optionId", 3)));
    }
    verifyNoInteractions(answers);
  }

  @Test void rejectsQuestionFromAnotherSurvey() {
    when(questions.findById(2L)).thenReturn(question);
    assertThrows(IllegalArgumentException.class,
      () -> controller.answerSingleSelectQuestion(9L, 2L, null, Map.of("optionId", 3)));
    verifyNoInteractions(answers);
  }

  @Test void promptOnlyEditPreservesOptionsAndAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    SingleSelectOption original = question.getOptions().getFirst();
    Map<String, Object> result = controller.updateSingleSelectQuestion(1L, 2L,
      Map.of("prompt", "Updated", "required", true, "options", List.of("First")));
    assertEquals(false, result.get("responsesCleared"));
    assertSame(original, question.getOptions().getFirst());
    assertTrue(question.isRequired());
    verifyNoInteractions(answers);
  }

  @Test void changingOptionsClearsAnswersAndPreservesSubmittedOrder() {
    when(questions.findById(2L)).thenReturn(question);
    controller.updateSingleSelectQuestion(1L, 2L,
      Map.of("prompt", "Choose", "options", List.of("Second", "First")));
    verify(answers).deleteForQuestion(2L);
    assertEquals(List.of("Second", "First"), question.getOptions().stream().map(SingleSelectOption::getLabel).toList());
    assertTrue(question.getOptions().stream().allMatch(option -> option.getQuestion() == question));
  }

  @Test void invalidEditorInputCannotClearAnswers() {
    for (List<String> labels : List.of(List.<String>of(), List.of(" "), List.of("x".repeat(256)))) {
      assertThrows(IllegalArgumentException.class, () -> controller.updateSingleSelectQuestion(1L, 2L,
        Map.of("prompt", "Choose", "options", labels)));
    }
    verifyNoInteractions(answers, questions);
  }

  @Test void completionIncludesSingleSelectAnswers() {
    survey.getQuestions().add(question);
    when(answers.hasAnswered(2L, 4L)).thenReturn(true);
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, user));
    question.setRequired(true);
    assertEquals(true, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, user));
    when(answers.hasAnswered(2L, 4L)).thenReturn(false);
    assertEquals(false, ReflectionTestUtils.invokeMethod(controller, "isSurveyCompletedForUser", survey, user));
  }

  @Test void copyCreatesFreshOptionsWithoutResponses() {
    survey.getQuestions().add(question);
    question.getAnswers().add(new SingleSelectAnswer());
    when(surveys.findById(1L)).thenReturn(survey);
    when(users.findOrCreate(null)).thenReturn(user);
    when(surveys.save(any())).thenAnswer(call -> {
      Survey copy = call.getArgument(0);
      ReflectionTestUtils.setField(copy, "id", 8L);
      return copy;
    });
    controller.copySurvey(1L, null);
    ArgumentCaptor<Question> saved = ArgumentCaptor.forClass(Question.class);
    verify(questions).save(saved.capture());
    SingleSelectQuestion copy = (SingleSelectQuestion) saved.getValue();
    assertEquals("First", copy.getOptions().getFirst().getLabel());
    assertNull(copy.getOptions().getFirst().getId());
    assertSame(copy, copy.getOptions().getFirst().getQuestion());
    assertTrue(copy.getAnswers().isEmpty());
  }
}
