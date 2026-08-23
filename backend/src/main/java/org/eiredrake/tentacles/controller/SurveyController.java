package org.eiredrake.tentacles.controller;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.eiredrake.tentacles.model.SchedulingOption;
import org.eiredrake.tentacles.model.SchedulingQuestion;
import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.eiredrake.tentacles.model.SurveyStatus;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.QuestionService;
import org.eiredrake.tentacles.service.SchedulingAnswerService;
import org.eiredrake.tentacles.service.SurveyAssignmentService;
import org.eiredrake.tentacles.service.SurveyParticipantService;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.eiredrake.tentacles.model.Question;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

  private final SurveyService surveyService;
  private final UserService userService;
  private final QuestionService questionService;
  private final SchedulingAnswerService schedulingAnswerService;
  private final SurveyParticipantService surveyParticipantService;
  private final SurveyAssignmentService surveyAssignmentService;

  public SurveyController(
    SurveyService surveyService,
    UserService userService,
    QuestionService questionService,
    SchedulingAnswerService schedulingAnswerService,
    SurveyParticipantService surveyParticipantService,
    SurveyAssignmentService surveyAssignmentService
  ) {
    this.surveyService = surveyService;
    this.userService = userService;
    this.questionService = questionService;
    this.schedulingAnswerService = schedulingAnswerService;
    this.surveyParticipantService = surveyParticipantService;
    this.surveyAssignmentService = surveyAssignmentService;
  }

  @PostMapping
  public Map<String, Object> createSurvey(
    @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, String> request
  ) {
    User creator = userService.findOrCreate(oidcUser);

    Survey survey = new Survey();
    survey.setTitle(request.get("title"));
    survey.setCreator(creator);

    survey = surveyService.save(survey);

    return Map.of(
      "id",
      survey.getId(),
      "title",
      survey.getTitle(),
      "creatorId",
      creator.getId()
    );
  }

  @GetMapping
  public Object listSurveys(
    Authentication authentication,
    @AuthenticationPrincipal OidcUser oidcUser
  ) {
    User currentUser = userService.findOrCreate(oidcUser);

    boolean isAdmin = authentication
      .getAuthorities()
      .stream()
      .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"));

    return surveyService
      .findAll()
      .stream()
      .filter(survey -> {
        if (isAdmin) {
          return true;
        }

        if (
          survey.getStatus() != SurveyStatus.OPEN &&
          survey.getStatus() != SurveyStatus.PUBLISHED
        ) {
          return false;
        }

        List<?> assignments = surveyAssignmentService.findBySurveyId(
          survey.getId()
        );

        return (
          assignments.isEmpty() ||
          surveyAssignmentService.isAssigned(
            survey.getId(),
            currentUser.getId()
          )
        );
      })
      .map(survey -> {
        boolean required = surveyAssignmentService
          .findBySurveyId(survey.getId())
          .stream()
          .anyMatch(SurveyAssignment::isRequired);

        boolean active = switch (survey.getStatus()) {
          case DEVELOPMENT, OPEN -> true;
          case CLOSED, PUBLISHED -> false;
        };

        return Map.of(
          "id",
          survey.getId(),
          "active",
          active,
          "title",
          survey.getTitle(),
          "creatorId",
          survey.getCreator().getId(),
          "creatorName",
          survey.getCreator().getDisplayName(),
          "questionCount",
          survey.getQuestions().size(),
          "status",
          survey.getStatus().name(),
          "statusIcon",
          survey.getStatus().getIcon(),
          "required",
          required,
          "everPublished",
          survey.isEverPublished()
        );
      })
      .toList();
  }

  @PostMapping("/{surveyId}/questions/scheduling")
  public Map<String, Object> createSchedulingQuestion(
    @PathVariable Long surveyId,
    @RequestBody Map<String, Object> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    SchedulingQuestion question = new SchedulingQuestion();
    question.setSurvey(survey);
    question.setPrompt((String) request.get("prompt"));
    question.setDisplayOrder((Integer) request.get("displayOrder"));

    @SuppressWarnings("unchecked")
    List<String> dates = (List<String>) request.get("dates");

    @SuppressWarnings("unchecked")
    List<Map<String, String>> selections =
      (List<Map<String, String>>) request.get("selections");
    
    for (Map<String, String> selection : selections) {
      SchedulingOption option = new SchedulingOption();
      option.setQuestion(question);
    
      String date = selection.get("date");
      String time = selection.get("time");
      String timeZone = selection.get("timeZone");
    
      if (time == null || time.isBlank()) {
        option.setDate(LocalDate.parse(date));
        option.setDateTime(null);
      } else {
        LocalDateTime localDateTime = LocalDateTime.parse(
          date + "T" + time
        );
    
        option.setDate(null);
        option.setDateTime(
          localDateTime
            .atZone(ZoneId.of(timeZone))
            .toInstant()
        );
      }
    
      question.getOptions().add(option);
    }

    question = (SchedulingQuestion) questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "optionCount",
      question.getOptions().size()
    );
  }

  @GetMapping("/{surveyId}/questions/{questionId}")
  public Map<String, Object> getQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    SchedulingQuestion question = (SchedulingQuestion) questionService.findById(
      questionId
    );

    List<Map<String, Object>> options = question
      .getOptions()
      .stream()
      .map(option ->
        Map.<String, Object>of("id", option.getId(), "date", option.getDate())
      )
      .toList();

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "displayOrder",
      question.getDisplayOrder(),
      "options",
      options
    );
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/scheduling")
  public Map<String, Object> answerSchedulingQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, Object> request
  ) {
    SchedulingQuestion question = (SchedulingQuestion) questionService.findById(
      questionId
    );

    User user = userService.findOrCreate(oidcUser);
    Survey survey = surveyService.findById(surveyId);

    if (survey.getStatus() != SurveyStatus.OPEN) {
      throw new IllegalStateException("Survey is not open for responses.");
    }

    surveyParticipantService.add(survey, user);

    schedulingAnswerService.deleteForUserAndQuestion(
      question.getId(),
      user.getId()
    );

    @SuppressWarnings("unchecked")
    List<Integer> optionIds = (List<Integer>) request.get("optionIds");

    int saved = 0;

    for (Integer optionId : optionIds) {
      SchedulingOption option = schedulingAnswerService.findOptionById(
        optionId.longValue()
      );

      if (!option.getQuestion().getId().equals(question.getId())) {
        throw new IllegalArgumentException(
          "Option does not belong to question: " + questionId
        );
      }

      SchedulingAnswer answer = new SchedulingAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(option);

      schedulingAnswerService.save(answer);
      saved++;
    }

    return Map.of(
      "questionId",
      question.getId(),
      "userId",
      user.getId(),
      "selectedCount",
      saved
    );
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/scheduling")
  public List<Map<String, Object>> getSchedulingAnswers(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    return schedulingAnswerService
      .findByQuestionId(questionId)
      .stream()
      .map(answer ->
        Map.<String, Object>of(
          "answerId",
          answer.getId(),
          "userId",
          answer.getUser().getId(),
          "username",
          answer.getUser().getUsername(),
          "optionId",
          answer.getOption().getId(),
          "date",
          answer.getOption().getDate()
        )
      )
      .toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/results")
  public List<Map<String, Object>> getSchedulingResults(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    SchedulingQuestion question = (SchedulingQuestion) questionService.findById(
      questionId
    );

    return question
      .getOptions()
      .stream()
      .map(option ->
        Map.<String, Object>of(
          "optionId",
          option.getId(),
          "date",
          option.getDate(),
          "votes",
          schedulingAnswerService.countByOptionId(option.getId())
        )
      )
      .sorted((a, b) ->
        Long.compare((Long) b.get("votes"), (Long) a.get("votes"))
      )
      .toList();
  }

  @GetMapping("/{surveyId}/participants")
  public List<Map<String, Object>> getParticipants(
    @PathVariable Long surveyId
  ) {
    return surveyParticipantService
      .findBySurveyId(surveyId)
      .stream()
      .map(participant ->
        Map.<String, Object>of(
          "userId",
          participant.getUser().getId(),
          "username",
          participant.getUser().getUsername(),
          "name",
          participant.getUser().getDisplayName()
        )
      )
      .toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/participation")
  public List<Map<String, Object>> getSchedulingParticipation(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    return surveyAssignmentService
      .findBySurveyId(surveyId)
      .stream()
      .map(assignment -> {
        User user = assignment.getUser();

        return Map.<String, Object>of(
          "userId",
          user.getId(),
          "username",
          user.getUsername(),
          "name",
          user.getDisplayName(),
          "required",
          assignment.isRequired(),
          "answered",
          schedulingAnswerService.hasAnswered(questionId, user.getId())
        );
      })
      .toList();
  }

  @PostMapping("/{surveyId}/participants")
  public Map<String, Object> addParticipant(
    @PathVariable Long surveyId,
    @RequestBody Map<String, String> request
  ) {
    Survey survey = surveyService.findById(surveyId);
    User user = userService.findByUsername(request.get("username"));

    surveyParticipantService.add(survey, user);

    return Map.of(
      "userId",
      user.getId(),
      "username",
      user.getUsername(),
      "name",
      user.getDisplayName()
    );
  }

  @PostMapping("/{surveyId}/assignments")
  public Map<String, Object> addAssignment(
    @PathVariable Long surveyId,
    @RequestBody Map<String, Object> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    String username = (String) request.get("username");
    boolean required = Boolean.TRUE.equals(request.get("required"));

    User user = userService.findByUsername(username);

    SurveyAssignment assignment = new SurveyAssignment();
    assignment.setSurvey(survey);
    assignment.setUser(user);
    assignment.setRequired(required);

    assignment = surveyAssignmentService.save(assignment);

    return Map.of(
      "id",
      assignment.getId(),
      "userId",
      user.getId(),
      "username",
      user.getUsername(),
      "name",
      user.getDisplayName(),
      "required",
      assignment.isRequired()
    );
  }

  @GetMapping("/{surveyId}/assignments")
  public List<Map<String, Object>> getAssignments(@PathVariable Long surveyId) {
    return surveyAssignmentService
      .findBySurveyId(surveyId)
      .stream()
      .map(assignment ->
        Map.<String, Object>of(
          "id",
          assignment.getId(),
          "userId",
          assignment.getUser().getId(),
          "username",
          assignment.getUser().getUsername(),
          "name",
          assignment.getUser().getDisplayName(),
          "required",
          assignment.isRequired()
        )
      )
      .toList();
  }

  @PostMapping("/{surveyId}/title")
  public Map<String, Object> updateTitle(
    @PathVariable Long surveyId,
    @RequestBody Map<String, String> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    String title = request.get("title");

    if (title == null || title.isBlank()) {
      throw new IllegalArgumentException("Survey title is required.");
    }

    survey.setTitle(title.trim());
    surveyService.save(survey);

    return Map.of("id", survey.getId(), "title", survey.getTitle());
  }

  @PostMapping("/{surveyId}/status")
  public Map<String, Object> updateStatus(
    @PathVariable Long surveyId,
    @RequestBody Map<String, String> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    SurveyStatus status = SurveyStatus.valueOf(
      request.get("status").toUpperCase()
    );

    survey.setStatus(status);
    if (status == SurveyStatus.PUBLISHED) {
      survey.setEverPublished(true);
    }

    surveyService.save(survey);

    return Map.of(
      "id",
      survey.getId(),
      "status",
      survey.getStatus().name(),
      "statusIcon",
      survey.getStatus().getIcon()
    );
  }

  @GetMapping("/statuses")
  public List<String> getSurveyStatuses() {
    return java.util.Arrays.stream(SurveyStatus.values())
      .map(Enum::name)
      .toList();
  }

  @DeleteMapping("/{surveyId}/assignments/{userId}")
  public Map<String, Object> deleteAssignment(
    @PathVariable Long surveyId,
    @PathVariable Long userId
  ) {
    surveyAssignmentService.delete(surveyId, userId);

    return Map.of("surveyId", surveyId, "userId", userId, "deleted", true);
  }

  @PostMapping("/{surveyId}/assignments/{userId}/required")
  public Map<String, Object> updateAssignmentRequired(
    @PathVariable Long surveyId,
    @PathVariable Long userId,
    @RequestBody Map<String, Object> request
  ) {
    SurveyAssignment assignment = surveyAssignmentService
      .findBySurveyId(surveyId)
      .stream()
      .filter(item -> item.getUser().getId().equals(userId))
      .findFirst()
      .orElseThrow(() ->
        new IllegalArgumentException("Assignment not found for user: " + userId)
      );

    boolean required = Boolean.TRUE.equals(request.get("required"));

    assignment.setRequired(required);
    assignment = surveyAssignmentService.save(assignment);

    return Map.of(
      "userId",
      assignment.getUser().getId(),
      "name",
      assignment.getUser().getDisplayName(),
      "required",
      assignment.isRequired()
    );
  }

  @DeleteMapping("/{surveyId}")
  public Map<String, Object> deleteSurvey(@PathVariable Long surveyId) {
    Survey survey = surveyService.findById(surveyId);

    surveyService.delete(survey);

    return Map.of("id", surveyId, "deleted", true);
  }

  @DeleteMapping("/{surveyId}/questions/{questionId}")
  public Map<String, Object> deleteQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    Question question = questionService.findById(questionId);
  
    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }
  
    questionService.delete(question);
  
    return Map.of(
      "id",
      questionId,
      "deleted",
      true
    );
  }  
}
