package org.eiredrake.tentacles.controller;

import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.model.QuestionType;
import org.eiredrake.tentacles.model.SchedulingQuestion;
import org.eiredrake.tentacles.repository.QuestionRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/surveys")
public class QuestionController {

  private final QuestionRepository questionRepository;

  public QuestionController(QuestionRepository questionRepository) {
    this.questionRepository = questionRepository;
  }

  @GetMapping("/{surveyId}/questions")
  public List<Map<String, Object>> listQuestions(@PathVariable Long surveyId) {
    List<Question> questions =
      questionRepository.findBySurveyIdOrderByDisplayOrder(surveyId);

    return questions
      .stream()
      .map(question ->
        Map.<String, Object>of(
          "id",
          question.getId(),
          "prompt",
          question.getPrompt(),
          "displayOrder",
          question.getDisplayOrder(),
          "required",
          question.isRequired(),
          "type",
          question.getType().name(),
          "editorTemplateId",
          question.getType().getEditorTemplateId(),
          "participantTemplateId",
          question.getType().getParticipantTemplateId()
        )
      )
      .toList();
  }

  @GetMapping("/question-types")
  public List<Map<String, String>> getQuestionTypes() {
    return java.util.Arrays.stream(QuestionType.values())
      .map(type ->
        Map.of(
          "name",
          type.name(),
          "editorTemplateId",
          type.getEditorTemplateId()
        )
      )
      .toList();
  }
}
