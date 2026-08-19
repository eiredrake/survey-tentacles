package org.eiredrake.tentacles.service;

import java.util.List;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyParticipant;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.repository.SurveyParticipantRepository;
import org.springframework.stereotype.Service;

@Service
public class SurveyParticipantService {

    private final SurveyParticipantRepository repository;

    public SurveyParticipantService(
            SurveyParticipantRepository repository) {
        this.repository = repository;
    }

    public SurveyParticipant add(Survey survey, User user) {
        return repository.findBySurveyIdAndUserId(
                survey.getId(), user.getId())
            .orElseGet(() -> {
                SurveyParticipant participant =
                    new SurveyParticipant();

                participant.setSurvey(survey);
                participant.setUser(user);

                return repository.save(participant);
            });
    }

    public List<SurveyParticipant> findBySurveyId(Long surveyId) {
        return repository.findBySurveyId(surveyId);
    }
}