package org.eiredrake.tentacles.controller;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.model.QuestionType;
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
import org.eiredrake.tentacles.model.ShortTextQuestion;
import org.eiredrake.tentacles.model.ShortTextAnswer;
import org.eiredrake.tentacles.service.ShortTextAnswerService;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

  private final SurveyService surveyService;
  private final UserService userService;
  private final QuestionService questionService;
  private final SchedulingAnswerService schedulingAnswerService;
  private final SurveyParticipantService surveyParticipantService;
  private final SurveyAssignmentService surveyAssignmentService;
  private final ShortTextAnswerService shortTextAnswerService;

  public SurveyController(
    SurveyService surveyService,
    UserService userService,
    QuestionService questionService,
    SchedulingAnswerService schedulingAnswerService,
    SurveyParticipantService surveyParticipantService,
    SurveyAssignmentService surveyAssignmentService,
    ShortTextAnswerService shortTextAnswerService
  ) {
    this.surveyService = surveyService;
    this.userService = userService;
    this.questionService = questionService;
    this.schedulingAnswerService = schedulingAnswerService;
    this.surveyParticipantService = surveyParticipantService;
    this.surveyAssignmentService = surveyAssignmentService;
    this.shortTextAnswerService = shortTextAnswerService;
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
        boolean userRequired =
          surveyAssignmentService.isRequired(
            survey.getId(),
            currentUser.getId()
          );

        boolean hasRequiredQuestions =
          survey.getQuestions()
            .stream()
            .anyMatch(Question::isRequired);

        boolean required =
          userRequired || hasRequiredQuestions;

        boolean completed =
          isSurveyCompletedForUser(
            survey,
            currentUser
          );

        boolean active = switch (survey.getStatus()) {
          case DEVELOPMENT, OPEN -> true;
          case CLOSED, PUBLISHED -> false;
        };

        Map<String, Object> result = new HashMap<>();

        result.put("id", survey.getId());
        result.put("active", active);
        result.put("title", survey.getTitle());
        result.put("creatorId", survey.getCreator().getId());
        result.put("creatorName", survey.getCreator().getDisplayName());
        result.put("questionCount", survey.getQuestions().size());
        result.put("status", survey.getStatus().name());
        result.put("statusIcon", survey.getStatus().getIcon());
        result.put("required", required);
        result.put("everPublished", survey.isEverPublished());
        result.put("completed", completed);
        result.put("acceptingResponses",survey.getStatus().isAcceptingResponses());

        return result;
      })
      .toList();
  }

  @PostMapping("/{surveyId}/questions/{questionId}/scheduling")
public Map<String, Object> updateSchedulingQuestion(
  @PathVariable Long surveyId,
  @PathVariable Long questionId,
  @RequestBody Map<String, Object> request
) {
  SchedulingQuestion question =
    (SchedulingQuestion) questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  question.setPrompt((String) request.get("prompt"));
  question.setRequired(
    Boolean.TRUE.equals(request.get("required"))
  );

  @SuppressWarnings("unchecked")
  List<Map<String, String>> selections =
    (List<Map<String, String>>) request.get("selections");

  List<String> existingValues = question
    .getOptions()
    .stream()
    .map(option -> {
      if (option.getDateTime() != null) {
        return option.getDateTime().toString();
      }

      return option.getDate().toString();
    })
    .sorted()
    .toList();

  List<String> submittedValues = selections
    .stream()
    .map(selection -> {
      String date = selection.get("date");
      String time = selection.get("time");
      String timeZone = selection.get("timeZone");

      if (time == null || time.isBlank()) {
        return LocalDate.parse(date).toString();
      }

      LocalDateTime localDateTime =
        LocalDateTime.parse(date + "T" + time);

      return localDateTime
        .atZone(ZoneId.of(timeZone))
        .toInstant()
        .toString();
    })
    .sorted()
    .toList();

  boolean optionsChanged =
    !existingValues.equals(submittedValues);

  if (optionsChanged) {
    schedulingAnswerService.deleteForQuestion(
      question.getId()
    );

    question.getOptions().clear();

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
        LocalDateTime localDateTime =
          LocalDateTime.parse(date + "T" + time);

        option.setDate(null);
        option.setDateTime(
          localDateTime
            .atZone(ZoneId.of(timeZone))
            .toInstant()
        );
      }

      question.getOptions().add(option);
    }
  }

  questionService.save(question);

  return Map.of(
    "id",
    question.getId(),
    "prompt",
    question.getPrompt(),
    "required",
    question.isRequired(),
    "optionCount",
    question.getOptions().size(),
    "responsesCleared",
    optionsChanged
  );
}

  @PostMapping("/{surveyId}/questions/scheduling")
  public Map<String, Object> createSchedulingQuestion(
    @PathVariable Long surveyId,
    @RequestBody Map<String, Object> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    SchedulingQuestion question = new SchedulingQuestion();
    question.setType(QuestionType.SCHEDULING);
    question.setSurvey(survey);
    question.setPrompt((String) request.get("prompt"));
    question.setDisplayOrder((Integer) request.get("displayOrder"));
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

    @SuppressWarnings("unchecked")
    List<String> dates = (List<String>) request.get("dates");

    @SuppressWarnings("unchecked")
    List<Map<String, String>> selections = (List<
      Map<String, String>
    >) request.get("selections");

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
        LocalDateTime localDateTime = LocalDateTime.parse(date + "T" + time);

        option.setDate(null);
        option.setDateTime(
          localDateTime.atZone(ZoneId.of(timeZone)).toInstant()
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
  Question question = questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  Map<String, Object> result = new HashMap<>();

  result.put("id", question.getId());
  result.put("prompt", question.getPrompt());
  result.put("displayOrder", question.getDisplayOrder());
  result.put("required", question.isRequired());
  result.put("type", question.getType().name());

  if (question instanceof SchedulingQuestion schedulingQuestion) {
    List<Map<String, Object>> options =
      schedulingQuestion
        .getOptions()
        .stream()
        .map(option -> {
          Map<String, Object> optionResult =
            new HashMap<>();

          optionResult.put("id", option.getId());
          optionResult.put("date", option.getDate());
          optionResult.put(
            "dateTime",
            option.getDateTime()
          );

          return optionResult;
        })
        .toList();

    result.put("options", options);
  }

  return result;
}

@PostMapping("/{surveyId}/questions/{questionId}/answers/short-text")
public Map<String, Object> answerShortTextQuestion(
  @PathVariable Long surveyId,
  @PathVariable Long questionId,
  @AuthenticationPrincipal OidcUser oidcUser,
  @RequestBody Map<String, String> request
) {
  ShortTextQuestion question =
    (ShortTextQuestion) questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  Survey survey = surveyService.findById(surveyId);

  if (survey.getStatus() != SurveyStatus.OPEN) {
    throw new IllegalStateException(
      "Survey is not open for responses."
    );
  }

  User user = userService.findOrCreate(oidcUser);

  String value = request.get("value");

  if (value == null) {
    value = "";
  }

  value = value.trim();

  if (question.isRequired() && value.isBlank()) {
    throw new IllegalArgumentException(
      "This question is required."
    );
  }

  if (value.length() > 500) {
    throw new IllegalArgumentException(
      "Answer cannot exceed 500 characters."
    );
  }

  surveyParticipantService.add(survey, user);

  shortTextAnswerService.deleteForUserAndQuestion(
    question.getId(),
    user.getId()
  );

  if (!value.isBlank()) {
    ShortTextAnswer answer = new ShortTextAnswer();

    answer.setQuestion(question);
    answer.setUser(user);
    answer.setValue(value);

    answer = shortTextAnswerService.save(answer);

    return Map.of(
      "questionId", question.getId(),
      "userId", user.getId(),
      "answerId", answer.getId(),
      "value", answer.getValue()
    );
  }

  return Map.of(
    "questionId", question.getId(),
    "userId", user.getId(),
    "value", ""
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

    if (
      question.isRequired() &&
      (optionIds == null || optionIds.isEmpty())
    ) {
      throw new IllegalArgumentException(
        "This question is required."
      );
    }

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
      .map(answer -> {
        Map<String, Object> result = new HashMap<>();

        result.put("answerId", answer.getId());
        result.put("userId", answer.getUser().getId());
        result.put("username", answer.getUser().getUsername());
        result.put("optionId", answer.getOption().getId());
        result.put("date", answer.getOption().getDate());
        result.put("dateTime", answer.getOption().getDateTime());

        return result;
      })
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
      .map(option -> {
        Map<String, Object> result = new HashMap<>();

        result.put("optionId", option.getId());
        result.put("date", option.getDate());
        result.put("dateTime", option.getDateTime());
        result.put(
          "votes",
          schedulingAnswerService.countByOptionId(option.getId())
        );

        return result;
      })
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
  public List<Map<String, Object>> getAssignments(
    @PathVariable Long surveyId
  ) {
    Survey survey =
      surveyService.findById(surveyId);

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
          assignment.isRequired(),
          "completed",
          isSurveyCompletedForUser(
            survey,
            assignment.getUser()
          )
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

  @PostMapping("/{surveyId}/copy")
public Map<String, Object> copySurvey(
    @PathVariable Long surveyId,
    @AuthenticationPrincipal OidcUser oidcUser
) {
    Survey source =
        surveyService.findById(surveyId);

    User currentUser =
        userService.findOrCreate(oidcUser);

    Survey copy =
        new Survey();

    copy.setTitle(
        "Copy of " + source.getTitle()
    );
    copy.setCreator(currentUser);
    copy.setStatus(SurveyStatus.DEVELOPMENT);
    copy.setEverPublished(false);

    copy =
        surveyService.save(copy);

    for (Question sourceQuestion :
        source.getQuestions()) {

    Question copiedQuestion =
      switch (sourceQuestion.getType()) {

          case SCHEDULING -> {
              SchedulingQuestion sourceScheduling =
                  (SchedulingQuestion) sourceQuestion;

              SchedulingQuestion targetScheduling =
                  new SchedulingQuestion();

              copyQuestionFields(
                  sourceScheduling,
                  targetScheduling,
                  copy
              );

              for (SchedulingOption sourceOption :
                  sourceScheduling.getOptions()) {

                  SchedulingOption targetOption =
                      new SchedulingOption();

                  targetOption.setQuestion(
                      targetScheduling
                  );
                  targetOption.setDate(
                      sourceOption.getDate()
                  );
                  targetOption.setDateTime(
                      sourceOption.getDateTime()
                  );

                  targetScheduling
                      .getOptions()
                      .add(targetOption);
              }

              yield targetScheduling;
          }

          case SHORT_TEXT -> {
              ShortTextQuestion targetShortText =
                  new ShortTextQuestion();

              copyQuestionFields(
                  sourceQuestion,
                  targetShortText,
                  copy
              );

              yield targetShortText;
          }

          case SINGLE_SELECT,
              MULTI_SELECT ->
              throw new UnsupportedOperationException(
                  "Copy not implemented for question type: "
                  + sourceQuestion.getType()
              );
      };

      questionService.save(
          copiedQuestion
      );
    }

    for (SurveyAssignment sourceAssignment :
        surveyAssignmentService.findBySurveyId(
            source.getId()
        )) {

        SurveyAssignment copiedAssignment =
            new SurveyAssignment();

        copiedAssignment.setSurvey(copy);

        copiedAssignment.setUser(
            sourceAssignment.getUser()
        );

        copiedAssignment.setRequired(
            sourceAssignment.isRequired()
        );

        surveyAssignmentService.save(
            copiedAssignment
        );
    }    

    return Map.of(
        "id", copy.getId(),
        "title", copy.getTitle()
    );
}

private void copyQuestionFields(
    Question source,
    Question target,
    Survey survey
) {
    target.setSurvey(survey);
    target.setPrompt(source.getPrompt());
    target.setDisplayOrder(
        source.getDisplayOrder()
    );
    target.setType(source.getType());
    target.setRequired(
        source.isRequired()
    );
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

    return Map.of("id", questionId, "deleted", true);
  }

  @PostMapping("/{surveyId}/questions/{questionId}/short-text")
  public Map<String, Object> updateShortTextQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId,
    @RequestBody Map<String, Object> request
  ) {
    ShortTextQuestion question =
      (ShortTextQuestion) questionService.findById(questionId);

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    question.setPrompt((String) request.get("prompt"));
    question.setRequired(
      Boolean.TRUE.equals(request.get("required"))
    );

    questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "required",
      question.isRequired()
    );
  }

  @PostMapping("/{surveyId}/questions/short-text")
public Map<String, Object> createShortTextQuestion(
  @PathVariable Long surveyId,
  @RequestBody Map<String, Object> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    ShortTextQuestion question = new ShortTextQuestion();

    question.setType(QuestionType.SHORT_TEXT);
    question.setSurvey(survey);
    question.setPrompt((String) request.get("prompt"));
    question.setDisplayOrder((Integer) request.get("displayOrder"));
    question.setRequired(
      Boolean.TRUE.equals(request.get("required"))
    );

    question =
      (ShortTextQuestion) questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "required",
      question.isRequired()
    );
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/short-text")
  public List<Map<String, Object>> getShortTextAnswers(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    return shortTextAnswerService
      .findByQuestionId(questionId)
      .stream()
      .map(answer ->
        Map.<String, Object>of(
          "answerId", answer.getId(),
          "userId", answer.getUser().getId(),
          "username", answer.getUser().getUsername(),
          "name", answer.getUser().getDisplayName(),
          "value", answer.getValue()
        )
      )
      .toList();
  }  


  private boolean isSurveyCompletedForUser(
    Survey survey,
    User user
  ) {
    return survey
      .getQuestions()
      .stream()
      .filter(Question::isRequired)
      .allMatch(question ->
        switch (question.getType()) {
          case SCHEDULING ->
            schedulingAnswerService.hasAnswered(
              question.getId(),
              user.getId()
            );

          case SHORT_TEXT ->
            shortTextAnswerService.hasAnswered(
              question.getId(),
              user.getId()
            );

          case SINGLE_SELECT,
            MULTI_SELECT -> false;
        }
      );
  }
}
