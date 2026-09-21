package org.eiredrake.tentacles.service;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.stream.Stream;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.SurveyParticipant;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.repository.SurveyParticipantRepository;
import org.eiredrake.tentacles.repository.AnswerRepository;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SurveyParticipantService {

    private final SurveyParticipantRepository repository;

    private final SurveyAssignmentService assignments;
    private final AnswerRepository answers;
    private final SurveyService surveys;
    private final QuestionCompletionService completion;

    public SurveyParticipantService(SurveyParticipantRepository repository, SurveyAssignmentService assignments, AnswerRepository answers, SurveyService surveys, QuestionCompletionService completion) {
        this.repository = repository;
        this.assignments = assignments;
        this.answers = answers;
        this.surveys = surveys;
        this.completion = completion;
    }

    public record ParticipantView(Long id, Long userId, String username, String name, boolean required, boolean completed, boolean responded) {}

    @Transactional(readOnly = true)
    public List<ParticipantView> findForView(Long surveyId) {
        Survey survey = surveys.findById(surveyId);
        var users = new LinkedHashMap<Long, User>();
        var assigned = new LinkedHashMap<Long, SurveyAssignment>();
        var responded = new HashSet<Long>();
        for (SurveyAssignment assignment : assignments.findBySurveyId(surveyId)) {
            User user = assignment.getUser();
            users.put(user.getId(), user);
            assigned.put(user.getId(), assignment);
        }
        // Include saved answers even when an older submission has no participation record.
        var respondents = Stream.concat(findBySurveyId(surveyId).stream().map(SurveyParticipant::getUser), answers.findRespondentsBySurveyId(surveyId).stream());
        respondents.forEach(user -> {
            users.putIfAbsent(user.getId(), user);
            responded.add(user.getId());
        });
        return users.values().stream().map(user -> {
            SurveyAssignment assignment = assigned.get(user.getId());
            return new ParticipantView(assignment == null ? null : assignment.getId(), user.getId(), user.getUsername(), user.getDisplayName(), assignment != null && assignment.isRequired(), completion.isSurveyCompleted(survey, user), responded.contains(user.getId()));
        }).toList();
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

    @Transactional
    public void deleteBySurveyId(Long surveyId) {
        repository.deleteBySurveyId(
            surveyId
        );
    }    
}