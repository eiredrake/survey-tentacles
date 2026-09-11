package org.eiredrake.tentacles.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.model.QuestionType;
import org.eiredrake.tentacles.model.RelationshipAnswer;
import org.eiredrake.tentacles.model.RelationshipQuestion;
import org.eiredrake.tentacles.model.RelationshipSubject;
import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.eiredrake.tentacles.model.SchedulingOption;
import org.eiredrake.tentacles.model.SchedulingQuestion;
import org.eiredrake.tentacles.model.ShortTextAnswer;
import org.eiredrake.tentacles.model.ShortTextQuestion;
import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.eiredrake.tentacles.model.SurveyStatus;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.QuestionService;
import org.eiredrake.tentacles.service.RelationshipAnswerService;
import org.eiredrake.tentacles.service.SchedulingAnswerService;
import org.eiredrake.tentacles.service.ShortTextAnswerService;
import org.eiredrake.tentacles.service.SurveyAssignmentService;
import org.eiredrake.tentacles.service.SurveyImageService;
import org.eiredrake.tentacles.service.SurveyParticipantService;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
  private final RelationshipAnswerService relationshipAnswerService;
  private final SurveyImageService surveyImageService;

  public SurveyController(
    SurveyService surveyService,
    UserService userService,
    QuestionService questionService,
    SchedulingAnswerService schedulingAnswerService,
    SurveyParticipantService surveyParticipantService,
    SurveyAssignmentService surveyAssignmentService,
    ShortTextAnswerService shortTextAnswerService,
    RelationshipAnswerService relationshipAnswerService,
    SurveyImageService surveyImageService
  ) {
    this.surveyService = surveyService;
    this.userService = userService;
    this.questionService = questionService;
    this.schedulingAnswerService = schedulingAnswerService;
    this.surveyParticipantService = surveyParticipantService;
    this.surveyAssignmentService = surveyAssignmentService;
    this.shortTextAnswerService = shortTextAnswerService;
    this.relationshipAnswerService = relationshipAnswerService;
    this.surveyImageService = surveyImageService;
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

  @GetMapping("/{surveyId}/image")
  public ResponseEntity<Resource> getSurveyImage(@PathVariable Long surveyId)
    throws IOException {
    Survey survey = surveyService.findById(surveyId);

    String filename = survey.getImageFilename();

    if (filename == null || filename.isBlank()) {
      return ResponseEntity.notFound().build();
    }

    Path path = surveyImageService.getPath(filename);

    if (path == null || !Files.exists(path)) {
      return ResponseEntity.notFound().build();
    }

    String contentType = Files.probeContentType(path);

    MediaType mediaType =
      contentType != null
        ? MediaType.parseMediaType(contentType)
        : MediaType.APPLICATION_OCTET_STREAM;

    Resource resource = new FileSystemResource(path);

    return ResponseEntity.ok().contentType(mediaType).body(resource);
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
        boolean userRequired = surveyAssignmentService.isRequired(
          survey.getId(),
          currentUser.getId()
        );

        boolean hasRequiredQuestions = survey
          .getQuestions()
          .stream()
          .anyMatch(Question::isRequired);

        boolean required = userRequired || hasRequiredQuestions;

        boolean completed = isSurveyCompletedForUser(survey, currentUser);

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
        result.put("imageFilename", survey.getImageFilename());
        result.put("completed", completed);
        result.put(
          "acceptingResponses",
          survey.getStatus().isAcceptingResponses()
        );

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
    SchedulingQuestion question = (SchedulingQuestion) questionService.findById(
      questionId
    );

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    question.setPrompt((String) request.get("prompt"));
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

    @SuppressWarnings("unchecked")
    List<Map<String, String>> selections = (List<
      Map<String, String>
    >) request.get("selections");

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

        LocalDateTime localDateTime = LocalDateTime.parse(date + "T" + time);

        return localDateTime.atZone(ZoneId.of(timeZone)).toInstant().toString();
      })
      .sorted()
      .toList();

    boolean optionsChanged = !existingValues.equals(submittedValues);

    if (optionsChanged) {
      schedulingAnswerService.deleteForQuestion(question.getId());

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
          LocalDateTime localDateTime = LocalDateTime.parse(date + "T" + time);

          option.setDate(null);
          option.setDateTime(
            localDateTime.atZone(ZoneId.of(timeZone)).toInstant()
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

  @PostMapping("/{surveyId}/questions/{questionId}/relationship")
  public Map<String, Object> updateRelationshipQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId,
    @RequestBody Map<String, Object> request
  ) {
    RelationshipQuestion question =
      (RelationshipQuestion) questionService.findById(questionId);

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    question.setPrompt((String) request.get("prompt"));
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> subjects = (List<
      Map<String, Object>
    >) request.get("subjects");

    if (subjects == null) {
      subjects = List.of();
    }

    relationshipAnswerService.deleteForQuestion(question.getId());

    question.getSubjects().clear();

    for (int i = 0; i < subjects.size(); i++) {
      Map<String, Object> subjectRequest = subjects.get(i);

      RelationshipSubject subject = new RelationshipSubject();

      subject.setQuestion(question);
      subject.setName((String) subjectRequest.get("name"));
      subject.setDescription((String) subjectRequest.get("description"));
      subject.setDisplayOrder(i);

      question.getSubjects().add(subject);
    }

    questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "required",
      question.isRequired(),
      "subjectCount",
      question.getSubjects().size()
    );
  }

  @PostMapping("/{surveyId}/questions/relationship")
  public Map<String, Object> createRelationshipQuestion(
    @PathVariable Long surveyId,
    @RequestBody Map<String, Object> request
  ) {
    Survey survey = surveyService.findById(surveyId);

    RelationshipQuestion question = new RelationshipQuestion();

    question.setType(QuestionType.RELATIONSHIP);
    question.setSurvey(survey);
    question.setPrompt((String) request.get("prompt"));
    question.setDisplayOrder((Integer) request.get("displayOrder"));
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> subjects = (List<
      Map<String, Object>
    >) request.get("subjects");

    if (subjects != null) {
      for (int i = 0; i < subjects.size(); i++) {
        Map<String, Object> subjectRequest = subjects.get(i);

        RelationshipSubject subject = new RelationshipSubject();

        subject.setQuestion(question);
        subject.setName((String) subjectRequest.get("name"));
        subject.setDescription((String) subjectRequest.get("description"));
        subject.setDisplayOrder(i);

        question.getSubjects().add(subject);
      }
    }

    question = (RelationshipQuestion) questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "subjectCount",
      question.getSubjects().size()
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
      List<Map<String, Object>> options = schedulingQuestion
        .getOptions()
        .stream()
        .map(option -> {
          Map<String, Object> optionResult = new HashMap<>();

          optionResult.put("id", option.getId());
          optionResult.put("date", option.getDate());
          optionResult.put("dateTime", option.getDateTime());

          return optionResult;
        })
        .toList();

      result.put("options", options);
    }

    if (question instanceof RelationshipQuestion relationshipQuestion) {
      result.put(
        "subjects",
        relationshipQuestion
          .getSubjects()
          .stream()
          .map(subject ->
            Map.<String, Object>of(
              "id",
              subject.getId(),
              "name",
              subject.getName(),
              "description",
              subject.getDescription() == null ? "" : subject.getDescription(),
              "displayOrder",
              subject.getDisplayOrder()
            )
          )
          .toList()
      );
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
    ShortTextQuestion question = (ShortTextQuestion) questionService.findById(
      questionId
    );

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    Survey survey = surveyService.findById(surveyId);

    if (survey.getStatus() != SurveyStatus.OPEN) {
      throw new IllegalStateException("Survey is not open for responses.");
    }

    User user = userService.findOrCreate(oidcUser);

    String value = request.get("value");

    if (value == null) {
      value = "";
    }

    value = value.trim();

    if (question.isRequired() && value.isBlank()) {
      throw new IllegalArgumentException("This question is required.");
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
        "questionId",
        question.getId(),
        "userId",
        user.getId(),
        "answerId",
        answer.getId(),
        "value",
        answer.getValue()
      );
    }

    return Map.of(
      "questionId",
      question.getId(),
      "userId",
      user.getId(),
      "value",
      ""
    );
  }

@GetMapping("/{surveyId}/questions/{questionId}/answers/relationship/{userId}")
public List<Map<String, Object>> getRelationshipAnswersForUser(
  @PathVariable Long surveyId,
  @PathVariable Long questionId,
  @PathVariable Long userId
) {
  RelationshipQuestion question =
    (RelationshipQuestion) questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  return relationshipAnswerService
    .findByQuestionIdAndUserId(questionId, userId)
    .stream()
    .map(answer -> {
      Map<String, Object> result = new HashMap<>();

      result.put("userId", answer.getUser().getId());
      result.put("name", answer.getUser().getDisplayName());
      result.put("username", answer.getUser().getUsername());
      result.put("subjectId", answer.getSubject().getId());
      result.put("likeScore", answer.getLikeScore());
      result.put("trustScore", answer.getTrustScore());
      result.put(
        "comment",
        answer.getComment() == null ? "" : answer.getComment()
      );

      return result;
    })
    .toList();
}

  @GetMapping("/{surveyId}/questions/{questionId}/answers/relationship")
  public List<Map<String, Object>> getRelationshipAnswers(
    @PathVariable Long surveyId,
    @PathVariable Long questionId
  ) {
    RelationshipQuestion question =
      (RelationshipQuestion) questionService.findById(questionId);

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    return relationshipAnswerService
      .findByQuestionId(questionId)
      .stream()
      .map(answer -> {
        Map<String, Object> result = new HashMap<>();

        result.put("userId", answer.getUser().getId());

        result.put("name", answer.getUser().getDisplayName());

        result.put("username", answer.getUser().getUsername());

        result.put("subjectId", answer.getSubject().getId());

        result.put("likeScore", answer.getLikeScore());

        result.put("trustScore", answer.getTrustScore());

        result.put(
          "comment",
          answer.getComment() == null ? "" : answer.getComment()
        );

        return result;
      })
      .toList();
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

    if (question.isRequired() && (optionIds == null || optionIds.isEmpty())) {
      throw new IllegalArgumentException("This question is required.");
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

@GetMapping("/{surveyId}/questions/{questionId}/answers/scheduling/{userId}")
public List<Map<String, Object>> getSchedulingAnswersForUser(
  @PathVariable Long surveyId,
  @PathVariable Long questionId,
  @PathVariable Long userId
) {
  SchedulingQuestion question =
    (SchedulingQuestion) questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  return schedulingAnswerService
    .findByQuestionIdAndUserId(questionId, userId)
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
  public List<Map<String, Object>> getAssignments(@PathVariable Long surveyId) {
    Survey survey = surveyService.findById(surveyId);

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
          isSurveyCompletedForUser(survey, assignment.getUser())
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

  @PostMapping("/{surveyId}/image")
  public Map<String, Object> uploadSurveyImage(
    @PathVariable Long surveyId,
    @RequestParam("file") MultipartFile file
  ) throws IOException {
    Survey survey = surveyService.findById(surveyId);

    String oldFilename = survey.getImageFilename();

    String newFilename = surveyImageService.save(file);

    survey.setImageFilename(newFilename);
    surveyService.save(survey);

    if (oldFilename != null && !oldFilename.isBlank()) {
      surveyImageService.delete(oldFilename);
    }

    return Map.of("id", survey.getId(), "imageFilename", newFilename);
  }

  @DeleteMapping("/{surveyId}/image")
  public ResponseEntity<Void> deleteSurveyImage(@PathVariable Long surveyId)
    throws IOException {
    Survey survey = surveyService.findById(surveyId);

    String filename = survey.getImageFilename();

    if (filename != null && !filename.isBlank()) {
      surveyImageService.delete(filename);

      survey.setImageFilename(null);
      surveyService.save(survey);
    }

    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{surveyId}/copy")
  public Map<String, Object> copySurvey(
    @PathVariable Long surveyId,
    @AuthenticationPrincipal OidcUser oidcUser
  ) {
    Survey source = surveyService.findById(surveyId);

    User currentUser = userService.findOrCreate(oidcUser);

    Survey copy = new Survey();

    copy.setTitle("Copy of " + source.getTitle());
    copy.setCreator(currentUser);
    copy.setStatus(SurveyStatus.DEVELOPMENT);
    copy.setEverPublished(false);

    copy = surveyService.save(copy);

    for (Question sourceQuestion : source.getQuestions()) {
      Question copiedQuestion = switch (sourceQuestion.getType()) {
        case SCHEDULING -> {
          SchedulingQuestion sourceScheduling =
            (SchedulingQuestion) sourceQuestion;

          SchedulingQuestion targetScheduling = new SchedulingQuestion();

          copyQuestionFields(sourceScheduling, targetScheduling, copy);

          for (SchedulingOption sourceOption : sourceScheduling.getOptions()) {
            SchedulingOption targetOption = new SchedulingOption();

            targetOption.setQuestion(targetScheduling);
            targetOption.setDate(sourceOption.getDate());
            targetOption.setDateTime(sourceOption.getDateTime());

            targetScheduling.getOptions().add(targetOption);
          }

          yield targetScheduling;
        }
        case SHORT_TEXT -> {
          ShortTextQuestion targetShortText = new ShortTextQuestion();

          copyQuestionFields(sourceQuestion, targetShortText, copy);

          yield targetShortText;
        }
        case RELATIONSHIP -> {
          RelationshipQuestion sourceRelationship =
            (RelationshipQuestion) sourceQuestion;

          RelationshipQuestion targetRelationship = new RelationshipQuestion();

          copyQuestionFields(sourceRelationship, targetRelationship, copy);

          for (RelationshipSubject sourceSubject : sourceRelationship.getSubjects()) {
            RelationshipSubject targetSubject = new RelationshipSubject();

            targetSubject.setQuestion(targetRelationship);
            targetSubject.setName(sourceSubject.getName());
            targetSubject.setDescription(sourceSubject.getDescription());
            targetSubject.setDisplayOrder(sourceSubject.getDisplayOrder());

            targetRelationship.getSubjects().add(targetSubject);
          }

          yield targetRelationship;
        }
        case
          SINGLE_SELECT,
          MULTI_SELECT -> throw new UnsupportedOperationException(
          "Copy not implemented for question type: " + sourceQuestion.getType()
        );
      };

      questionService.save(copiedQuestion);
    }

    for (SurveyAssignment sourceAssignment : surveyAssignmentService.findBySurveyId(
      source.getId()
    )) {
      SurveyAssignment copiedAssignment = new SurveyAssignment();

      copiedAssignment.setSurvey(copy);

      copiedAssignment.setUser(sourceAssignment.getUser());

      copiedAssignment.setRequired(sourceAssignment.isRequired());

      surveyAssignmentService.save(copiedAssignment);
    }

    return Map.of("id", copy.getId(), "title", copy.getTitle());
  }

  private void copyQuestionFields(
    Question source,
    Question target,
    Survey survey
  ) {
    target.setSurvey(survey);
    target.setPrompt(source.getPrompt());
    target.setDisplayOrder(source.getDisplayOrder());
    target.setType(source.getType());
    target.setRequired(source.isRequired());
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
  @Transactional
  public Map<String, Object> deleteSurvey(
    @PathVariable Long surveyId,
    Authentication authentication
  ) {
    boolean isAdmin = authentication
      .getAuthorities()
      .stream()
      .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"));

    if (!isAdmin) {
      throw new IllegalStateException(
        "Only administrators can delete surveys."
      );
    }

    Survey survey = surveyService.findById(surveyId);

    surveyAssignmentService.deleteBySurveyId(surveyId);

    surveyParticipantService.deleteBySurveyId(surveyId);

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
    ShortTextQuestion question = (ShortTextQuestion) questionService.findById(
      questionId
    );

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    question.setPrompt((String) request.get("prompt"));
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

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
    question.setRequired(Boolean.TRUE.equals(request.get("required")));

    question = (ShortTextQuestion) questionService.save(question);

    return Map.of(
      "id",
      question.getId(),
      "prompt",
      question.getPrompt(),
      "required",
      question.isRequired()
    );
  }

@GetMapping("/{surveyId}/questions/{questionId}/answers/short-text/{userId}")
public List<Map<String, Object>> getShortTextAnswersForUser(
  @PathVariable Long surveyId,
  @PathVariable Long questionId,
  @PathVariable Long userId
) {
  ShortTextQuestion question =
    (ShortTextQuestion) questionService.findById(questionId);

  if (!question.getSurvey().getId().equals(surveyId)) {
    throw new IllegalArgumentException(
      "Question does not belong to survey: " + surveyId
    );
  }

  return shortTextAnswerService
    .findByQuestionIdAndUserId(questionId, userId)
    .stream()
    .map(answer -> {
      Map<String, Object> result = new HashMap<>();

      result.put("answerId", answer.getId());
      result.put("userId", answer.getUser().getId());
      result.put("username", answer.getUser().getUsername());
      result.put("name", answer.getUser().getDisplayName());
      result.put("value", answer.getValue());

      return result;
    })
    .toList();
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
          "answerId",
          answer.getId(),
          "userId",
          answer.getUser().getId(),
          "username",
          answer.getUser().getUsername(),
          "name",
          answer.getUser().getDisplayName(),
          "value",
          answer.getValue()
        )
      )
      .toList();
  }

  private boolean isSurveyCompletedForUser(Survey survey, User user) {
    List<Question> requiredQuestions = survey
      .getQuestions()
      .stream()
      .filter(Question::isRequired)
      .toList();

    if (!requiredQuestions.isEmpty()) {
      return requiredQuestions
        .stream()
        .allMatch(question ->
          switch (question.getType()) {
            case SCHEDULING -> schedulingAnswerService.hasAnswered(
              question.getId(),
              user.getId()
            );
            case SHORT_TEXT -> shortTextAnswerService.hasAnswered(
              question.getId(),
              user.getId()
            );
            case RELATIONSHIP -> relationshipAnswerService
              .findByQuestionIdAndUserId(question.getId(), user.getId())
              .stream()
              .anyMatch(
                answer ->
                  (answer.getLikeScore() != null &&
                    answer.getLikeScore() != 0) ||
                  (answer.getTrustScore() != null &&
                    answer.getTrustScore() != 0)
              );
            case SINGLE_SELECT, MULTI_SELECT -> false;
          }
        );
    }

    return survey
      .getQuestions()
      .stream()
      .anyMatch(question ->
        switch (question.getType()) {
          case SCHEDULING -> schedulingAnswerService.hasAnswered(
            question.getId(),
            user.getId()
          );
          case SHORT_TEXT -> shortTextAnswerService.hasAnswered(
            question.getId(),
            user.getId()
          );
          case RELATIONSHIP -> relationshipAnswerService
            .findByQuestionIdAndUserId(question.getId(), user.getId())
            .stream()
            .anyMatch(
              answer ->
                (answer.getLikeScore() != null && answer.getLikeScore() != 0) ||
                (answer.getTrustScore() != null &&
                  answer.getTrustScore() != 0) ||
                (answer.getComment() != null && !answer.getComment().isBlank())
            );
          case SINGLE_SELECT, MULTI_SELECT -> false;
        }
      );
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/relationship")
  @Transactional
  public Map<String, Object> answerRelationshipQuestion(
    @PathVariable Long surveyId,
    @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, Object> request
  ) {
    RelationshipQuestion question =
      (RelationshipQuestion) questionService.findById(questionId);

    if (!question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException(
        "Question does not belong to survey: " + surveyId
      );
    }

    Survey survey = surveyService.findById(surveyId);

    if (survey.getStatus() != SurveyStatus.OPEN) {
      throw new IllegalStateException("Survey is not open for responses.");
    }

    User user = userService.findOrCreate(oidcUser);

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> responses = (List<
      Map<String, Object>
    >) request.get("responses");

    if (responses == null) {
      responses = List.of();
    }

    boolean hasRating = false;

    // Validate the entire submission before deleting any existing answers.
    for (Map<String, Object> response : responses) {
      Object subjectIdValue = response.get("subjectId");

      if (!(subjectIdValue instanceof Number subjectIdNumber)) {
        throw new IllegalArgumentException(
          "Relationship response is missing a valid subjectId."
        );
      }

      Long subjectId = subjectIdNumber.longValue();

      RelationshipSubject subject = relationshipAnswerService.findSubjectById(
        subjectId
      );

      if (!subject.getQuestion().getId().equals(question.getId())) {
        throw new IllegalArgumentException(
          "Relationship subject does not belong to question: " + questionId
        );
      }

      Integer likeScore = null;
      Integer trustScore = null;

      Object likeValue = response.get("likeScore");
      Object trustValue = response.get("trustScore");

      if (likeValue instanceof Number number) {
        likeScore = number.intValue();
      } else if (likeValue != null) {
        throw new IllegalArgumentException(
          "Like score must be a number between -5 and 5."
        );
      }

      if (trustValue instanceof Number number) {
        trustScore = number.intValue();
      } else if (trustValue != null) {
        throw new IllegalArgumentException(
          "Trust score must be a number between -5 and 5."
        );
      }

      if (likeScore != null && (likeScore < -5 || likeScore > 5)) {
        throw new IllegalArgumentException(
          "Like score must be between -5 and 5."
        );
      }

      if (trustScore != null && (trustScore < -5 || trustScore > 5)) {
        throw new IllegalArgumentException(
          "Trust score must be between -5 and 5."
        );
      }

      String comment = (String) response.get("comment");

      if (comment != null && comment.length() > 500) {
        throw new IllegalArgumentException(
          "Comment cannot exceed 500 characters."
        );
      }

      if (
        (likeScore != null && likeScore != 0) ||
        (trustScore != null && trustScore != 0)
      ) {
        hasRating = true;
      }
    }

    if (question.isRequired() && !hasRating) {
      throw new IllegalArgumentException(
        "This question requires at least one Like or Trust rating."
      );
    }

    surveyParticipantService.add(survey, user);

    relationshipAnswerService.deleteForUserAndQuestion(
      question.getId(),
      user.getId()
    );

    int saved = 0;

    for (Map<String, Object> response : responses) {
      Long subjectId = ((Number) response.get("subjectId")).longValue();

      RelationshipSubject subject = relationshipAnswerService.findSubjectById(
        subjectId
      );

      Integer likeScore =
        response.get("likeScore") == null
          ? null
          : ((Number) response.get("likeScore")).intValue();

      Integer trustScore =
        response.get("trustScore") == null
          ? null
          : ((Number) response.get("trustScore")).intValue();

      String comment = (String) response.get("comment");

      if (comment == null) {
        comment = "";
      }

      comment = comment.trim();

      // Completely blank rows do not create answer records.
      // Zero means "No opinion". Rows with no rating and no comment are not stored.
      if (
        (likeScore == null || likeScore == 0) &&
        (trustScore == null || trustScore == 0) &&
        comment.isBlank()
      ) {
        continue;
      }

      RelationshipAnswer answer = new RelationshipAnswer();

      answer.setQuestion(question);
      answer.setUser(user);
      answer.setSubject(subject);
      answer.setLikeScore(likeScore);
      answer.setTrustScore(trustScore);
      answer.setComment(comment);

      relationshipAnswerService.save(answer);
      saved++;
    }

    return Map.of(
      "questionId",
      question.getId(),
      "userId",
      user.getId(),
      "responseCount",
      saved
    );
  }
}
