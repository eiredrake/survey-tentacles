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
class MultiSelectQuestionTests {
  @Mock SurveyService surveys;
  @Mock UserService users;
  @Mock QuestionService questions;
  @Mock MultiSelectAnswerService answers;
  @Mock SingleSelectAnswerService singleSelect;
  @Mock SurveyParticipantService participants;
  @Mock SurveyAssignmentService assignments;
  @Mock SchedulingAnswerService scheduling;
  @Mock ShortTextAnswerService shortText;
  @Mock RelationshipAnswerService relationships;
  @Mock SurveyImageService images;
  @InjectMocks SurveyController controller;
  MultiSelectQuestion question;
  Survey survey;
  User user;

  @BeforeEach void setup() {
    survey = new Survey();
    ReflectionTestUtils.setField(survey, "id", 1L);
    survey.setTitle("Survey");
    survey.setStatus(SurveyStatus.OPEN);
    question = new MultiSelectQuestion();
    ReflectionTestUtils.setField(question, "id", 2L);
    question.setSurvey(survey);
    question.setType(QuestionType.MULTI_SELECT);
    question.setPrompt("Choose");
    question.setDisplayOrder(1);
    MultiSelectOption option = new MultiSelectOption();
    ReflectionTestUtils.setField(option, "id", 3L);
    option.setLabel("First");
    option.setQuestion(question);
    question.getOptions().add(option);
    MultiSelectOption second = new MultiSelectOption();
    ReflectionTestUtils.setField(second, "id", 5L);
    second.setLabel("Second");
    second.setQuestion(question);
    question.getOptions().add(second);
    user = new User();
    ReflectionTestUtils.setField(user, "id", 4L);
  }

  @Test void savesMultipleDistinctSelections() {
    when(questions.findById(2L)).thenReturn(question);
    when(users.findOrCreate(null)).thenReturn(user);
    controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", List.of(3, 5)));
    ArgumentCaptor<MultiSelectAnswer> saved = ArgumentCaptor.forClass(MultiSelectAnswer.class);
    verify(answers).deleteForUserAndQuestion(2L, 4L);
    verify(answers, times(2)).save(saved.capture());
    assertEquals(List.of(3L, 5L), saved.getAllValues().stream().map(answer -> answer.getOption().getId()).toList());
    assertSame(user, saved.getValue().getUser());
  }

  @Test void duplicateIdsDoNotCreateDuplicateAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    when(users.findOrCreate(null)).thenReturn(user);
    Map<String, Object> result = controller.answerMultiSelectQuestion(1L, 2L, null,
      Map.of("optionIds", List.of(3, 3, 5, 5)));
    verify(answers, times(2)).save(any());
    assertEquals(2, result.get("responseCount"));
  }

  @Test void missingOrMalformedListDoesNotClearPreviousAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    assertThrows(IllegalArgumentException.class, () -> controller.answerMultiSelectQuestion(1L, 2L, null, Map.of()));
    assertThrows(IllegalArgumentException.class,
      () -> controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", 3)));
    verifyNoInteractions(answers, participants);
  }

  @Test void rejectsForeignAndMalformedOptionsBeforeDeletingAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    for (Object option : List.of(99, 3.5, "3", List.of(3, 4))) {
      assertThrows(IllegalArgumentException.class,
        () -> controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", List.of(3, option))));
    }
    verifyNoInteractions(answers, participants);
  }

  @Test void requiredQuestionRejectsEmptyAnswer() {
    when(questions.findById(2L)).thenReturn(question);
    question.setRequired(true);
    assertThrows(IllegalArgumentException.class,
      () -> controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", List.of())));
    verifyNoInteractions(answers);
  }

  @Test void optionalQuestionCanClearPreviousAnswer() {
    when(questions.findById(2L)).thenReturn(question);
    when(users.findOrCreate(null)).thenReturn(user);
    controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", List.of()));
    verify(answers).deleteForUserAndQuestion(2L, 4L);
    verify(answers, never()).save(any());
  }

  @Test void refusesResponsesOutsideOpenMode() {
    when(questions.findById(2L)).thenReturn(question);
    for (SurveyStatus status : List.of(SurveyStatus.DEVELOPMENT, SurveyStatus.CLOSED, SurveyStatus.PUBLISHED)) {
      survey.setStatus(status);
      assertThrows(IllegalStateException.class,
        () -> controller.answerMultiSelectQuestion(1L, 2L, null, Map.of("optionIds", List.of(3, 5))));
    }
    verifyNoInteractions(answers);
  }

  @Test void rejectsQuestionFromAnotherSurvey() {
    when(questions.findById(2L)).thenReturn(question);
    assertThrows(IllegalArgumentException.class,
      () -> controller.answerMultiSelectQuestion(9L, 2L, null, Map.of("optionIds", List.of(3, 5))));
    verifyNoInteractions(answers);
  }

  @Test void promptOnlyEditPreservesOptionsAndAnswers() {
    when(questions.findById(2L)).thenReturn(question);
    MultiSelectOption original = question.getOptions().getFirst();
    Map<String, Object> result = controller.updateMultiSelectQuestion(1L, 2L,
      Map.of("prompt", "Updated", "required", true, "options", List.of("First", "Second")));
    assertEquals(false, result.get("responsesCleared"));
    assertSame(original, question.getOptions().getFirst());
    assertTrue(question.isRequired());
    verifyNoInteractions(answers);
  }

  @Test void changingOptionsClearsAnswersAndPreservesSubmittedOrder() {
    when(questions.findById(2L)).thenReturn(question);
    controller.updateMultiSelectQuestion(1L, 2L,
      Map.of("prompt", "Choose", "options", List.of("Second", "First")));
    verify(answers).deleteForQuestion(2L);
    assertEquals(List.of("Second", "First"), question.getOptions().stream().map(MultiSelectOption::getLabel).toList());
    assertTrue(question.getOptions().stream().allMatch(option -> option.getQuestion() == question));
  }

  @Test void invalidEditorInputCannotClearAnswers() {
    for (List<String> labels : List.of(List.<String>of(), List.of(" "), List.of("x".repeat(256)))) {
      assertThrows(IllegalArgumentException.class, () -> controller.updateMultiSelectQuestion(1L, 2L,
        Map.of("prompt", "Choose", "options", labels)));
    }
    verifyNoInteractions(answers, questions);
  }

  @Test void completionIncludesMultiSelectAnswers() {
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
    question.getAnswers().add(new MultiSelectAnswer());
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
    MultiSelectQuestion copy = (MultiSelectQuestion) saved.getValue();
    assertEquals("First", copy.getOptions().getFirst().getLabel());
    assertNull(copy.getOptions().getFirst().getId());
    assertSame(copy, copy.getOptions().getFirst().getQuestion());
    assertTrue(copy.getAnswers().isEmpty());
  }
}
