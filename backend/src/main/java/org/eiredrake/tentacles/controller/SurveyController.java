package org.eiredrake.tentacles.controller;

import java.io.IOException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import org.eiredrake.tentacles.model.MeetupQuestion;
import org.eiredrake.tentacles.model.MeetupAnswer;
import org.eiredrake.tentacles.repository.MeetupAnswerRepository;
import org.eiredrake.tentacles.service.MeetupAvailabilityService;
import java.util.UUID;
import org.eiredrake.tentacles.event.SurveyAdminEvent;
import org.springframework.context.ApplicationEventPublisher;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import org.eiredrake.tentacles.model.PointAllocationQuestion;
import org.eiredrake.tentacles.model.PointAllocationOption;
import org.eiredrake.tentacles.model.PointAllocationAnswer;
import org.eiredrake.tentacles.repository.PointAllocationAnswerRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import org.eiredrake.tentacles.model.RankedChoiceQuestion;
import org.eiredrake.tentacles.model.RankedChoiceOption;
import org.eiredrake.tentacles.model.RankedChoiceAnswer;
import org.eiredrake.tentacles.repository.RankedChoiceAnswerRepository;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.model.NominationQuestion;
import org.eiredrake.tentacles.model.NominationAnswer;
import org.eiredrake.tentacles.model.CanonicalNomination;
import org.eiredrake.tentacles.service.NominationAnswerService;
import org.eiredrake.tentacles.service.CanonicalNominationService;
import org.eiredrake.tentacles.model.QuestionType;
import org.eiredrake.tentacles.model.RelationshipAnswer;
import org.eiredrake.tentacles.model.RelationshipQuestion;
import org.eiredrake.tentacles.model.RelationshipSubject;
import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.eiredrake.tentacles.model.SchedulingOption;
import org.eiredrake.tentacles.model.SchedulingQuestion;
import org.eiredrake.tentacles.model.ShortTextAnswer;
import org.eiredrake.tentacles.model.ShortTextQuestion;
import org.eiredrake.tentacles.model.SingleSelectQuestion;
import org.eiredrake.tentacles.model.SingleSelectOption;
import org.eiredrake.tentacles.model.SingleSelectAnswer;
import org.eiredrake.tentacles.service.SingleSelectAnswerService;
import org.eiredrake.tentacles.model.MultiSelectQuestion;
import org.eiredrake.tentacles.model.MultiSelectOption;
import org.eiredrake.tentacles.model.MultiSelectAnswer;
import org.eiredrake.tentacles.service.MultiSelectAnswerService;
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
import org.eiredrake.tentacles.service.ImageAttachmentService;
import org.eiredrake.tentacles.model.AttachmentOwner;
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

  private final org.eiredrake.tentacles.service.QuestionCompletionService questionCompletion;
  private final org.eiredrake.tentacles.rewards.RewardService rewards;
  private final ImageAttachmentService imageAttachments;
  private final ApplicationEventPublisher eventPublisher;
  private final SurveyService surveyService;
  private final UserService userService;
  private final QuestionService questionService;
  private final SchedulingAnswerService schedulingAnswerService;
  private final SurveyParticipantService surveyParticipantService;
  private final SurveyAssignmentService surveyAssignmentService;
  private final ShortTextAnswerService shortTextAnswerService;
  private final RelationshipAnswerService relationshipAnswerService;
  private final SurveyImageService surveyImageService;
  private final SingleSelectAnswerService singleSelectAnswerService;
  private final MultiSelectAnswerService multiSelectAnswerService;
  private final NominationAnswerService nominationAnswerService;
  private final CanonicalNominationService canonicalNominationService;
  private final RankedChoiceAnswerRepository rankedChoiceAnswers;
  private final MeetupAnswerRepository meetupAnswers;
  private final PointAllocationAnswerRepository pointAllocationAnswers;
  private final MeetupAvailabilityService meetupAvailability;

  public SurveyController(
    SurveyService surveyService,
    UserService userService,
    QuestionService questionService,
    SchedulingAnswerService schedulingAnswerService,
    SurveyParticipantService surveyParticipantService,
    SurveyAssignmentService surveyAssignmentService,
    ShortTextAnswerService shortTextAnswerService,
    RelationshipAnswerService relationshipAnswerService,
    SurveyImageService surveyImageService,
    SingleSelectAnswerService singleSelectAnswerService,
    MultiSelectAnswerService multiSelectAnswerService,
    NominationAnswerService nominationAnswerService,
    CanonicalNominationService canonicalNominationService,
    RankedChoiceAnswerRepository rankedChoiceAnswers,
    MeetupAnswerRepository meetupAnswers,
    PointAllocationAnswerRepository pointAllocationAnswers,
    MeetupAvailabilityService meetupAvailability,
    ApplicationEventPublisher eventPublisher,
    ImageAttachmentService imageAttachments,
    org.eiredrake.tentacles.service.QuestionCompletionService questionCompletion,
    org.eiredrake.tentacles.rewards.RewardService rewards
  ) {
    this.questionCompletion = questionCompletion;
    this.rewards = rewards;
    this.eventPublisher = eventPublisher;
    this.imageAttachments = imageAttachments;
    this.surveyService = surveyService;
    this.userService = userService;
    this.questionService = questionService;
    this.schedulingAnswerService = schedulingAnswerService;
    this.surveyParticipantService = surveyParticipantService;
    this.surveyAssignmentService = surveyAssignmentService;
    this.shortTextAnswerService = shortTextAnswerService;
    this.relationshipAnswerService = relationshipAnswerService;
    this.surveyImageService = surveyImageService;
    this.singleSelectAnswerService = singleSelectAnswerService;
    this.multiSelectAnswerService = multiSelectAnswerService;
    this.nominationAnswerService = nominationAnswerService;
    this.canonicalNominationService = canonicalNominationService;
    this.rankedChoiceAnswers = rankedChoiceAnswers;
    this.meetupAnswers = meetupAnswers;
    this.pointAllocationAnswers = pointAllocationAnswers;
    this.meetupAvailability = meetupAvailability;
  }

  public record SubmissionNotice(UUID submissionId) {}

  @PostMapping("/{surveyId}/submitted")
  @Transactional
  public Map<String, Object> submitted(@PathVariable Long surveyId, @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody SubmissionNotice request, Authentication authentication) {
    if (request.submissionId() == null) throw new IllegalArgumentException("Submission ID is required.");
    Survey survey = surveyService.findById(surveyId);
    if (!surveyService.isManuallyAcceptingResponses(survey)) {
      throw new IllegalStateException("Survey is not open for responses.");
    }
    User user = userService.findOrCreate(oidcUser);
    boolean isAdmin = authentication.getAuthorities().stream().anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"));
    if (!isAdmin && !surveyAssignmentService.findBySurveyId(surveyId).isEmpty() && !surveyAssignmentService.isAssigned(surveyId, user.getId())) {
      throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN);
    }
    boolean participated = surveyParticipantService.findBySurveyId(surveyId).stream()
      .anyMatch(participant -> participant.getUser().getId().equals(user.getId()));
    if (!participated || (survey.getQuestions().stream().anyMatch(Question::isRequired) && !isSurveyCompletedForUser(survey, user))) {
      throw new IllegalArgumentException("Save the survey responses before confirming submission.");
    }
    rewards.award(survey, user);
    String name = user.getDisplayName();
    if (name == null || name.isBlank()) name = user.getUsername();
    String eventId = surveyId + ":" + user.getId() + ":" + request.submissionId();
    eventPublisher.publishEvent(new SurveyAdminEvent(eventId, surveyId, "submission.saved", Instant.now(),
      Map.of("userId", user.getId(), "userName", name, "surveyTitle", survey.getTitle())));
    return Map.of("submissionId", request.submissionId(), "saved", true);
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

        SurveyService.ResponseAvailability availability = surveyService.responseAvailability(survey);
        SurveyStatus effectiveStatus = availability.effectiveStatus();
        boolean active = switch (effectiveStatus) {
          case DEVELOPMENT, OPEN -> true;
          case CLOSED, PUBLISHED -> false;
        };

        Map<String, Object> result = new HashMap<>();

        result.put("id", survey.getId());
        result.put("active", active);
        result.put("title", survey.getTitle());
        result.put("tagline", survey.getTagline());
        result.put("creatorId", survey.getCreator().getId());
        result.put("creatorName", survey.getCreator().getDisplayName());
        result.put("questionCount", survey.getQuestions().size());
        result.put("status", effectiveStatus.name());
        result.put("statusIcon", effectiveStatus.getIcon());
        result.put("required", required);
        result.put("everPublished", survey.isEverPublished());
        result.put("imageFilename", survey.getImageFilename());
        result.put("completed", completed);
        result.put("acceptingResponses", availability.acceptingResponses());
        result.put("closureReason", availability.closureReason() == null ? null : availability.closureReason().name());
        result.put("autoCloseAt", survey.getAutoCloseAt());
        result.put("autoCloseParticipantCount", survey.getAutoCloseParticipantCount());

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
  @Transactional
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

    Map<Long, RelationshipSubject> existing = question.getSubjects().stream()
      .collect(java.util.stream.Collectors.toMap(RelationshipSubject::getId, subject -> subject));
    List<RelationshipSubject> updated = new java.util.ArrayList<>();
    java.util.Set<Long> retained = new java.util.HashSet<>();
    for (int i = 0; i < subjects.size(); i++) {
      Map<String, Object> input = subjects.get(i);
      RelationshipSubject subject = new RelationshipSubject();
      if (input.get("id") != null) {
        if (!(input.get("id") instanceof Number number) || number.doubleValue() != number.longValue()
          || !retained.add(number.longValue()) || !existing.containsKey(number.longValue())) {
          throw new IllegalArgumentException("Character does not belong to this question.");
        }
        subject = existing.get(number.longValue());
      }
      subject.setQuestion(question);
      subject.setName((String) input.get("name"));
      subject.setDescription((String) input.get("description"));
      subject.setDisplayOrder(i);
      updated.add(subject);
    }
    relationshipAnswerService.deleteForQuestion(question.getId());
    for (RelationshipSubject removed : existing.values()) {
      if (!retained.contains(removed.getId())) imageAttachments.remove(surveyId, AttachmentOwner.RELATIONSHIP_SUBJECT, removed.getId());
    }
    question.getSubjects().removeIf(subject -> !updated.contains(subject));
    for (RelationshipSubject subject : updated) {
      if (!question.getSubjects().contains(subject)) question.getSubjects().add(subject);
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
      question.getSubjects().size(),
      "subjects", question.getSubjects().stream().map(subject -> Map.of(
        "id", subject.getId(), "displayOrder", subject.getDisplayOrder())).toList()
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
      question.getSubjects().size(),
      "subjects", question.getSubjects().stream().map(subject -> Map.of(
        "id", subject.getId(), "displayOrder", subject.getDisplayOrder())).toList()
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

    if (question instanceof SingleSelectQuestion singleSelectQuestion) {
      SingleSelectOption defaultOption = singleSelectQuestion.getDefaultOption();
      if (defaultOption != null) result.put("defaultOptionId", defaultOption.getId());
      result.put("options", singleSelectQuestion.getOptions().stream()
        .map(option -> Map.<String, Object>of("id", option.getId(), "label", option.getLabel()))
        .toList());
    }

    if (question instanceof NominationQuestion nomination) {
      result.put("maxNominations", nomination.getMaxNominations());
    }

    if (question instanceof PointAllocationQuestion allocation) {
      result.put("pointBudget", allocation.getPointBudget());
      result.put("options", allocation.getOptions().stream()
        .map(option -> Map.of("id", option.getId(), "label", option.getLabel())).toList());
    }
    if (question instanceof RankedChoiceQuestion rankedChoiceQuestion) {
      result.put("options", rankedChoiceQuestion.getOptions().stream().map(this::rankedChoiceOptionResult).toList());
    }
    if (question instanceof MultiSelectQuestion multiSelectQuestion) {
      result.put("options", multiSelectQuestion.getOptions().stream()
        .map(option -> Map.<String, Object>of("id", option.getId(), "label", option.getLabel()))
        .toList());
    }

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
  @Transactional
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

    surveyService.requireAcceptingResponses(surveyId);

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
  @Transactional
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

    surveyService.requireAcceptingResponses(surveyId);

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
  public List<SurveyParticipantService.ParticipantView> getParticipants(@PathVariable Long surveyId) {
    return surveyParticipantService.findForView(surveyId);
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

    SurveyAssignment assignment = surveyAssignmentService.addSelection(surveyId,
      java.util.Set.of(user.getId()), java.util.Set.of(), required).getFirst();

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

  @PostMapping("/{surveyId}/tagline")
  public Map<String, Object> updateTagline(
      @PathVariable Long surveyId,
      @RequestBody Map<String, String> request) {
      Survey survey = surveyService.findById(surveyId);

      String tagline = request.get("tagline");

      if (tagline != null) {
          tagline = tagline.trim();

          if (tagline.length() > 255) {
              throw new IllegalArgumentException("Survey tagline cannot exceed 255 characters.");
          }

          if (tagline.isBlank()) {
              tagline = null;
          }
      }

      survey.setTagline(tagline);
      surveyService.save(survey);

      return Map.of(
          "id", survey.getId(),
          "tagline", survey.getTagline() == null ? "" : survey.getTagline()
      );
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
  @Transactional
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
        case SINGLE_SELECT, YES_NO_ABSTAIN -> {
          SingleSelectQuestion target = new SingleSelectQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          for (SingleSelectOption sourceOption : ((SingleSelectQuestion) sourceQuestion).getOptions()) {
            SingleSelectOption option = new SingleSelectOption();
            option.setQuestion(target);
            option.setLabel(sourceOption.getLabel());
            target.getOptions().add(option);
          }
          yield target;
        }
        case NOMINATION -> {
          NominationQuestion target = new NominationQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          target.setMaxNominations(((NominationQuestion) sourceQuestion).getMaxNominations());
          yield target;
        }
        case MEETUP -> {
          MeetupQuestion target = new MeetupQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          yield target;
        }
        case POINT_ALLOCATION -> {
          PointAllocationQuestion target = new PointAllocationQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          target.setPointBudget(((PointAllocationQuestion) sourceQuestion).getPointBudget());
          addPointAllocationOptions(target, ((PointAllocationQuestion) sourceQuestion).getOptions().stream()
            .map(PointAllocationOption::getLabel).toList());
          yield target;
        }
        case RANKED_CHOICE -> {
          RankedChoiceQuestion target = new RankedChoiceQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          for (RankedChoiceOption sourceOption : ((RankedChoiceQuestion) sourceQuestion).getOptions()) {
            RankedChoiceOption option = new RankedChoiceOption();
            option.setQuestion(target);
            option.setName(sourceOption.getName());
            option.setDescription(sourceOption.getDescription());
            option.setDisplayOrder(sourceOption.getDisplayOrder());
            target.getOptions().add(option);
          }
          yield target;
        }
        case MULTI_SELECT -> {
          MultiSelectQuestion target = new MultiSelectQuestion();
          copyQuestionFields(sourceQuestion, target, copy);
          for (MultiSelectOption sourceOption : ((MultiSelectQuestion) sourceQuestion).getOptions()) {
            MultiSelectOption option = new MultiSelectOption();
            option.setQuestion(target);
            option.setLabel(sourceOption.getLabel());
            target.getOptions().add(option);
          }
          yield target;
        }
      };

      copiedQuestion = questionService.save(copiedQuestion);
      imageAttachments.copyQuestion(sourceQuestion, copiedQuestion);
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

  @PostMapping("/{surveyId}/auto-close")
  public Map<String, Object> updateAutomaticClosing(@PathVariable Long surveyId,
    @RequestBody Map<String, String> request) {
    Survey survey = surveyService.findById(surveyId);
    survey.setAutoCloseAt(parseAutoCloseAt(request.get("closeAt")));
    survey.setAutoCloseParticipantCount(parseAutoCloseParticipantCount(request.get("participantCount")));
    surveyService.save(survey);
    Map<String, Object> result = new HashMap<>();
    result.put("id", survey.getId());
    result.put("autoCloseAt", survey.getAutoCloseAt());
    result.put("autoCloseParticipantCount", survey.getAutoCloseParticipantCount());
    return result;
  }

  private Instant parseAutoCloseAt(String value) {
    if (value == null || value.isBlank()) return null;
    try {
      return Instant.parse(value);
    } catch (DateTimeParseException error) {
      throw new IllegalArgumentException("Choose a valid closing date and time.");
    }
  }

  private Integer parseAutoCloseParticipantCount(String value) {
    if (value == null || value.isBlank()) return null;
    try {
      int count = Integer.parseInt(value);
      if (count < 1) throw new IllegalArgumentException("Participant count must be a positive whole number.");
      return count;
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException("Participant count must be a positive whole number.");
    }
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
    return questionCompletion.isSurveyCompleted(survey, user);
  }

  @PostMapping("/{surveyId}/questions/single-select")
  @Transactional
  public Map<String, Object> createSingleSelectQuestion(@PathVariable Long surveyId,
    @RequestBody Map<String, Object> request) {
    return createSingleSelectQuestion(surveyId, request, QuestionType.SINGLE_SELECT);
  }

  @PostMapping("/{surveyId}/questions/yes-no-abstain")
  @Transactional
  public Map<String, Object> createYesNoAbstainQuestion(@PathVariable Long surveyId,
    @RequestBody Map<String, Object> request) {
    return createSingleSelectQuestion(surveyId, request, QuestionType.YES_NO_ABSTAIN);
  }

  private Map<String, Object> createSingleSelectQuestion(Long surveyId, Map<String, Object> request, QuestionType type) {
    String prompt = questionPrompt(request);
    List<String> labels = type == QuestionType.YES_NO_ABSTAIN ? SingleSelectQuestion.YES_NO_ABSTAIN_OPTIONS : selectLabels(request);
    SingleSelectQuestion question = new SingleSelectQuestion();
    question.setSurvey(surveyService.findById(surveyId));
    question.setType(type);
    question.setPrompt(prompt);
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    question.setDisplayOrder((Integer) request.getOrDefault("displayOrder", 1));
    addSingleSelectOptions(question, labels);
    question = (SingleSelectQuestion) questionService.save(question);
    return Map.of("id", question.getId(), "optionCount", question.getOptions().size());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/yes-no-abstain")
  @Transactional
  public Map<String, Object> updateYesNoAbstainQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @RequestBody Map<String, Object> request) {
    SingleSelectQuestion question = findSingleSelectQuestion(surveyId, questionId);
    if (question.getType() != QuestionType.YES_NO_ABSTAIN) throw new IllegalArgumentException("Not a Yes/No/Abstain question.");
    Map<String, Object> settings = new HashMap<>(request);
    settings.put("options", SingleSelectQuestion.YES_NO_ABSTAIN_OPTIONS);
    return updateSingleSelectQuestion(surveyId, questionId, settings);
  }

  @PostMapping("/{surveyId}/questions/{questionId}/single-select")
  @Transactional
  public Map<String, Object> updateSingleSelectQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @RequestBody Map<String, Object> request) {
    List<String> labels = selectLabels(request);
    SingleSelectQuestion question = findSingleSelectQuestion(surveyId, questionId);
    if (question.getType() == QuestionType.YES_NO_ABSTAIN && !labels.equals(SingleSelectQuestion.YES_NO_ABSTAIN_OPTIONS)) {
      throw new IllegalArgumentException("Yes/No/Abstain choices cannot be changed.");
    }
    boolean optionsChanged = !question.getOptions().stream().map(SingleSelectOption::getLabel).toList().equals(labels);
    if (optionsChanged) {
      singleSelectAnswerService.deleteForQuestion(questionId);
      question.getOptions().clear();
      addSingleSelectOptions(question, labels);
    }
    question.setPrompt(((String) request.get("prompt")).trim());
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    questionService.save(question);
    return Map.of("id", question.getId(), "responsesCleared", optionsChanged);
  }

  private String questionPrompt(Map<String, Object> request) {
    if (!(request.get("prompt") instanceof String prompt) || prompt.isBlank() || prompt.trim().length() > 255) {
      throw new IllegalArgumentException("Enter a question of at most 255 characters.");
    }
    return prompt.trim();
  }

  private List<String> selectLabels(Map<String, Object> request) {
    questionPrompt(request);
    if (!(request.get("options") instanceof List<?> options) || options.isEmpty()) {
      throw new IllegalArgumentException("Add at least one option.");
    }
    return options.stream().map(value -> {
      if (!(value instanceof String label) || label.isBlank() || label.trim().length() > 255) {
        throw new IllegalArgumentException("Each option needs a label of at most 255 characters.");
      }
      return label.trim();
    }).toList();
  }

  private void addSingleSelectOptions(SingleSelectQuestion question, List<String> labels) {
    for (String label : labels) {
      SingleSelectOption option = new SingleSelectOption();
      option.setQuestion(question);
      option.setLabel(label);
      question.getOptions().add(option);
    }
  }

  private SingleSelectQuestion findSingleSelectQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof SingleSelectQuestion singleSelect) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Single Select question does not belong to survey: " + surveyId);
    }
    return singleSelect;
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/single-select")
  @Transactional
  public Map<String, Object> answerSingleSelectQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, Object> request) {
    SingleSelectQuestion question = findSingleSelectQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    surveyService.requireAcceptingResponses(surveyId);
    Object value = request.get("optionId");
    SingleSelectOption option = question.getDefaultOption();
    if (value != null) {
      long optionId = wholeNumber(value, "Choose one valid option.");
      option = question.getOptions().stream().filter(item -> item.getId().equals(optionId))
        .findFirst().orElseThrow(() -> new IllegalArgumentException("Option does not belong to question: " + questionId));
    } else if (question.isRequired() && option == null) {
      throw new IllegalArgumentException("This question requires one selection.");
    }
    User user = userService.findOrCreate(oidcUser);
    surveyParticipantService.add(survey, user);
    singleSelectAnswerService.deleteForUserAndQuestion(questionId, user.getId());
    if (option != null) {
      SingleSelectAnswer answer = new SingleSelectAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(option);
      singleSelectAnswerService.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "responseCount", option == null ? 0 : 1);
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/single-select")
  public List<Map<String, Object>> getSingleSelectAnswers(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findSingleSelectQuestion(surveyId, questionId);
    return singleSelectAnswerService.findByQuestionId(questionId).stream().map(this::singleSelectAnswerResult).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/single-select/{userId}")
  public List<Map<String, Object>> getSingleSelectAnswersForUser(@PathVariable Long surveyId,
    @PathVariable Long questionId, @PathVariable Long userId) {
    findSingleSelectQuestion(surveyId, questionId);
    return singleSelectAnswerService.findByQuestionIdAndUserId(questionId, userId).stream()
      .map(this::singleSelectAnswerResult).toList();
  }

  private Map<String, Object> singleSelectAnswerResult(SingleSelectAnswer answer) {
    return Map.of("answerId", answer.getId(), "userId", answer.getUser().getId(),
      "name", answer.getUser().getDisplayName(), "username", answer.getUser().getUsername(),
      "optionId", answer.getOption().getId(), "label", answer.getOption().getLabel());
  }


  @PostMapping("/{surveyId}/questions/nomination")
  @Transactional
  public Map<String, Object> createNominationQuestion(@PathVariable Long surveyId, @RequestBody Map<String, Object> request) {
    NominationQuestion question = new NominationQuestion();
    applyNominationSettings(question, request);
    question.setSurvey(surveyService.findById(surveyId));
    question.setType(QuestionType.NOMINATION);
    question.setDisplayOrder((Integer) request.getOrDefault("displayOrder", 1));
    question = (NominationQuestion) questionService.save(question);
    return Map.of("id", question.getId());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/nomination")
  @Transactional
  public Map<String, Object> updateNominationQuestion(@PathVariable Long surveyId, @PathVariable Long questionId,
    @RequestBody Map<String, Object> request) {
    NominationQuestion question = findNominationQuestion(surveyId, questionId);
    applyNominationSettings(question, request);
    // Settings edits preserve existing nominations; the new limit applies on the next submission.
    questionService.save(question);
    return Map.of("id", question.getId());
  }

  private void applyNominationSettings(NominationQuestion question, Map<String, Object> request) {
    if (!(request.get("prompt") instanceof String prompt) || prompt.isBlank() || prompt.trim().length() > 255) {
      throw new IllegalArgumentException("Enter a question of 1 to 255 characters.");
    }
    Object maximum = request.getOrDefault("maxNominations", 0);
    if (!(maximum instanceof Number number) || number.doubleValue() != number.intValue() || number.intValue() < 0) {
      throw new IllegalArgumentException("Maximum nominations must be a non-negative whole number; 0 means unlimited.");
    }
    question.setPrompt(prompt.trim());
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    question.setMaxNominations(number.intValue());
  }

  private NominationQuestion findNominationQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof NominationQuestion nomination) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Nomination question does not belong to survey: " + surveyId);
    }
    return nomination;
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/nomination")
  @Transactional
  public Map<String, Object> answerNominationQuestion(@PathVariable Long surveyId, @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser, @RequestBody Map<String, Object> request, Authentication authentication) {
    NominationQuestion question = findNominationQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    try {
      surveyService.requireAcceptingResponses(surveyId);
    } catch (IllegalStateException error) {
      throw new org.springframework.web.server.ResponseStatusException(
        org.springframework.http.HttpStatus.CONFLICT, error.getMessage());
    }
    if (!request.containsKey("nominations") && !request.containsKey("canonicalIds")) {
      throw new IllegalArgumentException("Submit a list of nominations.");
    }
    if (request.containsKey("nominations") && !(request.get("nominations") instanceof List<?>)) {
      throw new IllegalArgumentException("Submit a list of nominations.");
    }
    List<?> values = request.get("nominations") instanceof List<?> list ? list : List.of();
    List<String> nominations = values.stream().map(value -> {
      if (!(value instanceof String text) || text.isBlank() || text.trim().length() > 255) {
        throw new IllegalArgumentException("Each nomination must contain 1 to 255 characters.");
      }
      return text.trim();
    }).toList();
    User user = userService.findOrCreate(oidcUser);
    boolean admin = authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    if (!admin && !surveyAssignmentService.findBySurveyId(surveyId).isEmpty() && !surveyAssignmentService.isAssigned(surveyId, user.getId())) {
      throw new org.springframework.security.access.AccessDeniedException("You are not assigned to this survey.");
    }
    surveyParticipantService.add(survey, user);
    Map<Long, CanonicalNomination> selected = new LinkedHashMap<>();
    Object selectedIds = request.get("canonicalIds");
    if (selectedIds != null && !(selectedIds instanceof List<?>)) {
      throw new IllegalArgumentException("Selected nominations must be a list.");
    }
    if (selectedIds instanceof List<?> ids) for (Object value : ids) {
      if (!(value instanceof Number number)) throw new IllegalArgumentException("Invalid nomination selection.");
      CanonicalNomination canonical = canonicalNominationService.findById(number.longValue());
      if (!canonical.getQuestion().getId().equals(questionId)) throw new IllegalArgumentException("Invalid nomination selection.");
      selected.put(canonical.getId(), canonical);
    }
    Map<Long, String> typed = new LinkedHashMap<>();
    for (String value : nominations) {
      CanonicalNomination canonical = canonicalNominationService.resolve(question, value);
      selected.put(canonical.getId(), canonical); typed.putIfAbsent(canonical.getId(), value);
    }
    if (question.isRequired() && selected.isEmpty()) throw new IllegalArgumentException("This question requires at least one nomination.");
    if (question.getMaxNominations() > 0 && selected.size() > question.getMaxNominations()) {
      throw new IllegalArgumentException("Too many nominations. Maximum: " + question.getMaxNominations());
    }
    List<NominationAnswer> existing = nominationAnswerService.findByQuestionIdAndUserId(questionId, user.getId());
    Set<Long> retained = new HashSet<>();
    for (NominationAnswer answer : existing) {
      CanonicalNomination canonical = answer.getCanonicalNomination();
      if (canonical != null && selected.containsKey(canonical.getId())) retained.add(canonical.getId());
      else nominationAnswerService.delete(answer);
    }
    for (CanonicalNomination canonical : selected.values()) if (!retained.contains(canonical.getId())) {
      NominationAnswer answer = new NominationAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setNomination(typed.getOrDefault(canonical.getId(), canonical.getDisplayName()));
      answer.setCanonicalNomination(canonical);
      nominationAnswerService.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "responseCount", selected.size());
  }

  @GetMapping("/{surveyId}/questions/{questionId}/nomination-pool")
  public List<Map<String, Object>> nominationPool(@PathVariable Long surveyId, @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser) {
    findNominationQuestion(surveyId, questionId);
    User user = userService.findOrCreate(oidcUser);
    List<NominationAnswer> answers = nominationAnswerService.findByQuestionId(questionId);
    Map<String, Map<String, Object>> pool = new LinkedHashMap<>();
    for (CanonicalNomination canonical : canonicalNominationService.findByQuestionId(questionId)) {
      pool.put("canonical:" + canonical.getId(), nominationPoolEntry(canonical.getDisplayName(), canonical.getId(), false));
    }
    for (NominationAnswer answer : answers) {
      CanonicalNomination canonical = answer.getCanonicalNomination();
      String key = canonical == null ? "raw:" + canonicalNominationService.normalize(answer.getNomination())
        : "canonical:" + canonical.getId();
      Map<String, Object> entry = pool.computeIfAbsent(key,
        ignored -> nominationPoolEntry(canonical == null ? answer.getNomination() : canonical.getDisplayName(),
          canonical == null ? null : canonical.getId(), false));
      if (answer.getUser().getId().equals(user.getId())) entry.put("selected", true);
    }
    return new ArrayList<>(pool.values());
  }

  private Map<String, Object> nominationPoolEntry(String displayName, Long canonicalId, boolean selected) {
    Map<String, Object> entry = new HashMap<>();
    entry.put("displayName", displayName); entry.put("canonicalId", canonicalId); entry.put("selected", selected);
    return entry;
  }

  @GetMapping("/{surveyId}/questions/{questionId}/canonical-nominations")
  public Map<String, Object> canonicalNominations(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findNominationQuestion(surveyId, questionId);
    List<NominationAnswer> answers = nominationAnswerService.findByQuestionId(questionId);
    List<Map<String, Object>> canonicals = canonicalNominationService.findByQuestionId(questionId).stream().map(value -> {
      List<Map<String, Object>> members = answers.stream().filter(answer -> answer.getCanonicalNomination() != null
        && answer.getCanonicalNomination().getId().equals(value.getId())).map(this::nominationAnswerResult).toList();
      long count = members.stream().map(member -> member.get("userId")).distinct().count();
      return Map.<String, Object>of("id", value.getId(), "displayName", value.getDisplayName(), "count", count,
        "answers", members);
    }).toList();
    return Map.of("canonicalNominations", canonicals, "answers", answers.stream().map(this::nominationAnswerResult).toList());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/canonical-nominations")
  @Transactional
  public Map<String, Object> createCanonicalNomination(@PathVariable Long surveyId, @PathVariable Long questionId,
    @RequestBody Map<String, Object> request) {
    requireSelectedNominations(request.get("answerIds"));
    CanonicalNomination canonical = new CanonicalNomination();
    canonical.setQuestion(findNominationQuestion(surveyId, questionId));
    canonical.setDisplayName(canonicalDisplayName(request.get("displayName")));
    canonical = canonicalNominationService.save(canonical);
    assignCanonicalAnswers(questionId, request.get("answerIds"), canonical);
    return Map.of("id", canonical.getId(), "displayName", canonical.getDisplayName());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/canonical-nominations/{canonicalId}")
  @Transactional
  public Map<String, Object> updateCanonicalNomination(@PathVariable Long surveyId, @PathVariable Long questionId,
    @PathVariable Long canonicalId, @RequestBody Map<String, Object> request) {
    findNominationQuestion(surveyId, questionId);
    CanonicalNomination canonical = canonicalNominationService.findById(canonicalId);
    if (!canonical.getQuestion().getId().equals(questionId)) throw new IllegalArgumentException("Canonical nomination does not belong to this question.");
    if (request.containsKey("displayName")) canonical.setDisplayName(canonicalDisplayName(request.get("displayName")));
    assignCanonicalAnswers(questionId, request.get("answerIds"), canonical);
    canonicalNominationService.save(canonical);
    return Map.of("id", canonical.getId(), "displayName", canonical.getDisplayName());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/canonical-nominations/unassign")
  @Transactional
  public Map<String, Object> unassignCanonicalNominations(@PathVariable Long surveyId, @PathVariable Long questionId,
    @RequestBody Map<String, Object> request) {
    findNominationQuestion(surveyId, questionId);
    requireSelectedNominations(request.get("answerIds"));
    assignCanonicalAnswers(questionId, request.get("answerIds"), null);
    return Map.of("unassigned", true);
  }

  private String canonicalDisplayName(Object value) {
    if (!(value instanceof String name) || name.isBlank() || name.trim().length() > 255) {
      throw new IllegalArgumentException("Canonical nomination must contain 1 to 255 characters.");
    }
    return name.trim();
  }

  private void assignCanonicalAnswers(Long questionId, Object value, CanonicalNomination canonical) {
    if (value == null) return;
    if (!(value instanceof List<?> values)) throw new IllegalArgumentException("Selected nominations must be a list.");
    if (values.isEmpty()) return;
    Map<Long, NominationAnswer> answers = nominationAnswerService.findByQuestionId(questionId).stream()
      .collect(java.util.stream.Collectors.toMap(NominationAnswer::getId, answer -> answer));
    for (Object entry : values) {
      if (!(entry instanceof Number number) || !answers.containsKey(number.longValue())) {
        throw new IllegalArgumentException("Selected nomination does not belong to this question.");
      }
      NominationAnswer answer = answers.get(number.longValue());
      answer.setCanonicalNomination(canonical);
      nominationAnswerService.save(answer);
    }
  }

  private void requireSelectedNominations(Object value) {
    if (!(value instanceof List<?> values) || values.isEmpty()) {
      throw new IllegalArgumentException("Select at least one nomination.");
    }
  }

  @GetMapping("/{surveyId}/questions/{questionId}/nomination-results")
  public List<Map<String, Object>> nominationResults(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findNominationQuestion(surveyId, questionId);
    List<NominationAnswer> answers = nominationAnswerService.findByQuestionId(questionId);
    Map<String, List<NominationAnswer>> groups = new LinkedHashMap<>();
    for (NominationAnswer answer : answers) {
      String key = answer.getCanonicalNomination() == null ? "raw:" + canonicalNominationService.normalize(answer.getNomination())
        : "canonical:" + answer.getCanonicalNomination().getId();
      groups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(answer);
    }
    return groups.values().stream().map(group -> {
      NominationAnswer first = group.getFirst();
      String displayName = first.getCanonicalNomination() == null ? first.getNomination()
        : first.getCanonicalNomination().getDisplayName();
      long count = group.stream().map(answer -> answer.getUser().getId()).distinct().count();
      return Map.<String, Object>of("displayName", displayName, "count", count,
        "answers", group.stream().map(this::nominationAnswerResult).toList());
    }).toList();
  }
  @GetMapping("/{surveyId}/questions/{questionId}/answers/nomination")
  public List<Map<String, Object>> getNominationAnswers(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findNominationQuestion(surveyId, questionId);
    return nominationAnswerService.findByQuestionId(questionId).stream().map(this::nominationAnswerResult).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/nomination/{userId}")
  public List<Map<String, Object>> getNominationAnswersForUser(@PathVariable Long surveyId, @PathVariable Long questionId,
    @PathVariable Long userId) {
    findNominationQuestion(surveyId, questionId);
    return nominationAnswerService.findByQuestionIdAndUserId(questionId, userId).stream().map(this::nominationAnswerResult).toList();
  }

  private Map<String, Object> nominationAnswerResult(NominationAnswer answer) {
    User user = answer.getUser();
    Map<String, Object> result = new HashMap<>();
    result.put("answerId", answer.getId());
    result.put("userId", user.getId());
    result.put("username", user.getUsername());
    result.put("name", user.getDisplayName() == null ? user.getUsername() : user.getDisplayName());
    result.put("value", answer.getNomination());
    CanonicalNomination canonical = answer.getCanonicalNomination();
    result.put("canonicalId", canonical == null ? null : canonical.getId());
    result.put("canonicalDisplayName", canonical == null ? null : canonical.getDisplayName());
    return result;
  }

  private MeetupQuestion findMeetupQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof MeetupQuestion meetup) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Meetup question does not belong to survey: " + surveyId);
    }
    return meetup;
  }

  @PostMapping({"/{surveyId}/questions/meetup", "/{surveyId}/questions/{questionId}/meetup"})
  @Transactional
  public Map<String, Object> saveMeetupQuestion(@PathVariable Long surveyId,
    @PathVariable(required = false) Long questionId, @RequestBody Map<String, Object> request) {
    String prompt = questionPrompt(request);
    MeetupQuestion question = questionId == null ? new MeetupQuestion() : findMeetupQuestion(surveyId, questionId);
    if (questionId == null) {
      question.setSurvey(surveyService.findById(surveyId));
      question.setType(QuestionType.MEETUP);
      question.setDisplayOrder((Integer) request.getOrDefault("displayOrder", 1));
    }
    question.setPrompt(prompt);
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    questionService.save(question);
    return Map.of("id", question.getId());
  }

  private Instant meetupDateTime(Object value) {
    if (value instanceof String text) {
      try {
        OffsetDateTime dateTime = OffsetDateTime.parse(text);
        if (dateTime.getSecond() == 0 && dateTime.getNano() == 0) return dateTime.toInstant();
      } catch (DateTimeParseException ignored) { }
    }
    throw new IllegalArgumentException("Choose valid dates and times to the nearest minute, including a time-zone offset.");
  }

  private record MeetupEntry(Instant dateTime, Instant endDateTime) {}

  private MeetupEntry meetupEntry(Object value) {
    // Retain the original point-only request format for already-open clients.
    if (value instanceof String) return new MeetupEntry(meetupDateTime(value), null);
    if (!(value instanceof Map<?, ?> entry)) throw new IllegalArgumentException("Submit a date/time or availability window.");
    Instant start = meetupDateTime(entry.get("dateTime"));
    Instant end = entry.get("endDateTime") == null ? null : meetupDateTime(entry.get("endDateTime"));
    if (end != null && !end.isAfter(start)) throw new IllegalArgumentException("Availability must end after it starts.");
    return new MeetupEntry(start, end);
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/meetup")
  @Transactional
  public Map<String, Object> answerMeetupQuestion(@PathVariable Long surveyId, @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser, @RequestBody Map<String, Object> request) {
    MeetupQuestion question = findMeetupQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    surveyService.requireAcceptingResponses(surveyId);
    if (!(request.get("dateTimes") instanceof List<?> values)) {
      throw new IllegalArgumentException("Submit a list of available dates and times.");
    }
    List<MeetupEntry> dates = values.stream().map(this::meetupEntry).distinct().toList();
    if (question.isRequired() && dates.isEmpty()) throw new IllegalArgumentException("Add at least one available date and time.");
    User user = userService.findOrCreate(oidcUser);
    surveyParticipantService.add(survey, user);
    meetupAnswers.deleteByQuestionIdAndUserId(questionId, user.getId());
    meetupAnswers.flush();
    for (MeetupEntry date : dates) {
      MeetupAnswer answer = new MeetupAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setDateTime(date.dateTime());
      answer.setEndDateTime(date.endDateTime());
      meetupAnswers.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "responseCount", dates.size());
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/meetup/{userId}")
  public List<Map<String, Object>> getMeetupAnswersForUser(@PathVariable Long surveyId,
    @PathVariable Long questionId, @PathVariable Long userId) {
    findMeetupQuestion(surveyId, questionId);
    return meetupAnswers.findByQuestionIdAndUserIdOrderByDateTimeAsc(questionId, userId).stream()
      .map(answer -> {
        Map<String, Object> result = new HashMap<>();
        result.put("answerId", answer.getId());
        result.put("dateTime", answer.getDateTime());
        result.put("endDateTime", answer.getEndDateTime());
        return result;
      }).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/results/meetup")
  public Map<String, Object> getMeetupResults(@PathVariable Long surveyId, @PathVariable Long questionId) {
    MeetupQuestion question = findMeetupQuestion(surveyId, questionId);
    SurveyStatus status = question.getSurvey().getStatus();
    boolean available = status == SurveyStatus.CLOSED || status == SurveyStatus.PUBLISHED;
    return Map.of("available", available, "results", available ? meetupAvailability.results(questionId) : List.of());
  }

  private PointAllocationQuestion findPointAllocationQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof PointAllocationQuestion allocation) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Point Allocation question does not belong to survey: " + surveyId);
    }
    return allocation;
  }

  private void addPointAllocationOptions(PointAllocationQuestion question, List<String> labels) {
    for (String label : labels) {
      PointAllocationOption option = new PointAllocationOption();
      option.setQuestion(question);
      option.setLabel(label);
      question.getOptions().add(option);
    }
  }

  @PostMapping({"/{surveyId}/questions/point-allocation", "/{surveyId}/questions/{questionId}/point-allocation"})
  @Transactional
  public Map<String, Object> savePointAllocationQuestion(@PathVariable Long surveyId,
    @PathVariable(required = false) Long questionId, @RequestBody Map<String, Object> request) {
    List<String> labels = selectLabels(request);
    long budget = wholeNumber(request.get("pointBudget"), "Enter a positive whole-number point budget.");
    if (budget < 1 || budget > Integer.MAX_VALUE) throw new IllegalArgumentException("Point budget must be between 1 and " + Integer.MAX_VALUE + ".");
    PointAllocationQuestion question = questionId == null ? new PointAllocationQuestion() : findPointAllocationQuestion(surveyId, questionId);
    boolean optionsChanged = !question.getOptions().stream().map(PointAllocationOption::getLabel).toList().equals(labels);
    boolean responsesCleared = questionId != null && (optionsChanged || question.getPointBudget() != budget);
    if (responsesCleared) {
      pointAllocationAnswers.deleteByQuestionId(questionId);
      pointAllocationAnswers.flush();
    }
    if (questionId == null) {
      question.setSurvey(surveyService.findById(surveyId));
      question.setType(QuestionType.POINT_ALLOCATION);
      question.setDisplayOrder((Integer) request.getOrDefault("displayOrder", 1));
    }
    if (optionsChanged) {
      question.getOptions().clear();
      addPointAllocationOptions(question, labels);
    }
    question.setPointBudget((int) budget);
    question.setPrompt(((String) request.get("prompt")).trim());
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    questionService.save(question);
    return Map.of("id", question.getId(), "responsesCleared", responsesCleared);
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/point-allocation")
  @Transactional
  public Map<String, Object> answerPointAllocationQuestion(@PathVariable Long surveyId, @PathVariable Long questionId,
    @AuthenticationPrincipal OidcUser oidcUser, @RequestBody Map<String, Object> request) {
    PointAllocationQuestion question = findPointAllocationQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    surveyService.requireAcceptingResponses(surveyId);
    if (!(request.get("allocations") instanceof List<?> entries)) throw new IllegalArgumentException("Submit a list of point allocations.");
    Map<Long, Integer> allocations = new HashMap<>();
    long total = 0;
    for (Object entry : entries) {
      if (!(entry instanceof Map<?, ?> allocation)) throw new IllegalArgumentException("Each allocation needs a category and points.");
      long optionId = wholeNumber(allocation.get("optionId"), "Choose a valid category.");
      if (allocations.containsKey(optionId) || question.getOptions().stream().noneMatch(option -> option.getId().equals(optionId))) {
        throw new IllegalArgumentException("Each category must belong to this question and appear only once.");
      }
      long points = wholeNumber(allocation.get("points"), "Points must be non-negative whole numbers.");
      if (points < 0 || points > question.getPointBudget()) throw new IllegalArgumentException("Points must be within the question budget.");
      allocations.put(optionId, (int) points);
      total += points;
      if (total > question.getPointBudget()) throw new IllegalArgumentException("The total exceeds the point budget.");
    }
    if (question.isRequired() && total == 0) throw new IllegalArgumentException("Assign at least one point to answer this question.");
    User user = userService.findOrCreate(oidcUser);
    surveyParticipantService.add(survey, user);
    pointAllocationAnswers.deleteByQuestionIdAndUserId(questionId, user.getId());
    pointAllocationAnswers.flush();
    if (total > 0) for (PointAllocationOption option : question.getOptions()) {
      PointAllocationAnswer answer = new PointAllocationAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(option);
      answer.setPoints(allocations.getOrDefault(option.getId(), 0));
      pointAllocationAnswers.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "pointsAssigned", total);
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/point-allocation")
  public List<Map<String, Object>> getPointAllocationAnswers(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findPointAllocationQuestion(surveyId, questionId);
    return pointAllocationAnswers.findByQuestionIdOrderByUserIdAscOptionIdAsc(questionId).stream()
      .map(this::pointAllocationAnswerResult).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/point-allocation/{userId}")
  public List<Map<String, Object>> getPointAllocationAnswersForUser(@PathVariable Long surveyId,
    @PathVariable Long questionId, @PathVariable Long userId) {
    findPointAllocationQuestion(surveyId, questionId);
    return pointAllocationAnswers.findByQuestionIdAndUserIdOrderByOptionIdAsc(questionId, userId).stream()
      .map(this::pointAllocationAnswerResult).toList();
  }

  private Map<String, Object> pointAllocationAnswerResult(PointAllocationAnswer answer) {
    return Map.of("answerId", answer.getId(), "userId", answer.getUser().getId(),
      "optionId", answer.getOption().getId(), "points", answer.getPoints());
  }

  private long wholeNumber(Object value, String error) {
    if (!(value instanceof Number number) || number.doubleValue() != number.longValue()) {
      throw new IllegalArgumentException(error);
    }
    return number.longValue();
  }

  private RankedChoiceOption rankedChoiceOption(RankedChoiceQuestion question, Object value, HashSet<Long> ids) {
    long id = wholeNumber(value, "Each candidate must have a valid ID.");
    if (!ids.add(id)) throw new IllegalArgumentException("Each candidate ID must be unique.");
    return question.getOptions().stream().filter(option -> option.getId().equals(id)).findFirst()
      .orElseThrow(() -> new IllegalArgumentException("Candidate does not belong to this question."));
  }

  private Map<String, Object> rankedChoiceOptionResult(RankedChoiceOption option) {
    return Map.of("id", option.getId(), "name", option.getName(), "description", option.getDescription(),
      "displayOrder", option.getDisplayOrder());
  }

  private RankedChoiceQuestion findRankedChoiceQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof RankedChoiceQuestion ranked) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Ranked Choice question does not belong to survey: " + surveyId);
    }
    return ranked;
  }

  // Validate the complete definition before changing managed entities or removing responses.
  private boolean updateRankedChoiceOptions(RankedChoiceQuestion question, Object value) {
    if (!(value instanceof List<?> values) || values.isEmpty()) {
      throw new IllegalArgumentException("Add at least one candidate.");
    }
    List<RankedChoiceOption> ordered = new ArrayList<>();
    List<String> names = new ArrayList<>();
    List<String> descriptions = new ArrayList<>();
    HashSet<Long> ids = new HashSet<>();
    for (Object entry : values) {
      if (!(entry instanceof Map<?, ?> candidate) || !(candidate.get("name") instanceof String name)
          || name.isBlank() || name.trim().length() > 255) {
        throw new IllegalArgumentException("Each candidate needs a name of at most 255 characters.");
      }
      Object description = candidate.get("description");
      if (description != null && (!(description instanceof String) || ((String) description).length() > 255)) {
        throw new IllegalArgumentException("Candidate descriptions must be at most 255 characters.");
      }
      RankedChoiceOption option;
      if (candidate.get("id") == null) {
        option = new RankedChoiceOption();
        option.setQuestion(question);
      } else {
        option = rankedChoiceOption(question, candidate.get("id"), ids);
      }
      ordered.add(option);
      names.add(name.trim());
      descriptions.add(description == null ? "" : ((String) description).trim());
    }
    boolean changed = ordered.size() != question.getOptions().size() || !question.getOptions().containsAll(ordered);
    if (changed && question.getId() != null) {
      rankedChoiceAnswers.deleteByQuestionId(question.getId());
      rankedChoiceAnswers.flush();
    }
    question.getOptions().removeIf(option -> !ordered.contains(option));
    for (int i = 0; i < ordered.size(); i++) {
      RankedChoiceOption option = ordered.get(i);
      option.setName(names.get(i));
      option.setDescription(descriptions.get(i));
      option.setDisplayOrder(i + 1);
      if (!question.getOptions().contains(option)) question.getOptions().add(option);
    }
    question.getOptions().sort(java.util.Comparator.comparing(RankedChoiceOption::getDisplayOrder));
    return changed;
  }

  @PostMapping("/{surveyId}/questions/ranked-choice")
  @Transactional
  public Map<String, Object> createRankedChoiceQuestion(@PathVariable Long surveyId,
    @RequestBody Map<String, Object> request) {
    String prompt = questionPrompt(request);
    RankedChoiceQuestion question = new RankedChoiceQuestion();
    question.setSurvey(surveyService.findById(surveyId));
    question.setType(QuestionType.RANKED_CHOICE);
    question.setPrompt(prompt);
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    question.setDisplayOrder((Integer) request.getOrDefault("displayOrder", 1));
    updateRankedChoiceOptions(question, request.get("options"));
    questionService.save(question);
    return Map.of("id", question.getId(), "optionCount", question.getOptions().size());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/ranked-choice")
  @Transactional
  public Map<String, Object> updateRankedChoiceQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @RequestBody Map<String, Object> request) {
    String prompt = questionPrompt(request);
    RankedChoiceQuestion question = findRankedChoiceQuestion(surveyId, questionId);
    boolean changed = updateRankedChoiceOptions(question, request.get("options"));
    question.setPrompt(prompt);
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    questionService.save(question);
    return Map.of("id", questionId, "responsesCleared", changed);
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/ranked-choice")
  @Transactional
  public Map<String, Object> answerRankedChoiceQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, Object> request) {
    RankedChoiceQuestion question = findRankedChoiceQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    surveyService.requireAcceptingResponses(surveyId);
    if (!(request.get("optionIds") instanceof List<?> values)) {
      throw new IllegalArgumentException("Submit candidate IDs in preference order.");
    }
    HashSet<Long> ids = new HashSet<>();
    List<RankedChoiceOption> ordered = values.stream().map(value -> rankedChoiceOption(question, value, ids)).toList();
    if (question.isRequired() && ordered.isEmpty()) throw new IllegalArgumentException("Rank at least one candidate.");
    User user = userService.findOrCreate(oidcUser);
    surveyParticipantService.add(survey, user);
    rankedChoiceAnswers.deleteByQuestionIdAndUserId(questionId, user.getId());
    rankedChoiceAnswers.flush();
    for (int i = 0; i < ordered.size(); i++) {
      RankedChoiceAnswer answer = new RankedChoiceAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(ordered.get(i));
      answer.setPreferenceRank(i + 1);
      rankedChoiceAnswers.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "responseCount", ordered.size());
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/ranked-choice")
  public List<Map<String, Object>> getRankedChoiceAnswers(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findRankedChoiceQuestion(surveyId, questionId);
    return rankedChoiceAnswers.findByQuestionIdOrderByUserIdAscPreferenceRankAsc(questionId).stream()
      .map(this::rankedChoiceAnswerResult).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/ranked-choice/{userId}")
  public List<Map<String, Object>> getRankedChoiceAnswersForUser(@PathVariable Long surveyId,
    @PathVariable Long questionId, @PathVariable Long userId) {
    findRankedChoiceQuestion(surveyId, questionId);
    return rankedChoiceAnswers.findByQuestionIdAndUserIdOrderByPreferenceRankAsc(questionId, userId).stream()
      .map(this::rankedChoiceAnswerResult).toList();
  }

  private Map<String, Object> rankedChoiceAnswerResult(RankedChoiceAnswer answer) {
    User user = answer.getUser();
    return Map.of("answerId", answer.getId(), "userId", user.getId(), "username", user.getUsername(),
      "name", user.getDisplayName() == null ? user.getUsername() : user.getDisplayName(),
      "optionId", answer.getOption().getId(), "rank", answer.getPreferenceRank());
  }

  @PostMapping("/{surveyId}/questions/multi-select")
  @Transactional
  public Map<String, Object> createMultiSelectQuestion(@PathVariable Long surveyId,
    @RequestBody Map<String, Object> request) {
    List<String> labels = selectLabels(request);
    MultiSelectQuestion question = new MultiSelectQuestion();
    question.setSurvey(surveyService.findById(surveyId));
    question.setType(QuestionType.MULTI_SELECT);
    question.setPrompt(((String) request.get("prompt")).trim());
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    question.setDisplayOrder((Integer) request.get("displayOrder"));
    addMultiSelectOptions(question, labels);
    question = (MultiSelectQuestion) questionService.save(question);
    return Map.of("id", question.getId(), "optionCount", question.getOptions().size());
  }

  @PostMapping("/{surveyId}/questions/{questionId}/multi-select")
  @Transactional
  public Map<String, Object> updateMultiSelectQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @RequestBody Map<String, Object> request) {
    List<String> labels = selectLabels(request);
    MultiSelectQuestion question = findMultiSelectQuestion(surveyId, questionId);
    boolean optionsChanged = !question.getOptions().stream().map(MultiSelectOption::getLabel).toList().equals(labels);
    if (optionsChanged) {
      multiSelectAnswerService.deleteForQuestion(questionId);
      question.getOptions().clear();
      addMultiSelectOptions(question, labels);
    }
    question.setPrompt(((String) request.get("prompt")).trim());
    question.setRequired(Boolean.TRUE.equals(request.get("required")));
    questionService.save(question);
    return Map.of("id", question.getId(), "responsesCleared", optionsChanged);
  }

  private void addMultiSelectOptions(MultiSelectQuestion question, List<String> labels) {
    for (String label : labels) {
      MultiSelectOption option = new MultiSelectOption();
      option.setQuestion(question);
      option.setLabel(label);
      question.getOptions().add(option);
    }
  }

  private MultiSelectQuestion findMultiSelectQuestion(Long surveyId, Long questionId) {
    Question question = questionService.findById(questionId);
    if (!(question instanceof MultiSelectQuestion multiSelect) || !question.getSurvey().getId().equals(surveyId)) {
      throw new IllegalArgumentException("Multi Select question does not belong to survey: " + surveyId);
    }
    return multiSelect;
  }

  @PostMapping("/{surveyId}/questions/{questionId}/answers/multi-select")
  @Transactional
  public Map<String, Object> answerMultiSelectQuestion(@PathVariable Long surveyId,
    @PathVariable Long questionId, @AuthenticationPrincipal OidcUser oidcUser,
    @RequestBody Map<String, Object> request) {
    MultiSelectQuestion question = findMultiSelectQuestion(surveyId, questionId);
    Survey survey = question.getSurvey();
    surveyService.requireAcceptingResponses(surveyId);
    if (!(request.get("optionIds") instanceof List<?> values)) {
      throw new IllegalArgumentException("Submit a list of selected option IDs.");
    }
    // Validate every selection before replacing any existing answers.
    List<MultiSelectOption> selected = values.stream().map(value -> {
      long optionId = wholeNumber(value, "Each selection must be a valid option ID.");
      return question.getOptions().stream().filter(option -> option.getId().equals(optionId))
        .findFirst().orElseThrow(() -> new IllegalArgumentException("Option does not belong to question: " + questionId));
    }).distinct().toList();
    if (question.isRequired() && selected.isEmpty()) {
      throw new IllegalArgumentException("This question requires at least one selection.");
    }
    User user = userService.findOrCreate(oidcUser);
    surveyParticipantService.add(survey, user);
    multiSelectAnswerService.deleteForUserAndQuestion(questionId, user.getId());
    for (MultiSelectOption option : selected) {
      MultiSelectAnswer answer = new MultiSelectAnswer();
      answer.setQuestion(question);
      answer.setUser(user);
      answer.setOption(option);
      multiSelectAnswerService.save(answer);
    }
    return Map.of("questionId", questionId, "userId", user.getId(), "responseCount", selected.size());
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/multi-select")
  public List<Map<String, Object>> getMultiSelectAnswers(@PathVariable Long surveyId, @PathVariable Long questionId) {
    findMultiSelectQuestion(surveyId, questionId);
    return multiSelectAnswerService.findByQuestionId(questionId).stream().map(this::multiSelectAnswerResult).toList();
  }

  @GetMapping("/{surveyId}/questions/{questionId}/answers/multi-select/{userId}")
  public List<Map<String, Object>> getMultiSelectAnswersForUser(@PathVariable Long surveyId,
    @PathVariable Long questionId, @PathVariable Long userId) {
    findMultiSelectQuestion(surveyId, questionId);
    return multiSelectAnswerService.findByQuestionIdAndUserId(questionId, userId).stream()
      .map(this::multiSelectAnswerResult).toList();
  }

  private Map<String, Object> multiSelectAnswerResult(MultiSelectAnswer answer) {
    return Map.of("answerId", answer.getId(), "userId", answer.getUser().getId(),
      "name", answer.getUser().getDisplayName(), "username", answer.getUser().getUsername(),
      "optionId", answer.getOption().getId(), "label", answer.getOption().getLabel());
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

    surveyService.requireAcceptingResponses(surveyId);

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
