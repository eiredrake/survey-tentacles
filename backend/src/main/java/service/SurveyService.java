package org.eiredrake.tentacles.service;

import java.time.Instant;
import java.util.List;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyStatus;
import org.eiredrake.tentacles.repository.AnswerRepository;
import org.eiredrake.tentacles.repository.SurveyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SurveyService {

    private final SurveyRepository surveyRepository;
    private final AnswerRepository answers;
    private final ImageAttachmentService attachments;

    public SurveyService(SurveyRepository surveyRepository, AnswerRepository answers,
        ImageAttachmentService attachments) {
        this.attachments = attachments;
        this.answers = answers;
        this.surveyRepository = surveyRepository;
    }

    public Survey save(Survey survey) {
        return surveyRepository.save(survey);
    }

    @Transactional
    public void delete(Survey survey) {
        attachments.removeSurvey(survey.getId());
        surveyRepository.delete(survey);
    }

    public List<Survey> findAll() {
        return surveyRepository.findAll();
    }

    public Survey findById(Long id) {
        return surveyRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Survey not found: " + id));
    }

    public enum ClosureReason { MANUAL, DEADLINE, PARTICIPANT_LIMIT }

    public record ResponseAvailability(
        SurveyStatus effectiveStatus,
        boolean acceptingResponses,
        ClosureReason closureReason
    ) {}

    public boolean isManuallyAcceptingResponses(Survey survey) {
        return survey.getStatus().isAcceptingResponses();
    }

    public ResponseAvailability responseAvailability(Survey survey) {
        SurveyStatus status = survey.getStatus();
        if (!status.isAcceptingResponses()) {
            ClosureReason reason = status == SurveyStatus.CLOSED ? ClosureReason.MANUAL : null;
            return new ResponseAvailability(status, false, reason);
        }
        if (survey.getAutoCloseAt() != null && !survey.getAutoCloseAt().isAfter(Instant.now())) {
            return new ResponseAvailability(SurveyStatus.CLOSED, false, ClosureReason.DEADLINE);
        }
        Integer limit = survey.getAutoCloseParticipantCount();
        if (limit != null && answers.countRespondentsBySurveyId(survey.getId()) >= limit) {
            return new ResponseAvailability(SurveyStatus.CLOSED, false, ClosureReason.PARTICIPANT_LIMIT);
        }
        return new ResponseAvailability(status, true, null);
    }

    public boolean isAcceptingResponses(Survey survey) {
        return responseAvailability(survey).acceptingResponses();
    }

    @Transactional
    public Survey requireAcceptingResponses(Long surveyId) {
        Survey survey = surveyRepository.findForAssignment(surveyId)
            .orElseThrow(() -> new IllegalArgumentException("Survey not found: " + surveyId));
        if (!isAcceptingResponses(survey)) throw new IllegalStateException("Survey is not open for responses.");
        return survey;
    }
}