package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.*;
import org.springframework.stereotype.Service;

@Service
public class QuestionCompletionService {
  private final SchedulingAnswerService schedulingAnswerService;
  private final ShortTextAnswerService shortTextAnswerService;
  private final RelationshipAnswerService relationshipAnswerService;
  private final SingleSelectAnswerService singleSelectAnswerService;
  private final MultiSelectAnswerService multiSelectAnswerService;
  private final NominationAnswerService nominationAnswerService;
  private final RankedChoiceAnswerRepository rankedChoiceAnswers;
  private final MeetupAnswerRepository meetupAnswers;
  private final PointAllocationAnswerRepository pointAllocationAnswers;
  public QuestionCompletionService(
    SchedulingAnswerService schedulingAnswerService, ShortTextAnswerService shortTextAnswerService,
    RelationshipAnswerService relationshipAnswerService, SingleSelectAnswerService singleSelectAnswerService,
    MultiSelectAnswerService multiSelectAnswerService, NominationAnswerService nominationAnswerService,
    RankedChoiceAnswerRepository rankedChoiceAnswers, MeetupAnswerRepository meetupAnswers,
    PointAllocationAnswerRepository pointAllocationAnswers) {
    this.schedulingAnswerService = schedulingAnswerService;
    this.shortTextAnswerService = shortTextAnswerService;
    this.relationshipAnswerService = relationshipAnswerService;
    this.singleSelectAnswerService = singleSelectAnswerService;
    this.multiSelectAnswerService = multiSelectAnswerService;
    this.nominationAnswerService = nominationAnswerService;
    this.rankedChoiceAnswers = rankedChoiceAnswers;
    this.meetupAnswers = meetupAnswers;
    this.pointAllocationAnswers = pointAllocationAnswers;
  }
  public boolean isSurveyCompleted(Survey survey, User user) {
    var required = survey.getQuestions().stream().filter(Question::isRequired).toList();
    return required.isEmpty() ? survey.getQuestions().stream().anyMatch(q -> hasAnswered(q, user))
      : required.stream().allMatch(q -> hasAnswered(q, user));
  }

  public boolean hasAnswered(Question question, User user) {
    return switch (question.getType()) {
      case SCHEDULING -> schedulingAnswerService.hasAnswered(question.getId(), user.getId());
      case SHORT_TEXT -> shortTextAnswerService.hasAnswered(question.getId(), user.getId());
      case RELATIONSHIP -> relationshipAnswerService.findByQuestionIdAndUserId(question.getId(), user.getId()).stream()
        .anyMatch(answer -> (answer.getLikeScore() != null && answer.getLikeScore() != 0)
          || (answer.getTrustScore() != null && answer.getTrustScore() != 0)
          || (!question.isRequired() && answer.getComment() != null && !answer.getComment().isBlank()));
      case SINGLE_SELECT, YES_NO_ABSTAIN -> singleSelectAnswerService.hasAnswered(question.getId(), user.getId());
      case MULTI_SELECT -> multiSelectAnswerService.hasAnswered(question.getId(), user.getId());
      case POINT_ALLOCATION -> pointAllocationAnswers.existsByQuestionIdAndUserId(question.getId(), user.getId());
      case MEETUP -> meetupAnswers.existsByQuestionIdAndUserId(question.getId(), user.getId());
      case RANKED_CHOICE -> rankedChoiceAnswers.existsByQuestionIdAndUserId(question.getId(), user.getId());
      case NOMINATION -> nominationAnswerService.hasAnswered(question.getId(), user.getId());
    };
  }
}
