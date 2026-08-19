package org.eiredrake.tentacles.repository;

import java.util.List;
import java.util.Optional;

import org.eiredrake.tentacles.model.SurveyParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SurveyParticipantRepository
        extends JpaRepository<SurveyParticipant, Long> {

    List<SurveyParticipant> findBySurveyId(Long surveyId);

    Optional<SurveyParticipant> findBySurveyIdAndUserId(
        Long surveyId,
        Long userId
    );
}